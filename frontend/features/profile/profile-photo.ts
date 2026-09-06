import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_PHOTO_BUCKET = "profile-photos";
export const PROFILE_PHOTO_UPDATED_EVENT = "typenews:profile-photo-updated";

export const PROFILE_PHOTO_LIMITS = {
  sourceBytes: 8 * 1024 * 1024,
  photoBytes: 700 * 1024,
  thumbnailBytes: 80 * 1024,
  photoLongSide: 1600,
  thumbnailWidth: 480,
  thumbnailHeight: 160,
} as const;

export type PreparedProfilePhoto = {
  photo: Blob;
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
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { output, context };
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
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
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  context.drawImage(
    image.source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
  return output;
}

function resizeCanvas(source: HTMLCanvasElement, scale: number) {
  const { output, context } = canvas(source.width * scale, source.height * scale);
  context.drawImage(source, 0, 0, output.width, output.height);
  return output;
}

function toWebp(source: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    source.toBlob((blob) => {
      if (!blob || blob.type !== "image/webp") {
        reject(new Error("이 브라우저에서는 WebP 사진 변환을 지원하지 않습니다."));
        return;
      }
      resolve(blob);
    }, "image/webp", quality);
  });
}

async function encodeWithinLimit(
  initial: HTMLCanvasElement,
  byteLimit: number,
  minimumLongSide: number,
) {
  const qualities = [0.86, 0.8, 0.74, 0.68, 0.62];
  let current = initial;

  for (let sizeAttempt = 0; sizeAttempt < 5; sizeAttempt += 1) {
    for (const quality of qualities) {
      const blob = await toWebp(current, quality);
      if (blob.size <= byteLimit) return { blob, canvas: current };
    }

    if (Math.max(current.width, current.height) <= minimumLongSide) break;
    current = resizeCanvas(current, 0.86);
  }

  throw new Error("사진을 용량 제한에 맞게 줄일 수 없습니다. 다른 사진을 선택해 주세요.");
}

export async function prepareProfilePhoto(file: File): Promise<PreparedProfilePhoto> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("JPG, PNG 또는 WebP 사진을 선택해 주세요.");
  }
  if (file.size > PROFILE_PHOTO_LIMITS.sourceBytes) {
    throw new Error("원본 사진은 8MB 이하여야 합니다.");
  }

  const image = await decodeImage(file);
  try {
    if (!image.width || !image.height || image.width * image.height > 50_000_000) {
      throw new Error("사진 해상도가 너무 큽니다. 5천만 화소 이하의 사진을 사용해 주세요.");
    }

    const fullCanvas = drawContained(image, PROFILE_PHOTO_LIMITS.photoLongSide);
    const thumbCanvas = drawCover(
      image,
      PROFILE_PHOTO_LIMITS.thumbnailWidth,
      PROFILE_PHOTO_LIMITS.thumbnailHeight,
    );
    const full = await encodeWithinLimit(fullCanvas, PROFILE_PHOTO_LIMITS.photoBytes, 960);
    const thumbnail = await encodeWithinLimit(
      thumbCanvas,
      PROFILE_PHOTO_LIMITS.thumbnailBytes,
      320,
    );

    return {
      photo: full.blob,
      thumbnail: thumbnail.blob,
      width: full.canvas.width,
      height: full.canvas.height,
    };
  } finally {
    image.close();
  }
}

export function publicProfilePhotoUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  updatedAt?: string | null,
) {
  if (!path) return null;
  const { data } = supabase.storage.from(PROFILE_PHOTO_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) return null;
  const version = updatedAt ? new Date(updatedAt).getTime() : 0;
  return version ? `${data.publicUrl}?v=${version}` : data.publicUrl;
}
