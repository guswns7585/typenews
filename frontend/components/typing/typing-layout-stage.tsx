"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { useSettingsStore } from "@/stores/use-settings-store";
import {
  useUiStore,
  type DockPlacement,
  type TypingFrameRect,
  type TypingGroupPosition,
} from "@/stores/use-ui-store";

type TypingLayoutStageProps = {
  children: React.ReactNode;
};

type StageSize = {
  width: number;
  height: number;
};

type StageMetrics = StageSize & {
  left: number;
  top: number;
};

type Point = {
  x: number;
  y: number;
};

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type FramePixels = TypingFrameRect;
type FrameInteractionKind = "east" | "south" | "southeast";

type FrameInteraction = {
  kind: FrameInteractionKind;
  startPointer: Point;
  stage: StageSize;
  startFrame: FramePixels;
  currentRect: TypingFrameRect;
  cleanup: () => void;
};

type GroupDrag = {
  startPointer: Point;
  startPosition: Point;
  centerSnapped: boolean;
  currentPosition: Point;
  cleanup: () => void;
};

type DockDrag = {
  grabOffset: Point;
  frameRect: Rect;
  originPlacement: DockPlacement;
  leftOriginSnapZone: boolean;
  snappedPlacement: DockPlacement | null;
  cleanup: () => void;
};

type DockPlacementRebase = {
  frameOffset: Point;
};

const FALLBACK_STAGE: StageSize = { width: 1180, height: 820 };
const BASE_MIN_FRAME_HEIGHT = 440;
const MIN_ASPECT = 1.08;
const MAX_ASPECT = 2.7;
const DOCK_SNAP_RADIUS = 86;
const CENTER_SNAP_RADIUS = 36;
const FRAME_SIZE_SNAP_RANGE = 22;
const DEFAULT_FRAME_RECT: TypingFrameRect = { x: 0, y: 0, width: 0.78, height: 0.48 };
const DOCK_MIN_VISIBLE = 96;
const VIEWPORT_EDGE_GAP = 10;
const PLACEMENT_SPRING = {
  type: "spring",
  stiffness: 235,
  damping: 29,
  mass: 0.96,
} as const;
const CENTER_SNAP_SPRING = {
  type: "spring",
  stiffness: 520,
  damping: 32,
  mass: 0.72,
} as const;
const HANDLE_HOVER_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 30,
  mass: 0.62,
} as const;

