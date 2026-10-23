"use client";

import Form from "next/form";
import { useRef } from "react";
import { inputClasses } from "@/components/ui/field";
import { buttonClasses } from "@/components/ui/button";
import type { FilterParams, TripParams } from "@/lib/ui/search-params";

type Option = { value: string; label: string };

/**
 * Filters + sort as a GET form. Changing any control re-submits (client navigation), so the
 * server re-runs the availability search with the new filters.
 */
export function SearchFilters({
  trip,
  filters,
  categories,
}: {
  trip: TripParams;
  filters: FilterParams;
  categories: Option[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  return (
    <Form ref={formRef} action="/search" replace scroll={false} aria-label="Filter results" className="space-y-4">
      {Object.entries(trip).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="sort" value={filters.sort ?? ""} />

      <Select
        id="filter-category"
        label="Category"
        name="category"
        defaultValue={filters.category ?? ""}
        onChange={submit}
        options={[{ value: "", label: "All categories" }, ...categories]}
      />
      <Select
        id="filter-transmission"
        label="Transmission"
        name="transmission"
        defaultValue={filters.transmission ?? ""}
        onChange={submit}
        options={[
          { value: "", label: "Any" },
          { value: "AUTOMATIC", label: "Automatic" },
          { value: "MANUAL", label: "Manual" },
        ]}
      />
      <Select
        id="filter-seats"
        label="Seats (minimum)"
        name="seats"
        defaultValue={filters.seats ? String(filters.seats) : ""}
        onChange={submit}
        options={[
          { value: "", label: "Any" },
          { value: "2", label: "2+" },
          { value: "4", label: "4+" },
          { value: "5", label: "5+" },
          { value: "7", label: "7+" },
        ]}
      />
      <Select
        id="filter-fuel"
        label="Fuel type"
        name="fuel"
        defaultValue={filters.fuel ?? ""}
        onChange={submit}
        options={[
          { value: "", label: "Any" },
          { value: "PETROL", label: "Petrol" },
          { value: "DIESEL", label: "Diesel" },
          { value: "HYBRID", label: "Hybrid" },
          { value: "ELECTRIC", label: "Electric" },
        ]}
      />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-800">Daily price (AED)</legend>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="filter-min-price" className="sr-only">
              Minimum daily price in AED
            </label>
            <input
              id="filter-min-price"
              data-testid="filter-min-price"
              name="minPrice"
              type="number"
              inputMode="numeric"
              min={0}
              step={10}
              placeholder="Min"
              defaultValue={filters.minPrice ?? ""}
              className={inputClasses}
            />
          </div>
          <div>
            <label htmlFor="filter-max-price" className="sr-only">
              Maximum daily price in AED
            </label>
            <input
              id="filter-max-price"
              data-testid="filter-max-price"
              name="maxPrice"
              type="number"
              inputMode="numeric"
              min={0}
              step={10}
              placeholder="Max"
              defaultValue={filters.maxPrice ?? ""}
              className={inputClasses}
            />
          </div>
        </div>
      </fieldset>
      <div className="flex gap-2">
        <button type="submit" className={buttonClasses("primary", "sm", "flex-1")} data-testid="filter-apply">
          Apply filters
        </button>
        <a
          href={`/search?${new URLSearchParams(trip).toString()}`}
          className={buttonClasses("ghost", "sm")}
          data-testid="filter-reset"
        >
          Reset
        </a>
      </div>
    </Form>
  );
}

function Select({
  id,
  label,
  name,
  defaultValue,
  onChange,
  options,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string;
  onChange: () => void;
  options: Option[];
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-800">
        {label}
      </label>
      <select id={id} data-testid={id} name={name} defaultValue={defaultValue} onChange={onChange} className={inputClasses}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Sort control; navigates with the current query plus the new sort. */
export function SortSelect({ query, value }: { query: Record<string, string>; value: string }) {
  return (
    <Form action="/search" replace scroll={false} className="flex items-center gap-2">
      {Object.entries(query)
        .filter(([k]) => k !== "sort")
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <label htmlFor="sort" className="text-sm text-ink-600">
        Sort by
      </label>
      <select
        id="sort"
        data-testid="sort"
        name="sort"
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`${inputClasses} w-auto py-2`}
      >
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
        <option value="seats">Most seats</option>
        <option value="newest">Newest models</option>
      </select>
      <noscript>
        <button type="submit" className={buttonClasses("outline", "sm")}>
          Sort
        </button>
      </noscript>
    </Form>
  );
}
