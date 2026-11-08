import type { SupabaseClient } from "@supabase/supabase-js";

export const SHOWCASE_BUCKET = "keyboard-showcase";
export const SHOWCASE_MEDIA_LIMITS = {
  sourceImageBytes: 12 * 1024 * 1024,
  imageBytes: 1.5 * 1024 * 1024,
  thumbnailBytes: 200 * 1024,
  imageLongSide: 1600,
  thumbnailWidth: 640,
  thumbnailHeight: 480,
  audioBytes: 1024 * 1024,
  audioDurationSeconds: 45,
} as const;

export type PreparedShowcaseImage = {
  image: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
};

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

function canvas(width: number, height: number) {
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(width));
  output.height = Math.max(1, Math.round(height));
  const context = output.getContext("2d", { alpha: false });
  if (!context) throw new Error("이미지 변환을 시작할 수 없습니다.");
  context.fillStyle = "#f4f3ef";
  context.fillRect(0, 0, output.width, output.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { output, context };
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("사진을 읽을 수 없습니다."));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function drawContained(image: DecodedImage, maxLongSide: number) {
  const scale = Math.min(1, maxLongSide / Math.max(image.width, image.height));
  const { output, context } = canvas(image.width * scale, image.height * scale);
  context.drawImage(image.source, 0, 0, output.width, output.height);
  return output;
}

function drawCover(image: DecodedImage, width: number, height: number) {
  const { output, context } = canvas(width, height);
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(
    image.source,
    (image.width - sourceWidth) / 2,
    (image.height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
  return output;
}

function resize(source: HTMLCanvasElement, scale: number) {
  const { output, context } = canvas(source.width * scale, source.height * scale);
  context.drawImage(source, 0, 0, output.width, output.height);
  return output;
}

function toWebp(source: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    source.toBlob((blob) => {
      if (!blob || blob.type !== "image/webp") {
        reject(new Error("이 브라우저에서는 WebP 변환을 지원하지 않습니다."));
        return;
      }
      resolve(blob);
    }, "image/webp", quality);
  });
}

async function encodeWithinLimit(source: HTMLCanvasElement, limit: number, minimumLongSide: number) {
  let current = source;
  for (let sizeAttempt = 0; sizeAttempt < 6; sizeAttempt += 1) {
    for (const quality of [0.88, 0.82, 0.76, 0.7, 0.64, 0.58]) {
      const blob = await toWebp(current, quality);
      if (blob.size <= limit) return { blob, canvas: current };
    }
    if (Math.max(current.width, current.height) <= minimumLongSide) break;
    current = resize(current, 0.86);
  }
  throw new Error("사진을 용량 제한에 맞게 줄일 수 없습니다. 다른 사진을 선택해 주세요.");
}

export async function prepareShowcaseImage(file: File): Promise<PreparedShowcaseImage> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("JPG, PNG 또는 WebP 사진을 선택해 주세요.");
  }
  if (file.size > SHOWCASE_MEDIA_LIMITS.sourceImageBytes) {
    throw new Error("원본 사진은 12MB 이하여야 합니다.");
  }

  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > 50_000_000) {
      throw new Error("사진 해상도가 너무 큽니다. 5천만 화소 이하 사진을 사용해 주세요.");
    }
    const image = await encodeWithinLimit(
      drawContained(decoded, SHOWCASE_MEDIA_LIMITS.imageLongSide),
      SHOWCASE_MEDIA_LIMITS.imageBytes,
      960,
    );
    const thumbnail = await encodeWithinLimit(
      drawCover(decoded, SHOWCASE_MEDIA_LIMITS.thumbnailWidth, SHOWCASE_MEDIA_LIMITS.thumbnailHeight),
      SHOWCASE_MEDIA_LIMITS.thumbnailBytes,
      480,
    );
    return {
      image: image.blob,
      thumbnail: thumbnail.blob,
      width: image.canvas.width,
      height: image.canvas.height,
    };
  } finally {
    decoded.close();
  }
}

const AUDIO_TYPES: Record<string, { extension: "webm" | "ogg" | "mp3" | "m4a"; mime: string }> = {
  "audio/webm": { extension: "webm", mime: "audio/webm" },
  "audio/ogg": { extension: "ogg", mime: "audio/ogg" },
  "audio/mpeg": { extension: "mp3", mime: "audio/mpeg" },
  "audio/mp4": { extension: "m4a", mime: "audio/mp4" },
  "audio/x-m4a": { extension: "m4a", mime: "audio/x-m4a" },
};

export function showcaseAudioType(file: Pick<File, "type">) {
  return AUDIO_TYPES[file.type] ?? null;
}

export async function inspectShowcaseAudio(file: File) {
  const type = showcaseAudioType(file);
  if (!type) throw new Error("WebM, OGG, MP3 또는 M4A 타건음을 선택해 주세요.");
  if (file.size > SHOWCASE_MEDIA_LIMITS.audioBytes) {
    throw new Error("타건음 파일은 1MB 이하여야 합니다.");
  }

  const url = URL.createObjectURL(file);
  const audio = new Audio();
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error("타건음 파일을 읽을 수 없습니다."));
      audio.preload = "metadata";
      audio.src = url;
    });
    if (!Number.isFinite(duration) || duration <= 0 || duration > SHOWCASE_MEDIA_LIMITS.audioDurationSeconds) {
      throw new Error("타건음은 45초 이하여야 합니다.");
    }
    return { ...type, durationMs: Math.round(duration * 1000) };
  } finally {
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  }
}

export async function signedShowcaseUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  expiresIn = 3600,
) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(SHOWCASE_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