const LOAFING_THEMES = new Set([
  "spreadsheet",
  "vscode",
  "terminal",
  "codex",
  "claude",
  "claude-code",
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function stageWithFallback(stage: StageSize) {
  return {
    width: Math.max(stage.width || FALLBACK_STAGE.width, 1),
    height: Math.max(stage.height || FALLBACK_STAGE.height, 1),
  };
}

function frameSizingArea(stage: StageMetrics): StageSize {
  const viewport = viewportSize();
  const documentTop = stage.top + (typeof window === "undefined" ? 0 : window.scrollY);
  return {
    width: Math.max(stage.width || FALLBACK_STAGE.width, 1),
    // 긴 문장 때문에 stage가 늘어난 높이를 프레임 비율 계산에 다시 사용하면
    // 저장된 기본 크기까지 함께 커진다. 문서상 시작점은 스크롤과 무관하므로
    // viewport 기준 top 대신 documentTop으로 고정해 스크롤 중 크기 변화도 막는다.
    height: Math.max(1, viewport.height - documentTop - VIEWPORT_EDGE_GAP),
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function rectFromDom(rect: DOMRect): Rect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function viewportSize() {
  if (typeof window === "undefined") return FALLBACK_STAGE;
  return { width: window.innerWidth, height: window.innerHeight };
}

function clampGroupPosition(position: Point, group: StageSize, stage: StageMetrics): Point {
  const viewport = viewportSize();
  const minX = VIEWPORT_EDGE_GAP - stage.left;
  const maxX = viewport.width - VIEWPORT_EDGE_GAP - group.width - stage.left;
  const minY = 0;
  const maxY = viewport.height - VIEWPORT_EDGE_GAP - group.height - stage.top;

  return {
    x: maxX >= minX ? clamp(position.x, minX, maxX) : (minX + maxX) / 2,
    // 세로 공간이 부족해도 헤더 쪽으로 밀어 올리지 않는다. 남는 높이는 아래로
    // 흐르게 두어 문서 스크롤로 접근할 수 있게 한다.
    y: maxY >= minY ? clamp(position.y, minY, maxY) : minY,
  };
}

function groupPositionFromPercent(
  position: TypingGroupPosition,
  group: StageSize,
  stage: StageMetrics,
) {
  const viewport = viewportSize();
  return clampGroupPosition(
    {
      x: position.x * viewport.width - stage.left - group.width / 2,
      y: position.y * viewport.height - stage.top - group.height / 2,
    },
    group,
    stage,
  );
}

function groupPercentFromPosition(position: Point, group: StageSize, stage: StageMetrics) {
  const viewport = viewportSize();
  return {
    x: clamp((position.x + stage.left + group.width / 2) / viewport.width, 0, 1),
    y: clamp((position.y + stage.top + group.height / 2) / viewport.height, 0, 1),
  };
}

function groupCenterInViewport(position: Point, group: StageSize, stage: StageMetrics) {
  return {
    x: position.x + stage.left + group.width / 2,
    y: position.y + stage.top + group.height / 2,
  };
}

function clampDockVisualPosition(position: Point, size: StageSize): Point {
  const viewport = viewportSize();
  const visibleX = Math.min(DOCK_MIN_VISIBLE, size.width / 2);
  const visibleY = Math.min(DOCK_MIN_VISIBLE, size.height / 2);

  return {
    x: clamp(
      position.x,
      VIEWPORT_EDGE_GAP + visibleX - size.width,
      viewport.width - VIEWPORT_EDGE_GAP - visibleX,
    ),
    y: clamp(
      position.y,
      VIEWPORT_EDGE_GAP + visibleY - size.height,
      viewport.height - VIEWPORT_EDGE_GAP - visibleY,
    ),
  };
}

function dockAnchorsFor(targetRect: Rect): Array<{ placement: DockPlacement; point: Point }> {
  const viewportWidth = typeof window === "undefined" ? FALLBACK_STAGE.width : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? FALLBACK_STAGE.height : window.innerHeight;
  const centerX = targetRect.left + targetRect.width / 2;
  const centerY = targetRect.top + targetRect.height / 2;

  return [
    { placement: "top" as const, point: { x: centerX, y: Math.max(56, targetRect.top - 48) } },
    { placement: "bottom" as const, point: { x: centerX, y: Math.min(viewportHeight - 36, targetRect.bottom + 48) } },
    { placement: "left" as const, point: { x: Math.max(26, targetRect.left - 98), y: centerY } },
    { placement: "right" as const, point: { x: Math.min(viewportWidth - 26, targetRect.right + 98), y: centerY } },
  ];
}

function dockSnapPlacementFor(dockCenter: Point, frameRect: Rect): DockPlacement | null {
  const nearest = dockAnchorsFor(frameRect)
    .map(({ placement, point }) => ({
      placement,
      distance: distance(dockCenter, point),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest && nearest.distance <= DOCK_SNAP_RADIUS ? nearest.placement : null;
}

function frameLimits(stage: StageSize) {
  const { width, height } = stageWithFallback(stage);
  const minHeight = BASE_MIN_FRAME_HEIGHT;
  const maxHeight = Math.max(minHeight, Math.min(820, Math.max(390, height * 0.92)));
  return {
    minWidth: Math.min(620, Math.max(300, width - 20)),
    maxWidth: Math.max(320, width),
    minHeight,
    maxHeight,
    minY: -Math.min(70, height * 0.09),
  };
}

function clampFramePixels(frame: FramePixels, stage: StageSize): FramePixels {
  const limits = frameLimits(stage);
  const width = clamp(frame.width, limits.minWidth, limits.maxWidth);
  let height = clamp(frame.height, limits.minHeight, limits.maxHeight);

  if (width / height > MAX_ASPECT) height = width / MAX_ASPECT;
  if (width / height < MIN_ASPECT) height = width / MIN_ASPECT;
  height = clamp(height, limits.minHeight, limits.maxHeight);

  return {
    x: 0,
    y: 0,
    width,
    height,
  };
}

function resolveFrameRect(
  rect: TypingFrameRect,
  stage: StageSize,
): FramePixels {
  const { width, height } = stageWithFallback(stage);
  return clampFramePixels(
    {
      x: 0,
      y: 0,
      width: rect.width * width,
      height: rect.height * height,
    },
    stage,
  );
}

function normalizeFramePixels(frame: FramePixels, stage: StageSize): TypingFrameRect {
  const { width, height } = stageWithFallback(stage);
  return {
    x: 0,
    y: 0,
    width: frame.width / width,
    height: frame.height / height,
  };
}

function snapFrameSizeToDefault(
  frame: FramePixels,
  stage: StageSize,
  kind: FrameInteractionKind,
) {
  const defaultFrame = resolveFrameRect(DEFAULT_FRAME_RECT, stage);
  const next = { ...frame };

  if (
    (kind === "east" || kind === "southeast")
    && Math.abs(next.width - defaultFrame.width) <= FRAME_SIZE_SNAP_RANGE
  ) {
    next.width = defaultFrame.width;
  }
  if (
    (kind === "south" || kind === "southeast")
    && Math.abs(next.height - defaultFrame.height) <= FRAME_SIZE_SNAP_RANGE
  ) {
    next.height = defaultFrame.height;
  }

  return clampFramePixels(next, stage);
}

function isDockInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(
    "button, a, input, textarea, select, [role='checkbox'], [role='menuitem'], [role='option'], [data-dock-interactive]",
  ));
}

function framePixelsFromInteractionStart(
  rect: TypingFrameRect,
  stage: StageSize,
  frameElement: HTMLDivElement | null,
) {
  const resolved = resolveFrameRect(rect, stage);
  const visibleFrame = frameElement?.getBoundingClientRect();
  if (!visibleFrame) return resolved;

  return clampFramePixels(
    {
      ...resolved,
      width: Math.max(resolved.width, visibleFrame.width),
      height: Math.max(resolved.height, visibleFrame.height),
    },
    stage,
  );
}

export function TypingLayoutStage({ children }: TypingLayoutStageProps) {
  const visualTheme = useSettingsStore((state) => state.visualTheme);
  const directLayoutEnabled = visualTheme === "classic" || visualTheme === "dark";
  const reducedMotion = useReducedMotion();
  const stageRef = useRef<HTMLElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const frameShellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<FrameInteraction | null>(null);
  const groupDragRef = useRef<GroupDrag | null>(null);
  const dockDragRef = useRef<DockDrag | null>(null);
  const dockPlacementRebaseRef = useRef<DockPlacementRebase | null>(null);
  const groupCenterRef = useRef<Point | null>(null);
  const centerSnapAnimationsRef = useRef<Array<{ stop: () => void }>>([]);
  const centerSnapActiveRef = useRef(false);
  const dockPlacement = useUiStore((state) => state.dockPlacement);
  const lastDockPlacementRef = useRef<DockPlacement>(dockPlacement);
  const groupX = useMotionValue(0);
  const groupY = useMotionValue(0);
  const dockX = useMotionValue(0);
  const dockY = useMotionValue(0);
  const typingFrameRect = useUiStore((state) => state.typingFrameRect);
  const typingGroupPosition = useUiStore((state) => state.typingGroupPosition);
  const setDockPlacement = useUiStore((state) => state.setDockPlacement);
  const setTypingFrameRect = useUiStore((state) => state.setTypingFrameRect);
  const setTypingGroupPosition = useUiStore((state) => state.setTypingGroupPosition);
  const [stageMetrics, setStageMetrics] = useState<StageMetrics>({
    ...FALLBACK_STAGE,
    left: 0,
    top: 0,
  });
  const [groupSize, setGroupSize] = useState<StageSize>({ width: 1064, height: 620 });
  const [stageReady, setStageReady] = useState(false);
  const [isGroupDragging, setIsGroupDragging] = useState(false);
  const [isDockDragging, setIsDockDragging] = useState(false);
  const [isMoveHandleHovered, setIsMoveHandleHovered] = useState(false);
  const [isDockHandleHovered, setIsDockHandleHovered] = useState(false);
  const [isCenterSnapped, setIsCenterSnapped] = useState(false);
  const [draftFrameRect, setDraftFrameRect] = useState<TypingFrameRect | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const activeFrameRect = draftFrameRect ?? typingFrameRect;
  const frameStage = useMemo(
    () => frameSizingArea(stageMetrics),
    [stageMetrics],
  );
  const framePixels = useMemo(
    () => resolveFrameRect(activeFrameRect, frameStage),
    [activeFrameRect, frameStage],
  );
  const frameShellStyle = stageReady
    ? ({
        "--typing-frame-height": `${framePixels.height}px`,
        width: `${framePixels.width}px`,
        minHeight: `${framePixels.height}px`,
      } as React.CSSProperties)
    : undefined;

  useLayoutEffect(() => {
    if (!directLayoutEnabled) return undefined;
    const stage = stageRef.current;
    if (!stage) return undefined;

    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setStageMetrics({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
        left: rect.left,
        top: rect.top,
      });
      setStageReady(true);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [directLayoutEnabled]);

  useLayoutEffect(() => {
    if (!directLayoutEnabled) return undefined;
    const group = groupRef.current;
    if (!group) return undefined;

    const measure = () => {
      setGroupSize({
        width: Math.max(1, group.offsetWidth),
        height: Math.max(1, group.offsetHeight),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    return () => observer.disconnect();
  }, [directLayoutEnabled]);

  useEffect(() => {
    lastDockPlacementRef.current = dockPlacement;
  }, [dockPlacement]);

  useLayoutEffect(() => {
    if (!directLayoutEnabled || !stageReady) return;
    if (!isGroupDragging && centerSnapActiveRef.current) return;

    const position = isGroupDragging && groupCenterRef.current
      ? clampGroupPosition(
          {
            x: groupCenterRef.current.x - stageMetrics.left - groupSize.width / 2,
            y: groupCenterRef.current.y - stageMetrics.top - groupSize.height / 2,
          },
          groupSize,
          stageMetrics,
        )
      : groupPositionFromPercent(typingGroupPosition, groupSize, stageMetrics);

    groupX.set(position.x);
    groupY.set(position.y);
    groupCenterRef.current = groupCenterInViewport(position, groupSize, stageMetrics);
  }, [
    directLayoutEnabled,
    dockPlacement,
    groupSize,
    groupX,
    groupY,
    isGroupDragging,
    stageMetrics,
    stageReady,
    typingGroupPosition,
  ]);

  useLayoutEffect(() => {
    const pending = dockPlacementRebaseRef.current;
    const frameShell = frameShellRef.current;
    if (!pending || !frameShell || !stageReady) return;

    const group = groupRef.current;
    const size = group
      ? { width: Math.max(1, group.offsetWidth), height: Math.max(1, group.offsetHeight) }
      : groupSize;
    const nextPosition = clampGroupPosition(
      {
        x: groupX.get() + pending.frameOffset.x - frameShell.offsetLeft,
        y: groupY.get() + pending.frameOffset.y - frameShell.offsetTop,
      },
      size,
      stageMetrics,
    );
    groupX.set(nextPosition.x);
    groupY.set(nextPosition.y);
    groupCenterRef.current = groupCenterInViewport(nextPosition, size, stageMetrics);
    setTypingGroupPosition(groupPercentFromPosition(nextPosition, size, stageMetrics));
    dockPlacementRebaseRef.current = null;
  }, [
    dockPlacement,
    groupSize,
    groupX,
    groupY,
    setTypingGroupPosition,
    stageMetrics,
    stageReady,
  ]);

  useEffect(() => {
    return () => {
      interactionRef.current?.cleanup();
      interactionRef.current = null;
      groupDragRef.current?.cleanup();
      groupDragRef.current = null;
      dockDragRef.current?.cleanup();
      dockDragRef.current = null;
      centerSnapAnimationsRef.current.forEach((animation) => animation.stop());
      centerSnapAnimationsRef.current = [];
    };
  }, []);

  if (!directLayoutEnabled || LOAFING_THEMES.has(visualTheme)) {
    return <>{children}</>;
  }

  function setDockPlacementIfChanged(nextPlacement: DockPlacement) {
    if (lastDockPlacementRef.current === nextPlacement) return;
    const frameShell = frameShellRef.current;
    if (frameShell) {
      dockPlacementRebaseRef.current = {
        frameOffset: { x: frameShell.offsetLeft, y: frameShell.offsetTop },
      };
    }
    lastDockPlacementRef.current = nextPlacement;
    setDockPlacement(nextPlacement);
  }

  function stopCenterSnapAnimations() {
    centerSnapAnimationsRef.current.forEach((animation) => animation.stop());
    centerSnapAnimationsRef.current = [];
    centerSnapActiveRef.current = false;
  }

  function currentGroupSize() {
    const group = groupRef.current;
    if (!group) return groupSize;
    return {
      width: Math.max(1, group.offsetWidth),
      height: Math.max(1, group.offsetHeight),
    };
  }

  function startGroupTracking(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    groupDragRef.current?.cleanup();
    stopCenterSnapAnimations();

    const groupRect = groupRef.current?.getBoundingClientRect();
    if (!groupRect) return;

    const startPosition = clampGroupPosition(
      { x: groupX.get(), y: groupY.get() },
      currentGroupSize(),
      stageMetrics,
    );

    const drag: GroupDrag = {
      startPointer: { x: event.clientX, y: event.clientY },
      startPosition,
      centerSnapped: false,
      currentPosition: startPosition,
      cleanup: () => undefined,
    };

    const onPointerMove = (pointerEvent: PointerEvent) => {
      const point = { x: pointerEvent.clientX, y: pointerEvent.clientY };
      const size = currentGroupSize();
      const proposed = clampGroupPosition(
        {
          x: drag.startPosition.x + point.x - drag.startPointer.x,
          y: drag.startPosition.y + point.y - drag.startPointer.y,
        },
        size,
        stageMetrics,
      );
      const proposedCenter = groupCenterInViewport(proposed, size, stageMetrics);
      const viewport = viewportSize();
      const viewportCenter = { x: viewport.width / 2, y: viewport.height / 2 };
      const centerTarget = clampGroupPosition(
        {
          x: viewportCenter.x - stageMetrics.left - size.width / 2,
          y: viewportCenter.y - stageMetrics.top - size.height / 2,
        },
        size,
        stageMetrics,
      );
      const shouldCenterSnap = distance(proposedCenter, viewportCenter) <= CENTER_SNAP_RADIUS;

      if (shouldCenterSnap) {
        if (!drag.centerSnapped) {
          stopCenterSnapAnimations();
          const transition = reducedMotion ? { duration: 0 } : CENTER_SNAP_SPRING;
          const animations = [
            animate(groupX, centerTarget.x, transition),
            animate(groupY, centerTarget.y, transition),
          ];
          centerSnapAnimationsRef.current = animations;
          centerSnapActiveRef.current = true;
          void Promise.all(animations).then(() => {
            centerSnapActiveRef.current = false;
            if (centerSnapAnimationsRef.current === animations) {
              centerSnapAnimationsRef.current = [];
            }
          });
          drag.centerSnapped = true;
          setIsCenterSnapped(true);
        }
        drag.currentPosition = centerTarget;
        groupCenterRef.current = groupCenterInViewport(centerTarget, size, stageMetrics);
      } else {
        if (drag.centerSnapped) {
          stopCenterSnapAnimations();
          drag.centerSnapped = false;
          setIsCenterSnapped(false);
        }

        groupX.set(proposed.x);
        groupY.set(proposed.y);
        drag.currentPosition = proposed;
        groupCenterRef.current = proposedCenter;
      }
    };

    const stopTracking = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopTracking);
      window.removeEventListener("pointercancel", stopTracking);
      const size = currentGroupSize();
      const finalPosition = clampGroupPosition(
        drag.centerSnapped ? drag.currentPosition : { x: groupX.get(), y: groupY.get() },
        size,
        stageMetrics,
      );
      const percent = groupPercentFromPosition(finalPosition, size, stageMetrics);
      setTypingGroupPosition(percent);
      groupCenterRef.current = groupCenterInViewport(finalPosition, size, stageMetrics);
      setIsGroupDragging(false);
      setIsCenterSnapped(false);
      setIsMoveHandleHovered(false);
      if (groupDragRef.current === drag) groupDragRef.current = null;
    };

    drag.cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopTracking);
      window.removeEventListener("pointercancel", stopTracking);
    };
    groupDragRef.current = drag;
    setIsGroupDragging(true);
    setIsMoveHandleHovered(false);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopTracking);
    window.addEventListener("pointercancel", stopTracking);
  }

  function startDockTracking(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (isDockInteractiveTarget(event.target)) return;
    const captureTarget = event.currentTarget;
    const pointerId = event.pointerId;
    event.preventDefault();
    event.stopPropagation();
    dockDragRef.current?.cleanup();

    const dockRect = dockRef.current?.getBoundingClientRect();
    const frameRect = frameRef.current?.getBoundingClientRect();
    if (!dockRect || !frameRect) return;

    const drag: DockDrag = {
      grabOffset: {
        x: event.clientX - dockRect.left,
        y: event.clientY - dockRect.top,
      },
      frameRect: rectFromDom(frameRect),
      originPlacement: lastDockPlacementRef.current,
      leftOriginSnapZone: false,
      snappedPlacement: null,
      cleanup: () => undefined,
    };

    captureTarget.setPointerCapture(pointerId);

    const settleDock = () => {
      const transition = reducedMotion ? { duration: 0 } : PLACEMENT_SPRING;
      animate(dockX, 0, transition);
      animate(dockY, 0, transition);
    };

    const onPointerMove = (pointerEvent: PointerEvent) => {
      const point = { x: pointerEvent.clientX, y: pointerEvent.clientY };
      pointerEvent.preventDefault();
      const latestFrameRect = frameRef.current?.getBoundingClientRect();
      if (latestFrameRect) drag.frameRect = rectFromDom(latestFrameRect);
      const currentDockRect = dockRef.current?.getBoundingClientRect();
      if (!currentDockRect) return;
      const dockCenter = {
        x: point.x - drag.grabOffset.x + currentDockRect.width / 2,
        y: point.y - drag.grabOffset.y + currentDockRect.height / 2,
      };
      let snapPlacement = dockSnapPlacementFor(dockCenter, drag.frameRect);

      if (!drag.leftOriginSnapZone) {
        if (snapPlacement === drag.originPlacement) {
          snapPlacement = null;
        } else {
          drag.leftOriginSnapZone = true;
        }
      }

      if (snapPlacement) {
        if (snapPlacement !== drag.snappedPlacement) {
          drag.snappedPlacement = snapPlacement;
          setDockPlacementIfChanged(snapPlacement);
          settleDock();
        }
        return;
      }

      if (drag.snappedPlacement) {
        drag.grabOffset = {
          x: point.x - currentDockRect.left,
          y: point.y - currentDockRect.top,
        };
        drag.snappedPlacement = null;
      }

      const next = clampDockVisualPosition(
        {
          x: point.x - drag.grabOffset.x,
          y: point.y - drag.grabOffset.y,
        },
        { width: currentDockRect.width, height: currentDockRect.height },
      );
      dockX.set(dockX.get() + next.x - currentDockRect.left);
      dockY.set(dockY.get() + next.y - currentDockRect.top);
    };

    const stopTracking = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopTracking);
      window.removeEventListener("pointercancel", stopTracking);
      if (captureTarget.hasPointerCapture(pointerId)) {
        captureTarget.releasePointerCapture(pointerId);
      }
      settleDock();
      setIsDockDragging(false);
      setIsDockHandleHovered(false);
      if (dockDragRef.current === drag) dockDragRef.current = null;
    };

    drag.cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopTracking);
      window.removeEventListener("pointercancel", stopTracking);
      if (captureTarget.hasPointerCapture(pointerId)) {
        captureTarget.releasePointerCapture(pointerId);
      }
    };
    dockDragRef.current = drag;
    setIsDockDragging(true);
    setIsDockHandleHovered(false);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopTracking);
    window.addEventListener("pointercancel", stopTracking);
  }

  function startFrameInteraction(kind: FrameInteractionKind, event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    interactionRef.current?.cleanup();

    const stage = frameSizingArea(stageMetrics);
    const startFrame = framePixelsFromInteractionStart(
      activeFrameRect,
      stage,
      frameRef.current,
    );
    const interaction: FrameInteraction = {
      kind,
      startPointer: { x: event.clientX, y: event.clientY },
      stage,
      startFrame,
      currentRect: normalizeFramePixels(startFrame, stage),
      cleanup: () => undefined,
    };

    const onPointerMove = (pointerEvent: PointerEvent) => {
      const dx = pointerEvent.clientX - interaction.startPointer.x;
      const dy = pointerEvent.clientY - interaction.startPointer.y;
      const next = { ...interaction.startFrame };

      if (interaction.kind === "east" || interaction.kind === "southeast") next.width += dx;
      if (interaction.kind === "south" || interaction.kind === "southeast") next.height += dy;

      const clamped = snapFrameSizeToDefault(
        clampFramePixels(next, interaction.stage),
        interaction.stage,
        interaction.kind,
      );
      const normalized = normalizeFramePixels(clamped, interaction.stage);
      interaction.currentRect = normalized;
      setDraftFrameRect(normalized);
    };

    const removeListeners = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };

    const finish = () => {
      removeListeners();
      setTypingFrameRect(interaction.currentRect);
      setDraftFrameRect(null);
      setIsInteracting(false);
      if (interactionRef.current === interaction) interactionRef.current = null;
    };

    interaction.cleanup = removeListeners;
    interactionRef.current = interaction;
    setIsInteracting(true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  return (
    <section
      ref={stageRef}
      className="typing-layout-stage"
      data-dock-placement={dockPlacement}
      style={{
        "--typing-layout-group-height": `${groupSize.height}px`,
      } as React.CSSProperties}
    >
      <motion.div
        ref={groupRef}
        className="typing-layout-group"
        data-dock-placement={dockPlacement}
        data-group-dragging={isGroupDragging ? "true" : undefined}
        data-center-snapped={isCenterSnapped ? "true" : undefined}
        layout
        layoutDependency={dockPlacement}
        layoutAnchor={{ x: 0.5, y: 0.5 }}
        style={{ x: groupX, y: groupY }}
        animate={{ scale: isGroupDragging || isMoveHandleHovered ? 1.008 : 1 }}
        transition={{
          layout: reducedMotion ? { duration: 0 } : PLACEMENT_SPRING,
          scale: reducedMotion ? { duration: 0 } : HANDLE_HOVER_SPRING,
        }}
      >
        <motion.div
          ref={dockRef}
          className="sub-nav-frosted dock-snap-surface"
          data-dock-placement={dockPlacement}
          data-dock-axis={dockPlacement === "left" || dockPlacement === "right" ? "vertical" : "horizontal"}
          data-dock-dragging={isDockDragging ? "true" : undefined}
          layout
          layoutDependency={dockPlacement}
          layoutAnchor={{ x: 0.5, y: 0.5 }}
          style={{ x: dockX, y: dockY }}
          animate={{ scale: isDockDragging || isDockHandleHovered ? 1.008 : 1 }}
          onPointerDown={startDockTracking}
          onPointerEnter={() => setIsDockHandleHovered(true)}
          onPointerLeave={() => setIsDockHandleHovered(false)}
          transition={{
            layout: reducedMotion ? { duration: 0 } : PLACEMENT_SPRING,
            scale: reducedMotion ? { duration: 0 } : HANDLE_HOVER_SPRING,
          }}
        >
          <div className="sub-nav-group">
            <TopBar />
          </div>
        </motion.div>

        <motion.div
          ref={frameShellRef}
          className="typing-card-frame"
          data-frame-compact={framePixels.height <= 520 ? "true" : undefined}
          data-frame-interacting={isInteracting ? "true" : undefined}
          layout
          layoutDependency={dockPlacement}
          layoutAnchor={{ x: 0.5, y: 0.5 }}
          style={frameShellStyle}
          transition={{ layout: reducedMotion ? { duration: 0 } : PLACEMENT_SPRING }}
        >
          <div ref={frameRef} className="typing-card-frame-content">
            <div
              className="typing-frame-zone typing-frame-move-zone"
              aria-hidden="true"
              onPointerEnter={() => setIsMoveHandleHovered(true)}
              onPointerLeave={() => setIsMoveHandleHovered(false)}
              onPointerDown={startGroupTracking}
            />
            <div
              className="typing-frame-zone typing-frame-resize-zone is-east"
              aria-hidden="true"
              onPointerDown={(event) => startFrameInteraction("east", event)}
            />
            <div
              className="typing-frame-zone typing-frame-resize-zone is-south"
              aria-hidden="true"
              onPointerDown={(event) => startFrameInteraction("south", event)}
            />
            <div
              className="typing-frame-zone typing-frame-resize-zone is-southeast"
              aria-hidden="true"
              onPointerDown={(event) => startFrameInteraction("southeast", event)}
            />
            {children}
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
