"use client";

import { useId, useState } from "react";
import { CheckIcon, UploadIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/ui/cn";

const MAX_BYTES = 8 * 1024 * 1024;

type Uploaded = { key?: string; url: string; name: string };

/**
 * Uploads one file to an authorised upload route as soon as it's chosen and stores the
 * returned key (or URL) in a hidden input, so the surrounding form only submits a reference.
 */
export function FileUpload({
  label,
  endpoint,
  name,
  valueField = "key",
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  existing,
  hint,
  error,
  required,
  testId,
}: {
  label: string;
  endpoint: string;
  /** Hidden input name that receives the key/url. */
  name: string;
  valueField?: "key" | "url";
  accept?: string;
  existing?: { key?: string; url: string; label?: string } | null;
  hint?: string;
  error?: string | string[];
  required?: boolean;
  testId?: string;
}) {
  const id = useId();
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const shownError = uploadError ?? (Array.isArray(error) ? error[0] : error);
  const value = uploaded ? (valueField === "key" ? uploaded.key : uploaded.url) : existing ? (valueField === "key" ? existing.key : existing.url) : "";

  async function onChange(file: File | undefined) {
    setUploadError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setUploadError("File is too large (max 8 MB).");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body });
      const json = (await res.json().catch(() => null)) as
        | { key?: string; url?: string; error?: { message?: string } }
        | null;
      if (!res.ok || !json?.url) {
        setUploadError(json?.error?.message ?? "Upload failed. Please try again.");
        return;
      }
      setUploaded({ key: json.key, url: json.url, name: file.name });
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-800">
        {label}
        {required ? (
          <span className="ml-0.5 text-red-700" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3",
          shownError ? "border-red-400 bg-red-50/50" : "border-ink-300 bg-ink-50",
        )}
      >
        <UploadIcon className="size-5 text-ink-500" />
        <input
          id={id}
          type="file"
          accept={accept}
          data-testid={testId}
          disabled={busy}
          onChange={(e) => onChange(e.target.files?.[0])}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={`${id}-status`}
          className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-800"
        />
        <input type="hidden" name={name} value={value ?? ""} />
      </div>
      <p id={`${id}-status`} aria-live="polite" className="mt-1 text-xs">
        {busy ? (
          <span className="inline-flex items-center gap-1.5 text-ink-600">
            <Spinner className="size-3.5" /> Uploading…
          </span>
        ) : shownError ? (
          <span className="font-medium text-red-700">{shownError}</span>
        ) : uploaded ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700" data-testid={testId ? `${testId}-done` : undefined}>
            <CheckIcon className="size-3.5" /> Uploaded {uploaded.name}
          </span>
        ) : existing ? (
          <span className="inline-flex items-center gap-1.5 text-ink-600">
            <CheckIcon className="size-3.5 text-emerald-700" /> {existing.label ?? "File on record"} ·{" "}
            <a href={existing.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
              view
            </a>
          </span>
        ) : hint ? (
          <span className="text-ink-500">{hint}</span>
        ) : null}
      </p>
    </div>
  );
}
