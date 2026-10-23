import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { damageReports, reservations } from "@/db/schema";
import { getFileStorage } from "@/lib/services/storage";
import { assertActor, assertAdmin, type Actor } from "./auth";
import { db, writeAudit } from "./db";
import { DomainError } from "./errors";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

type Kind = "jpeg" | "png" | "webp" | "pdf" | "svg";
const MIME: Record<Kind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  svg: "image/svg+xml",
};
const EXT: Record<Kind, string> = { jpeg: "jpg", png: "png", webp: "webp", pdf: "pdf", svg: "svg" };

/** Detects the real file type from its first bytes (never trust the browser's content type). */
export function sniffFileType(bytes: Uint8Array): Kind | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  if (b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return "pdf";
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return null;
}

async function readFile(file: File, allowed: Kind[]): Promise<{ bytes: Uint8Array; kind: Kind }> {
  if (!file || typeof file.arrayBuffer !== "function") throw new DomainError("VALIDATION", "No file uploaded", { fieldErrors: { file: ["Choose a file"] } });
  if (file.size === 0) throw new DomainError("VALIDATION", "The file is empty", { fieldErrors: { file: ["The file is empty"] } });
  if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("VALIDATION", "Files must be 8 MB or smaller", { fieldErrors: { file: ["Max 8 MB"] } });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFileType(bytes);
  if (!kind || !allowed.includes(kind)) {
    throw new DomainError("VALIDATION", `Allowed file types: ${allowed.map((k) => EXT[k].toUpperCase()).join(", ")}`, {
      fieldErrors: { file: ["Unsupported file type"] },
    });
  }
  if (kind === "svg" && /<script|on\w+\s*=|javascript:/i.test(new TextDecoder().decode(bytes))) {
    throw new DomainError("VALIDATION", "SVG files may not contain scripts", { fieldErrors: { file: ["Unsafe SVG"] } });
  }
  return { bytes, kind };
}

/** App route that streams a stored file after an authorisation check. */
export function privateFileUrl(key: string): string {
  return `/api/files/${key}`;
}

export async function uploadLicence(actor: Actor, file: File, side: "front" | "back" = "front") {
  assertActor(actor);
  if (side !== "front" && side !== "back") throw new DomainError("VALIDATION", "side must be front or back");
  const { bytes, kind } = await readFile(file, ["jpeg", "png", "webp", "pdf"]);
  const key = `licences/${actor.id}/${side}-${randomUUID()}.${EXT[kind]}`;
  await getFileStorage().put(key, bytes, MIME[kind], { access: "private" });
  return { key, url: privateFileUrl(key) };
}

export async function uploadDamagePhoto(actor: Actor, file: File) {
  assertAdmin(actor);
  const { bytes, kind } = await readFile(file, ["jpeg", "png", "webp"]);
  const key = `damage/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${EXT[kind]}`;
  await getFileStorage().put(key, bytes, MIME[kind], { access: "private" });
  await writeAudit(db, { actor, action: "damage_photo.uploaded", entityType: "file", metadata: { key } });
  return { key, url: privateFileUrl(key) };
}

export async function uploadVehiclePhoto(actor: Actor, file: File) {
  assertAdmin(actor);
  const { bytes, kind } = await readFile(file, ["jpeg", "png", "webp", "svg"]);
  const key = `vehicles/${randomUUID()}.${EXT[kind]}`;
  const stored = await getFileStorage().put(key, bytes, MIME[kind], { access: "public" });
  const url = stored.url ?? privateFileUrl(key);
  await writeAudit(db, { actor, action: "vehicle_photo.uploaded", entityType: "file", metadata: { key, url } });
  return { key, url };
}

/**
 * Who may read a stored file:
 * - vehicles/*            anyone (public photos)
 * - licences/<userId>/*   that user and admins
 * - damage/*              admins, and the customer of a reservation whose damage report lists the file
 */
export async function canReadFile(actor: Actor | null, key: string): Promise<boolean> {
  const [area, owner] = key.split("/");
  if (area === "vehicles") return true;
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;
  if (area === "licences") return owner === actor.id;
  if (area === "damage") {
    const rows = await db
      .select({ id: damageReports.id })
      .from(damageReports)
      .innerJoin(reservations, eq(reservations.id, damageReports.reservationId))
      .where(and(eq(reservations.userId, actor.id), sql`${key} = any(${damageReports.imageKeys})`))
      .limit(1);
    return rows.length > 0;
  }
  return false;
}

export const FILE_KEY_PATTERN = /^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_.-]+)*$/;
