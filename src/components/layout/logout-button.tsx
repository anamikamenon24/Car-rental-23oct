"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/ui/cn";
import { Spinner } from "@/components/ui/spinner";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        data-testid="logout"
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-60",
          className,
        )}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await authClient.signOut();
            if (res.error) {
              setError("Could not sign out. Please try again.");
              return;
            }
            router.push("/");
            router.refresh();
          })
        }
      >
        {pending ? <Spinner className="size-4" /> : null}
        Sign out
      </button>
      {error ? (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </>
  );
}
