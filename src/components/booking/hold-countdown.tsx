"use client";

import { useEffect, useState } from "react";
import { ClockIcon } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";

function remainingMs(expiresAt: string) {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

/** Live countdown for a reservation hold. Calls onExpire once when it reaches zero. */
export function HoldCountdown({ expiresAt, onExpire }: { expiresAt: string; onExpire?: () => void }) {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    let fired = false;
    const tick = () => {
      const left = remainingMs(expiresAt);
      setMs(left);
      if (left === 0 && !fired) {
        fired = true;
        onExpire?.();
      }
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [expiresAt, onExpire]);

  const expired = ms === 0;
  const minutes = ms === null ? null : Math.floor(ms / 60000);
  const seconds = ms === null ? null : Math.floor((ms % 60000) / 1000);
  const urgent = ms !== null && ms < 2 * 60000;

  return (
    <div
      data-testid="hold-countdown"
      data-expired={expired ? "true" : "false"}
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
        expired ? "bg-red-50 text-red-800" : urgent ? "bg-amber-50 text-amber-900" : "bg-brand-50 text-brand-900",
      )}
    >
      <ClockIcon className="size-4 shrink-0" />
      {expired ? (
        <span role="alert">Your hold has expired. The car has been released.</span>
      ) : (
        <span>
          We&apos;re holding this car for you for{" "}
          <span className="font-mono font-semibold tabular-nums" aria-live="off">
            {minutes === null ? "--:--" : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}
          </span>
          <span className="sr-only"> minutes</span>
        </span>
      )}
    </div>
  );
}
