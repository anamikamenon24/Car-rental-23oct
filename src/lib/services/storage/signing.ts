import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-signed, expiring links to the app's own /api/files route (shared by all providers). */
export function signKey(secret: string, key: string, expires: number): string {
  return createHmac("sha256", secret).update(`${key}:${expires}`).digest("hex");
}

export function createSignedFileUrl(baseUrl: string, secret: string, key: string, expiresInSeconds: number, now: Date) {
  const expires = Math.floor(now.getTime() / 1000) + expiresInSeconds;
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/${key}`);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", signKey(secret, key, expires));
  return url.toString();
}

export function verifySignedFileUrl(secret: string, key: string, expires: string | null, signature: string | null, now: Date) {
  const expiresAt = Number(expires);
  if (!signature || !Number.isInteger(expiresAt)) return false;
  if (expiresAt < now.getTime() / 1000) return false;
  const expected = Buffer.from(signKey(secret, key, expiresAt));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
