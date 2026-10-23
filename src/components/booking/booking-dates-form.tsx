"use client";

import Form from "next/form";
import { useState } from "react";
import { inputClasses } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { BranchOption } from "@/components/search/search-form";

/** Step 1: dates + return branch. Pick-up is fixed to the car's home branch. GET-submits to extras. */
export function BookingDatesForm({
  action,
  pickupBranch,
  branches,
  defaults,
  extras,
  error,
}: {
  action: string;
  pickupBranch: BranchOption;
  branches: BranchOption[];
  defaults: { returnBranch: string; pickupAt: string; returnAt: string };
  extras?: string;
  error?: string | null;
}) {
  const [pickupAt, setPickupAt] = useState(defaults.pickupAt);
  const [returnAt, setReturnAt] = useState(defaults.returnAt);
  const [returnBranch, setReturnBranch] = useState(defaults.returnBranch || pickupBranch.id);
  const returnTz = branches.find((b) => b.id === returnBranch)?.city ?? pickupBranch.city;
  const invalid = Boolean(pickupAt && returnAt && returnAt <= pickupAt);

  return (
    <Form action={action} className="space-y-4" aria-label="Choose rental dates">
      <input type="hidden" name="pickupBranch" value={pickupBranch.id} />
      {extras ? <input type="hidden" name="extras" value={extras} /> : null}

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink-800">Pick-up branch</p>
        <p className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5 text-sm text-ink-800">
          {pickupBranch.name} ({pickupBranch.city})
        </p>
        <p className="mt-1 text-xs text-ink-500">This car is collected from its home branch.</p>
      </div>

      <div>
        <label htmlFor="search-return-branch" className="mb-1.5 block text-sm font-medium text-ink-800">
          Return branch
        </label>
        <select
          id="search-return-branch"
          data-testid="search-return-branch"
          name="returnBranch"
          value={returnBranch}
          onChange={(e) => setReturnBranch(e.target.value)}
          className={inputClasses}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.city})
            </option>
          ))}
        </select>
        {returnBranch !== pickupBranch.id ? (
          <p className="mt-1 text-xs text-ink-500">One-way rental: a one-way fee is added to the price.</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="search-pickup-at" className="mb-1.5 block text-sm font-medium text-ink-800">
            Pick-up date and time
          </label>
          <input
            id="search-pickup-at"
            data-testid="search-pickup-at"
            type="datetime-local"
            name="pickupAt"
            required
            step={1800}
            value={pickupAt}
            onChange={(e) => setPickupAt(e.target.value)}
            className={inputClasses}
            aria-describedby="book-pickup-tz"
          />
          <p id="book-pickup-tz" className="mt-1 text-xs text-ink-500">
            {pickupBranch.city} local time
          </p>
        </div>
        <div>
          <label htmlFor="search-return-at" className="mb-1.5 block text-sm font-medium text-ink-800">
            Return date and time
          </label>
          <input
            id="search-return-at"
            data-testid="search-return-at"
            type="datetime-local"
            name="returnAt"
            required
            step={1800}
            min={pickupAt || undefined}
            value={returnAt}
            onChange={(e) => setReturnAt(e.target.value)}
            className={inputClasses}
            aria-invalid={invalid || undefined}
            aria-describedby="book-return-tz"
          />
          <p id="book-return-tz" className={invalid ? "mt-1 text-xs font-medium text-red-700" : "mt-1 text-xs text-ink-500"}>
            {invalid ? "Return must be after pick-up." : `${returnTz} local time`}
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-700" data-testid="booking-dates-error">
          {error}
        </p>
      ) : null}

      <SubmitButton size="lg" className="w-full sm:w-auto" data-testid="book-continue" disabled={invalid}>
        Continue to extras
      </SubmitButton>
    </Form>
  );
}
