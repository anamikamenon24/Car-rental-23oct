import { LocalFileStorage } from "./local";
import type { FileStorage } from "./types";

export * from "./types";

let storage: FileStorage | undefined;

/**
 * Returns the configured file storage. Switching to cloud storage is a settings change
 * (STORAGE_PROVIDER plus its keys) once its adapter is added to the switch below.
 */
export function getFileStorage(): FileStorage {
  storage ??= createFileStorage();
  return storage;
}

function createFileStorage(): FileStorage {
  const provider = process.env.STORAGE_PROVIDER ?? "local";
  switch (provider) {
    case "local":
      return new LocalFileStorage({
        rootDir: process.env.UPLOADS_DIR ?? "./storage/uploads",
        signingSecret: requireEnv("UPLOADS_SIGNING_SECRET"),
        publicBaseUrl: `${requireEnv("NEXT_PUBLIC_APP_URL")}/api/files`,
      });
    default:
      throw new Error(`STORAGE_PROVIDER "${provider}" has no adapter yet`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
