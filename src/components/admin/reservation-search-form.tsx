import Form from "next/form";
import { inputClasses } from "@/components/ui/field";
import { buttonClasses } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";

export function ReservationSearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <Form action="/admin/reservations" className="flex flex-col gap-2 sm:flex-row" role="search">
      <label htmlFor="admin-q" className="sr-only">
        Search reservations
      </label>
      <input
        id="admin-q"
        name="q"
        defaultValue={defaultValue}
        placeholder="DE-XXXXXXXX, name, email or plate"
        className={inputClasses}
        data-testid="admin-reservation-search"
      />
      <button type="submit" className={buttonClasses("primary", "md")}>
        <SearchIcon className="size-4" /> Search
      </button>
    </Form>
  );
}
