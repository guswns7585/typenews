"use client";

import { Palette } from "lucide-react";
import { useEffect } from "react";
import {
  applyBackgroundToBody,
  useUiStore,
  type BackgroundTheme,
} from "@/stores/use-ui-store";

const themes: { id: BackgroundTheme; label: string }[] = [
  { id: "default", label: "기본" },
  { id: "sky", label: "맑은 하늘" },
  { id: "insta", label: "인스타그램" },
  { id: "sunset", label: "노을" },
  { id: "forest", label: "숲" },
  { id: "oceon", label: "바다" },
  { id: "twilight", label: "황혼" },
];

export function BackgroundPicker() {
  const background = useUiStore((s) => s.background);
  const bgOptionsOpen = useUiStore((s) => s.bgOptionsOpen);
  const solidColor = useUiStore((s) => s.solidColor);
  const gradientColors = useUiStore((s) => s.gradientColors);
  const setBackground = useUiStore((s) => s.setBackground);
  const setBgOptionsOpen = useUiStore((s) => s.setBgOptionsOpen);
  const setSolidColor = useUiStore((s) => s.setSolidColor);
  const setGradientColors = useUiStore((s) => s.setGradientColors);

  useEffect(() => {
    applyBackgroundToBody(background, solidColor, gradientColors);
  }, [background, solidColor, gradientColors]);

  return (
    <div className="background-selector">
      <button
        id="bg-toggle-btn"
        type="button"
        className="chip-pill"
        onClick={() => setBgOptionsOpen(!bgOptionsOpen)}
      >
        <Palette size={14} />
        배경
      </button>
      <div id="bg-options" className={bgOptionsOpen ? "show" : undefined}>
        {themes.map((theme) => (
          <div key={theme.id} onClick={() => setBackground(theme.id)}>
            {theme.label}
          </div>
        ))}
        <div
          onClick={(event) => {
            if ((event.target as HTMLElement).tagName === "INPUT") return;
            setBackground("custom-solid");
          }}
        >
          단색
          <br />
          <input
            type="color"
            id="custom-solid-picker"
            value={solidColor}
            onChange={(event) => {
              setSolidColor(event.target.value);
              setBackground("custom-solid");
            }}
          />
        </div>
        <div
          onClick={(event) => {
            if ((event.target as HTMLElement).tagName === "INPUT") return;
            setBackground("custom-gradient");
          }}
        >
          그라데이션
          <br />
          <input
            type="color"
            id="grad-color-1"
            value={gradientColors[0]}
            onChange={(event) => {
              setGradientColors([event.target.value, gradientColors[1], gradientColors[2]]);
              setBackground("custom-gradient");
            }}
          />
          <br />
          <input
            type="color"
            id="grad-color-2"
            value={gradientColors[1]}
            onChange={(event) => {
              setGradientColors([gradientColors[0], event.target.value, gradientColors[2]]);
              setBackground("custom-gradient");
            }}
          />
          <br />
          <input
            type="color"
            id="grad-color-3"
            value={gradientColors[2]}
            onChange={(event) => {
              setGradientColors([gradientColors[0], gradientColors[1], event.target.value]);
              setBackground("custom-gradient");
            }}
          />
        </div>
      </div>
    </div>
  );
}
