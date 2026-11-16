import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_DEVICE_SECONDS = 30 * 24 * 60 * 60;

export function createAdminDeviceToken(userId: string, expires: number, secret: string) {
  return `${expires}.${signature(userId, expires, secret)}`;
}

export function verifyAdminDeviceToken(
  value: string | undefined,
  userId: string,
  secret: string,
  now = Date.now(),
) {
  if (!value) return false;
  const [rawExpires, givenSignature, ...rest] = value.split(".");
  if (rest.length || !rawExpires || !givenSignature || !/^\d+$/.test(rawExpires)) return false;
  const expires = Number(rawExpires);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + ADMIN_DEVICE_SECONDS * 1000) return false;
  const expectedSignature = signature(userId, expires, secret);
  const given = Buffer.from(givenSignature);
  const expected = Buffer.from(expectedSignature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function signature(userId: string, expires: number, secret: string) {
  return createHmac("sha256", secret).update(`typenews-admin-device-v1:${userId}:${expires}`).digest("base64url");
}
