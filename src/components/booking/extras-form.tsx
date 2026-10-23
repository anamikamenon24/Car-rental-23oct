"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { serializeExtras, tripQuery, type TripParams } from "@/lib/ui/search-params";
import { formatAED } from "@/lib/ui/format";
import { buttonClasses } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/ui/cn";

export type ExtraOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  chargeType: "PER_DAY" | "PER_RENTAL";
  priceFils: number;
  maxChargeFils: number | null;
  maxQuantity: number;
};

/**
 * Step 2: extras. Each change updates the URL so the server re-prices the booking; the price
 * shown next to each extra is its list price, the breakdown beside it is the server quote.
 */
export function ExtrasForm({
  vehicleId,
  trip,
  extras,
  selected,
  disabled,
}: {
  vehicleId: string;
  trip: TripParams;
  extras: ExtraOption[];
  selected: { extraId: string; quantity: number }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(selected.map((s) => [s.extraId, s.quantity])),
  );

  const selection = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([extraId, quantity]) => ({ extraId, quantity }));

  function update(extraId: string, quantity: number) {
    const next = { ...qty, [extraId]: quantity };
    setQty(next);
    const sel = Object.entries(next)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => ({ extraId: id, quantity: q }));
    startTransition(() => {
      router.replace(`/book/${vehicleId}/extras${tripQuery(trip, { extras: serializeExtras(sel) })}`, {
        scroll: false,
      });
    });
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-base font-semibold text-ink-900">Add extras</legend>
        <p className="text-sm text-ink-600">Optional. You can review the full price before paying.</p>
        <ul className="mt-4 space-y-3">
          {extras.map((e) => {
            const q = qty[e.id] ?? 0;
            const checked = q > 0;
            const inputId = `extra-${e.code}`;
            return (
              <li
                key={e.id}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  checked ? "border-brand-400 bg-brand-50/60" : "border-ink-200 bg-white",
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    id={inputId}
                    data-testid={`extra-${e.code}`}
                    type="checkbox"
                    name="extras"
                    value={e.id}
                    checked={checked}
                    disabled={disabled}
                    onChange={(ev) => update(e.id, ev.target.checked ? Math.max(1, q) : 0)}
                    className="mt-1 size-4 accent-brand-700"
                    aria-describedby={`${inputId}-desc`}
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={inputId} className="flex flex-wrap justify-between gap-2 font-medium text-ink-900">
                      <span>{e.name}</span>
                      <span className="text-sm font-semibold text-ink-800">
                        {formatAED(e.priceFils)}
                        <span className="font-normal text-ink-500">
                          {e.chargeType === "PER_DAY" ? " / day" : " / rental"}
                        </span>
                      </span>
                    </label>
                    <p id={`${inputId}-desc`} className="mt-0.5 text-sm text-ink-600">
                      {e.description}
                      {e.maxChargeFils ? ` Capped at ${formatAED(e.maxChargeFils)} per rental.` : ""}
                    </p>
                    {checked && e.maxQuantity > 1 ? (
                      <div className="mt-2 flex items-center gap-2">
                        <label htmlFor={`${inputId}-qty`} className="text-sm text-ink-700">
                          Quantity
                        </label>
                        <select
                          id={`${inputId}-qty`}
                          data-testid={`extra-${e.code}-qty`}
                          value={q}
                          disabled={disabled}
                          onChange={(ev) => update(e.id, Number(ev.target.value))}
                          className="rounded-lg border border-ink-300 bg-white px-2 py-1 text-sm"
                        >
                          {Array.from({ length: e.maxQuantity }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="book-continue"
          disabled={pending || disabled}
          className={buttonClasses("primary", "lg")}
          onClick={() =>
            router.push(`/book/${vehicleId}/driver${tripQuery(trip, { extras: serializeExtras(selection) })}`)
          }
        >
          Continue to driver details
        </button>
        <span aria-live="polite" className="text-sm text-ink-600">
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Spinner className="size-4" /> Updating price…
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
