import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileStorage } from "./local";

let dir: string;
let storage: LocalFileStorage;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "driveeasy-uploads-"));
  storage = new LocalFileStorage({ rootDir: dir, signingSecret: "s", publicBaseUrl: "http://localhost:3000/api/files" });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("LocalFileStorage", () => {
  it("stores, reads and deletes a file", async () => {
    await storage.put("licences/u1/front.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    const file = await storage.get("licences/u1/front.jpg");
    expect(file).toMatchObject({ contentType: "image/jpeg", sizeBytes: 3 });
    expect([...file!.data]).toEqual([1, 2, 3]);

    await storage.delete("licences/u1/front.jpg");
    expect(await storage.get("licences/u1/front.jpg")).toBeNull();
  });

  it("rejects keys that escape the uploads folder", async () => {
    for (const key of ["../x", "a/../../x", "/etc/passwd", "a\\..\\x", "C:/x"]) {
      await expect(storage.put(key, new Uint8Array(), "text/plain")).rejects.toThrow(/Invalid storage key/);
    }
  });

  it("refuses an uploads folder inside public/", () => {
    expect(
      () => new LocalFileStorage({ rootDir: "public/uploads", signingSecret: "s", publicBaseUrl: "http://x" }),
    ).toThrow(/public/);
  });

  it("issues signed links that expire and cannot be reused for other files", () => {
    const url = new URL(storage.createSignedUrl("licences/u1/front.jpg", 60));
    const expires = url.searchParams.get("expires");
    const sig = url.searchParams.get("sig");
    expect(storage.verifySignedUrl("licences/u1/front.jpg", expires, sig)).toBe(true);
    expect(storage.verifySignedUrl("licences/u2/front.jpg", expires, sig)).toBe(false);
    expect(storage.verifySignedUrl("licences/u1/front.jpg", "1", sig)).toBe(false);
  });
});
