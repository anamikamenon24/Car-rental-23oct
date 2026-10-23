// Provider-neutral file storage contract. STORAGE_PROVIDER picks the implementation (see ./index.ts).

export type FileAccess = "private" | "public";

export interface StoredFile {
  key: string;
  contentType: string;
  sizeBytes: number;
  /** Direct public URL, only for files stored with access "public" on providers that host them (Blob). */
  url?: string;
}

export interface PutOptions {
  /** Default "private". Public files (vehicle photos) may be served without authorisation. */
  access?: FileAccess;
}

export interface FileStorage {
  readonly name: string;
  /** Keys look like "licences/<userId>/front.jpg": lowercase-safe segments, no "..". */
  put(key: string, data: Uint8Array, contentType: string, options?: PutOptions): Promise<StoredFile>;
  get(key: string): Promise<(StoredFile & { data: Buffer }) | null>;
  delete(key: string): Promise<void>;
  /** Short-lived link for one file. Files are private; there is no public URL. */
  createSignedUrl(key: string, expiresInSeconds: number): string;
  /** Checks a signed link's key/expires/sig query values. */
  verifySignedUrl(key: string, expires: string | null, signature: string | null): boolean;
}
