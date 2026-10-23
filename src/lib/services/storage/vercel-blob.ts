import { del, get, put } from "@vercel/blob";
import { createSignedFileUrl, verifySignedFileUrl } from "./signing";
import type { FileStorage, PutOptions, StoredFile } from "./types";

const KEY_PATTERN = /^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_.-]+)*$/;

export interface VercelBlobStorageOptions {
  /** BLOB_READ_WRITE_TOKEN (optional when Vercel OIDC + BLOB_STORE_ID are available). */
  token?: string;
  signingSecret: string;
  /** Base for signed links, e.g. https://example.com/api/files */
  publicBaseUrl: string;
  now?: () => Date;
}

/**
 * Vercel Blob adapter (STORAGE_PROVIDER=vercel-blob). Licence and damage photos are stored with
 * access "private" and only ever streamed through the app's authorised /api/files route; vehicle
 * photos use access "public" and are served straight from the Blob CDN URL.
 */
export class VercelBlobStorage implements FileStorage {
  readonly name = "vercel-blob";
  private readonly now: () => Date;

  constructor(private readonly options: VercelBlobStorageOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async put(key: string, data: Uint8Array, contentType: string, options: PutOptions = {}): Promise<StoredFile> {
    this.check(key);
    const access = options.access ?? "private";
    const result = await put(key, Buffer.from(data), {
      access,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      token: this.options.token,
    });
    return { key, contentType, sizeBytes: data.byteLength, url: access === "public" ? result.url : undefined };
  }

  async get(key: string) {
    this.check(key);
    const access = key.startsWith("vehicles/") ? "public" : "private";
    const result = await get(key, { access, token: this.options.token }).catch((err: unknown) => {
      if ((err as { name?: string }).name === "BlobNotFoundError") return null;
      throw err;
    });
    if (!result || result.statusCode !== 200) return null;
    const data = Buffer.from(await new Response(result.stream).arrayBuffer());
    return { key, contentType: result.blob.contentType, sizeBytes: result.blob.size, data };
  }

  async delete(key: string): Promise<void> {
    this.check(key);
    await del(key, { token: this.options.token });
  }

  createSignedUrl(key: string, expiresInSeconds: number): string {
    this.check(key);
    return createSignedFileUrl(this.options.publicBaseUrl, this.options.signingSecret, key, expiresInSeconds, this.now());
  }

  verifySignedUrl(key: string, expires: string | null, signature: string | null): boolean {
    return verifySignedFileUrl(this.options.signingSecret, key, expires, signature, this.now());
  }

  private check(key: string) {
    if (!KEY_PATTERN.test(key) || key.split("/").some((p) => p === ".." || p === ".")) {
      throw new Error(`Invalid storage key: ${key}`);
    }
  }
}
