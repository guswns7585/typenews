import assert from "node:assert/strict";
import { test } from "node:test";
import { ADMIN_DEVICE_SECONDS, createAdminDeviceToken, verifyAdminDeviceToken } from "./admin-device";

const now = Date.UTC(2026, 10, 16);
const expires = now + ADMIN_DEVICE_SECONDS * 1000;

test("remembered admin device token is bound to user and secret", () => {
  const token = createAdminDeviceToken("admin-a", expires, "secret-a");
  assert.equal(verifyAdminDeviceToken(token, "admin-a", "secret-a", now), true);
  assert.equal(verifyAdminDeviceToken(token, "admin-b", "secret-a", now), false);
  assert.equal(verifyAdminDeviceToken(token, "admin-a", "secret-b", now), false);
});

test("tampered, expired and overly long tokens are rejected", () => {
  const token = createAdminDeviceToken("admin-a", expires, "secret-a");
  assert.equal(verifyAdminDeviceToken(`${token}x`, "admin-a", "secret-a", now), false);
  assert.equal(verifyAdminDeviceToken(token, "admin-a", "secret-a", expires), false);
  const tooLong = createAdminDeviceToken("admin-a", expires + 1, "secret-a");
  assert.equal(verifyAdminDeviceToken(tooLong, "admin-a", "secret-a", now), false);
});
