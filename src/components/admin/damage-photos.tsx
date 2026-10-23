"use client";

import { useId, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { UploadIcon, XIcon } from "@/components/ui/icons";
import { useActionFormState } from "@/components/ui/action-form";

type Photo = { key: string; url: string; name: string };

/** Uploads damage photos (admin-only private route) and submits their keys as imageKeys[]. */
export function DamagePhotos() {
  const id = useId();
  const { state } = useActionFormState();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastState, setLastState] = useState(state);

  // Clear after a successful save (the form itself resets).
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "success") setPhotos([]);
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/uploads/damage", { method: "POST", body });
        const json = (await res.json().catch(() => null)) as { key?: string; url?: string; error?: { message?: string } } | null;
        if (!res.ok || !json?.key || !json.url) {
          setError(json?.error?.message ?? `Could not upload ${file.name}`);
          continue;
        }
        setPhotos((p) => [...p, { key: json.key!, url: json.url!, name: file.name }]);
      }
    } finally {
      setBusy(false);
    }
  }

  const fieldError = state.fieldErrors?.imageKeys?.[0];

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-800">
        Photos
      </label>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 py-3">
        <UploadIcon className="size-5 text-ink-500" />
        <input
          id={id}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          data-testid="damage-photo"
          disabled={busy}
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = "";
          }}
          className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
        />
      </div>
      <p aria-live="polite" className="mt-1 text-xs">
        {busy ? (
          <span className="inline-flex items-center gap-1.5 text-ink-600">
            <Spinner className="size-3.5" /> Uploading…
          </span>
        ) : error || fieldError ? (
          <span className="font-medium text-red-700">{error ?? fieldError}</span>
        ) : (
          <span className="text-ink-500">Photos are stored privately.</span>
        )}
      </p>
      {photos.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2" data-testid="damage-photo-list">
          {photos.map((p) => (
            <li key={p.key} className="relative">
              <input type="hidden" name="imageKeys" value={p.key} />
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route */}
              <img src={p.url} alt={p.name} className="size-20 rounded-lg border border-ink-200 object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((all) => all.filter((x) => x.key !== p.key))}
                className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 shadow"
                aria-label={`Remove ${p.name}`}
              >
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
