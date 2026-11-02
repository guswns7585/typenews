export type CollageItem = { title: string; imageUrl: string };

export function showcaseCollageGrid(count: number) {
  const safe = Math.max(1, Math.min(10, Math.floor(count)));
  const columns = safe === 1 ? 1 : safe <= 4 ? 2 : safe <= 9 ? 3 : 4;
  return { columns, rows: Math.ceil(safe / columns) };
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

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
}

export async function createShowcaseCollage(items: CollageItem[]) {
  if (!items.length) throw new Error("콜라주로 만들 키보드를 선택해 주세요.");
  const selected = items.slice(0, 10);
  const { columns, rows } = showcaseCollageGrid(selected.length);
  const width = 1200;
  const gap = 18;
  const padding = 42;
  const header = 112;
  const caption = 54;
  const cellWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const imageHeight = cellWidth * .72;
  const cellHeight = imageHeight + caption;
  const height = Math.ceil(padding + header + rows * cellHeight + (rows - 1) * gap + padding);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("콜라주를 만들 수 없습니다.");

  context.fillStyle = "#f2eee7";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#312b2d";
  context.font = "700 42px sans-serif";
  context.fillText("TYPENEWS ARCHIVE", padding, 68);
  context.fillStyle = "#746c6e";
  context.font = "500 20px sans-serif";
  context.fillText(`${selected.length} keyboards`, padding, 100);

  const images = await Promise.all(selected.map((item) => loadImage(item.imageUrl)));
  selected.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = padding + column * (cellWidth + gap);
    const y = padding + header + row * (cellHeight + gap);
    drawCover(context, images[index], x, y, cellWidth, imageHeight);
    context.fillStyle = "#ffffff";
    context.fillRect(x, y + imageHeight, cellWidth, caption);
    context.fillStyle = "#312b2d";
    context.font = "600 18px sans-serif";
    const title = item.title.length > 34 ? `${item.title.slice(0, 33)}…` : item.title;
    context.fillText(title, x + 16, y + imageHeight + 34, cellWidth - 32);
  });

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("콜라주를 저장하지 못했습니다.")), "image/png"));
}
