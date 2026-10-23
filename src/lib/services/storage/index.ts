import { LocalFileStorage } from "./local";
import type { FileStorage } from "./types";

export * from "./types";

let storage: FileStorage | undefined;

/** Returns the configured file storage (STORAGE_PROVIDER = local | vercel-blob; default local). */
export function getFileStorage(): FileStorage {
  storage ??= createFileStorage();
  return storage;
}

/** Test hook. */
export function setFileStorage(s: FileStorage | undefined): void {
  storage = s;
}

function createFileStorage(): FileStorage {
  const provider = process.env.STORAGE_PROVIDER || "local";
  const publicBaseUrl = `${requireEnv("NEXT_PUBLIC_APP_URL")}/api/files`;
  switch (provider) {
    case "local":
      return new LocalFileStorage({
        rootDir: process.env.UPLOADS_DIR ?? "./storage/uploads",
        signingSecret: requireEnv("UPLOADS_SIGNING_SECRET"),
        publicBaseUrl,
      });
    case "vercel-blob": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { VercelBlobStorage } = require("./vercel-blob") as typeof import("./vercel-blob");
      return new VercelBlobStorage({
        token: process.env.BLOB_READ_WRITE_TOKEN || undefined,
        signingSecret: requireEnv("UPLOADS_SIGNING_SECRET"),
        publicBaseUrl,
      });
    }
    default:
      throw new Error(`STORAGE_PROVIDER "${provider}" has no adapter`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
