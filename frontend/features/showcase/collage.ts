export type CollageItem = { title: string; imageUrl: string };
export type CollageOptions = {
  theme?: "light" | "dark";
  fit?: "cover" | "contain";
  showCaptions?: boolean;
  authorName?: string;
};

export type CollagePlacement = { x: number; y: number; width: number; height: number; rotation: number };

const CANVAS_SIZE = 1400;

/** Deterministic editorial placements used both by rendering and layout tests. */
export function showcaseCollageLayout(count: number): CollagePlacement[] {
  const safe = Math.max(1, Math.min(10, Math.floor(count)));
  if (safe === 1) return [{ x: 64, y: 220, width: 1272, height: 980, rotation: 0 }];
  if (safe === 2) return [
    { x: 64, y: 220, width: 790, height: 980, rotation: 0 },
    { x: 878, y: 220, width: 458, height: 980, rotation: 0 },
  ];
  if (safe === 3) return [
    { x: 64, y: 220, width: 790, height: 980, rotation: 0 },
    { x: 878, y: 220, width: 458, height: 478, rotation: 0 },
    { x: 878, y: 722, width: 458, height: 478, rotation: 0 },
  ];
  if (safe === 4) return [
    { x: 64, y: 220, width: 790, height: 980, rotation: 0 },
    { x: 878, y: 220, width: 458, height: 310, rotation: 0 },
    { x: 878, y: 555, width: 458, height: 310, rotation: 0 },
    { x: 878, y: 890, width: 458, height: 310, rotation: 0 },
  ];
  if (safe === 5) {
    const sideHeight = (980 - 36) / 4;
    return [
      { x: 64, y: 220, width: 790, height: 980, rotation: 0 },
      ...Array.from({ length: 4 }, (_, index) => ({ x: 878, y: 220 + index * (sideHeight + 12), width: 458, height: sideHeight, rotation: 0 })),
    ];
  }

  const bottomCount = Math.min(5, Math.ceil((safe - 1) * 0.55));
  const sideCount = safe - 1 - bottomCount;
  const topY = 220;
  const topHeight = 610;
  const heroWidth = 790;
  const gap = 12;
  const sideX = 64 + heroWidth + 24;
  const sideWidth = 1336 - sideX;
  const sideColumns = sideCount >= 3 ? 2 : 1;
  const sideRows = Math.ceil(sideCount / sideColumns);
  const sideCardWidth = (sideWidth - gap * (sideColumns - 1)) / sideColumns;
  const sideHeight = (topHeight - gap * (sideRows - 1)) / sideRows;
  const placements: CollagePlacement[] = [{ x: 64, y: topY, width: heroWidth, height: topHeight, rotation: 0 }];
  for (let index = 0; index < sideCount; index += 1) {
    const column = index % sideColumns;
    const row = Math.floor(index / sideColumns);
    placements.push({ x: sideX + column * (sideCardWidth + gap), y: topY + row * (sideHeight + gap), width: sideCardWidth, height: sideHeight, rotation: 0 });
  }
  const bottomY = 866;
  const bottomGap = 12;
  const bottomWidth = (1272 - bottomGap * (bottomCount - 1)) / bottomCount;
  for (let index = 0; index < bottomCount; index += 1) {
    placements.push({ x: 64 + index * (bottomWidth + bottomGap), y: bottomY, width: bottomWidth, height: 334, rotation: 0 });
  }
  return placements;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("콜라주에 사용할 사진을 읽지 못했습니다."));
    image.src = url;
  });
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
}

function drawContain(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - renderedWidth) / 2, y + (height - renderedHeight) / 2, renderedWidth, renderedHeight);
}

function fittedText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && context.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function localDateLabel(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((value, index) => index ? String(value).padStart(2, "0") : String(value)).join(".");
}

