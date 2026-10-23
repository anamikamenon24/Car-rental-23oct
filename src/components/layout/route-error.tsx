"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";

/** Shared body for error.tsx files. */
export function RouteError({
  error,
  retry,
  title = "Something went wrong",
}: {
  error: unknown;
  retry: () => void;
  title?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <div
        role="alert"
        data-testid="route-error"
        className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-red-200 bg-white px-6 py-10 text-center shadow-[var(--shadow-card)]"
      >
        <div className="rounded-full bg-red-50 p-3 text-red-700">
          <AlertIcon className="size-6" />
        </div>
        <h1 className="mt-3 text-lg font-semibold text-ink-900">{title}</h1>
        <p className="mt-1 text-sm text-ink-600">
          We couldn&apos;t load this page. It may be a temporary problem — please try again.
        </p>
        {digest ? <p className="mt-2 font-mono text-xs text-ink-400">Reference: {digest}</p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => retry()}>Try again</Button>
          <ButtonLink href="/" variant="outline">
            Go home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
