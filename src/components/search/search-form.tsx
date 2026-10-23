"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { cn } from "@/lib/ui/cn";
import { inputClasses } from "@/components/ui/field";
import { SearchIcon } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button";
import { tripQuery, type TripParams } from "@/lib/ui/search-params";

export type BranchOption = { id: string; name: string; city: string; timeZone: string };

type Props = {
  branches: BranchOption[];
  defaults: TripParams;
  /** Where to send the search; defaults to /search. Extra params (filters) are kept. */
  action?: string;
  keepParams?: Record<string, string | undefined>;
  layout?: "hero" | "bar";
  submitLabel?: string;
};

/**
 * Trip search form. Times are entered in each branch's local time and travel in the URL as
 * wall-clock strings; the server converts them with the branch time zone and validates them.
 */
export function SearchForm({
  branches,
  defaults,
  action = "/search",
  keepParams,
  layout = "hero",
  submitLabel = "Search cars",
}: Props) {
  const router = useRouter();
  const [pickupBranch, setPickupBranch] = useState(defaults.pickupBranch);
  const [returnBranch, setReturnBranch] = useState(defaults.returnBranch);
  const [returnTouched, setReturnTouched] = useState(defaults.returnBranch !== defaults.pickupBranch);
  const [pickupAt, setPickupAt] = useState(defaults.pickupAt);
  const [returnAt, setReturnAt] = useState(defaults.returnAt);
  const [error, setError] = useState<string | null>(null);

  const effectiveReturn = returnTouched ? returnBranch : pickupBranch;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pickupBranch) return setError("Choose a pick-up branch.");
    if (!pickupAt || !returnAt) return setError("Choose pick-up and return times.");
    // Quick sanity check only; the server re-validates using each branch's time zone.
    if (returnAt <= pickupAt) return setError("Return must be after pick-up.");
    setError(null);
    router.push(
      `${action}${tripQuery({ pickupBranch, returnBranch: effectiveReturn, pickupAt, returnAt }, keepParams)}`,
    );
  }

  const tzNote = (id: string) => {
    const b = branches.find((x) => x.id === id);
    return b ? `${b.city} local time` : "Branch local time";
  };

  const isHero = layout === "hero";

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Search for a car"
      className={cn(
        "grid gap-3",
        isHero ? "rounded-2xl bg-white p-4 shadow-[var(--shadow-pop)] sm:p-5 lg:grid-cols-12" : "lg:grid-cols-12",
      )}
    >
      <div className="lg:col-span-3">
        <label htmlFor="search-pickup-branch" className="mb-1.5 block text-sm font-medium text-ink-800">
          Pick-up branch
        </label>
        <select
          id="search-pickup-branch"
          data-testid="search-pickup-branch"
          name="pickupBranch"
          required
          value={pickupBranch}
          onChange={(e) => setPickupBranch(e.target.value)}
          className={inputClasses}
        >
          <option value="" disabled>
            Select a branch
          </option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.city})
            </option>
          ))}
        </select>
      </div>

      <div className="lg:col-span-3">
        <label htmlFor="search-return-branch" className="mb-1.5 block text-sm font-medium text-ink-800">
          Return branch
        </label>
        <select
          id="search-return-branch"
          data-testid="search-return-branch"
          name="returnBranch"
          value={effectiveReturn}
          onChange={(e) => {
            setReturnBranch(e.target.value);
            setReturnTouched(e.target.value !== pickupBranch);
          }}
          className={inputClasses}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.city})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-500">
          {effectiveReturn !== pickupBranch ? "One-way rental: a one-way fee applies." : "Same as pick-up"}
        </p>
      </div>

      <div className="lg:col-span-2">
        <label htmlFor="search-pickup-at" className="mb-1.5 block text-sm font-medium text-ink-800">
          Pick-up
        </label>
        <input
          id="search-pickup-at"
          data-testid="search-pickup-at"
          type="datetime-local"
          name="pickupAt"
          required
          step={1800}
          value={pickupAt}
          onChange={(e) => {
            setPickupAt(e.target.value);
            if (returnAt && e.target.value >= returnAt) setReturnAt("");
          }}
          className={inputClasses}
          aria-describedby="search-pickup-tz"
        />
        <p id="search-pickup-tz" className="mt-1 text-xs text-ink-500">
          {tzNote(pickupBranch)}
        </p>
      </div>

      <div className="lg:col-span-2">
        <label htmlFor="search-return-at" className="mb-1.5 block text-sm font-medium text-ink-800">
          Return
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
          aria-describedby="search-return-tz"
        />
        <p id="search-return-tz" className="mt-1 text-xs text-ink-500">
          {tzNote(effectiveReturn)}
        </p>
      </div>

      <div className="flex flex-col justify-start lg:col-span-2">
        <span className="mb-1.5 hidden text-sm font-medium lg:block" aria-hidden="true">
          &nbsp;
        </span>
        <button
          type="submit"
          data-testid="search-submit"
          className={buttonClasses("accent", "md", "h-[42px] w-full")}
        >
          <SearchIcon className="size-4" />
          {submitLabel}
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-700 lg:col-span-12">
          {error}
        </p>
      ) : null}
    </form>
  );
}
