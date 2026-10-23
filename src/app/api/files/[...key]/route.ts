import type { NextRequest } from "next/server";
import { getFileStorage } from "@/lib/services/storage";
import { getCurrentUser } from "@/server/auth";
import { canReadFile, FILE_KEY_PATTERN } from "@/server/uploads";

/**
 * Streams stored files. Vehicle photos are public; licence and damage files require the owner or
 * an admin (or a valid short-lived signed link created by FileStorage.createSignedUrl).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!FILE_KEY_PATTERN.test(key) || parts.some((p) => p === ".." || p === ".")) {
    return new Response("Not found", { status: 404 });
  }
  const storage = getFileStorage();
  const sp = request.nextUrl.searchParams;
  const signed = sp.has("sig") && storage.verifySignedUrl(key, sp.get("expires"), sp.get("sig"));
  const isPublic = key.startsWith("vehicles/");
  if (!signed && !isPublic) {
    const user = await getCurrentUser();
    if (!user) return new Response("Unauthorised", { status: 401 });
    // Same response as a missing file, so other people's files cannot be probed.
    if (!(await canReadFile(user, key))) return new Response("Not found", { status: 404 });
  }
  const file = await storage.get(key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.contentType,
      "content-length": String(file.sizeBytes),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:",
      "cache-control": isPublic ? "public, max-age=86400" : "private, no-store",
      "content-disposition": "inline",
    },
  });
}