function drawCard(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  item: CollageItem,
  placement: CollagePlacement,
  index: number,
  options: { fit: "cover" | "contain"; showCaptions: boolean; surface: string; text: string; muted: string; imageBackground: string },
) {
  const captionHeight = options.showCaptions ? 42 : 0;
  const { x: imageX, y: imageY, width: imageWidth, height } = placement;
  const imageHeight = height - captionHeight;
  context.save();
  roundedRect(context, imageX, imageY, imageWidth, imageHeight, 3);
  context.fillStyle = options.imageBackground;
  context.fill();
  context.save();
  context.clip();
  if (options.fit === "contain") drawContain(context, image, imageX, imageY, imageWidth, imageHeight);
  else drawCover(context, image, imageX, imageY, imageWidth, imageHeight);
  context.restore();
  context.strokeStyle = options.muted;
  context.globalAlpha = 0.38;
  context.lineWidth = 1;
  context.strokeRect(imageX + 0.5, imageY + 0.5, imageWidth - 1, imageHeight - 1);
  context.globalAlpha = 1;
  if (options.showCaptions) {
    context.fillStyle = options.surface;
    context.fillRect(imageX, imageY + imageHeight, imageWidth, captionHeight);
    context.fillStyle = options.muted;
    context.font = "600 13px ui-monospace, monospace";
    context.fillText(String(index + 1).padStart(2, "0"), imageX, imageY + imageHeight + 27);
    context.fillStyle = options.text;
    context.font = "600 16px system-ui, sans-serif";
    context.fillText(fittedText(context, item.title, imageWidth - 48), imageX + 34, imageY + imageHeight + 27);
  }
  context.restore();
}

export async function createShowcaseCollage(items: CollageItem[], options: CollageOptions = {}) {
  if (!items.length) throw new Error("콜라주로 만들 키보드를 선택해 주세요.");
  const selected = items.slice(0, 10);
  const theme = options.theme ?? "light";
  const fit = options.fit ?? "cover";
  const showCaptions = options.showCaptions ?? true;
  const authorName = options.authorName?.trim().slice(0, 60) ?? "";
  const palette = theme === "dark"
    ? { background: "#19191b", surface: "#19191b", text: "#f1eeea", pageText: "#f1eeea", muted: "#8e8a88", imageBackground: "#2a292b" }
    : { background: "#f2f0eb", surface: "#f2f0eb", text: "#2c292a", pageText: "#2c292a", muted: "#8a8582", imageBackground: "#dedbd6" };
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("콜라주를 만들 수 없습니다.");

  context.fillStyle = palette.background;
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  context.fillStyle = palette.pageText;
  context.font = "700 25px Georgia, serif";
  context.fillText("Type News", 64, 72);
  context.fillStyle = palette.muted;
  context.font = "600 14px ui-monospace, monospace";
  context.fillText(`KEYBOARD ARCHIVE  /  ${String(selected.length).padStart(2, "0")}`, 64, 108);
  context.strokeStyle = palette.muted;
  context.globalAlpha = 0.42;
  context.beginPath();
  context.moveTo(64, 142.5);
  context.lineTo(1336, 142.5);
  context.stroke();
  context.globalAlpha = 1;
  context.textAlign = "right";
  context.font = "500 15px system-ui, sans-serif";
  context.fillText(authorName || "PERSONAL COLLECTION", 1336, 72);
  context.textAlign = "left";

  const images = await Promise.all(selected.map((item) => loadImage(item.imageUrl)));
  const placements = showcaseCollageLayout(selected.length);
  selected.forEach((item, index) => drawCard(context, images[index], item, placements[index], index, {
    fit, showCaptions, surface: palette.surface, text: palette.text, muted: palette.muted, imageBackground: palette.imageBackground,
  }));

  context.fillStyle = palette.muted;
  context.font = "500 13px ui-monospace, monospace";
  context.fillText("typenews.vercel.app/archive", 64, 1342);
  context.textAlign = "right";
  context.fillText(localDateLabel(), 1336, 1342);
  context.textAlign = "left";

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("콜라주를 저장하지 못했습니다.")), "image/png"));
}
