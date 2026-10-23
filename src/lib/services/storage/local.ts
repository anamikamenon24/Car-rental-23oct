import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileStorage, StoredFile } from "./types";

const KEY_PATTERN = /^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_.-]+)*$/;

export interface LocalStorageOptions {
  /** Absolute or project-relative folder. Must not be inside /public. */
  rootDir: string;
  signingSecret: string;
  /** Base for signed links, e.g. http://localhost:3000/api/files */
  publicBaseUrl: string;
  now?: () => Date;
}

/** Private uploads on the local disk, with a sidecar .meta.json per file for the content type. */
export class LocalFileStorage implements FileStorage {
  readonly name = "local";
  private readonly root: string;
  private readonly now: () => Date;

  constructor(private readonly options: LocalStorageOptions) {
    this.root = path.resolve(options.rootDir);
    const publicDir = path.resolve("public");
    if (this.root === publicDir || this.root.startsWith(publicDir + path.sep)) {
      throw new Error("Uploads folder must not be inside public/");
    }
    this.now = options.now ?? (() => new Date());
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<StoredFile> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    const stored: StoredFile = { key, contentType, sizeBytes: data.byteLength };
    await writeFile(`${file}.meta.json`, JSON.stringify(stored));
    return stored;
  }

  async get(key: string) {
    const file = this.resolve(key);
    try {
      const [data, meta] = await Promise.all([readFile(file), readFile(`${file}.meta.json`, "utf8")]);
      return { ...(JSON.parse(meta) as StoredFile), data };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.resolve(key);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
  }

  createSignedUrl(key: string, expiresInSeconds: number): string {
    this.resolve(key);
    const expires = Math.floor(this.now().getTime() / 1000) + expiresInSeconds;
    const url = new URL(`${this.options.publicBaseUrl.replace(/\/$/, "")}/${key}`);
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("sig", this.sign(key, expires));
    return url.toString();
  }

  verifySignedUrl(key: string, expires: string | null, signature: string | null): boolean {
    const expiresAt = Number(expires);
    if (!signature || !Number.isInteger(expiresAt)) return false;
    if (expiresAt < this.now().getTime() / 1000) return false;
    const expected = Buffer.from(this.sign(key, expiresAt));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private sign(key: string, expires: number) {
    return createHmac("sha256", this.options.signingSecret).update(`${key}:${expires}`).digest("hex");
  }

  private resolve(key: string): string {
    if (!KEY_PATTERN.test(key) || key.split("/").some((part) => part === ".." || part === ".")) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const file = path.resolve(this.root, key);
    if (!file.startsWith(this.root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
    return file;
  }
}
