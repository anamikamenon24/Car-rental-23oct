import type { BranchDto } from "@/server/catalog";
import { AFCheckbox, AFError, AFText } from "@/components/ui/action-form";

/** Branch form fields (names match branchSchema; opening hours simplified to one daily window or 24h). */
export function BranchFields({ branch }: { branch?: BranchDto }) {
  const hours = branch?.openingHours;
  const is24h = !branch || (hours && "24h" in hours);
  const firstWindow = hours && !("24h" in hours) ? Object.values(hours)[0] : undefined;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <AFText label="Name" name="name" id="branch-name" data-testid="branch-name" defaultValue={branch?.name} required />
        <AFText label="Code" name="code" id="branch-code" data-testid="branch-code" defaultValue={branch?.code} hint="2-10 letters/digits, e.g. DXB" required />
        <AFText label="URL slug" name="slug" id="branch-slug" data-testid="branch-slug" defaultValue={branch?.slug} hint="e.g. dubai-airport" required />
        <AFText label="City" name="city" id="branch-city" data-testid="branch-city" defaultValue={branch?.city} required />
        <AFText label="Address" name="address" id="branch-address" data-testid="branch-address" defaultValue={branch?.address} required wrapperClassName="sm:col-span-2" />
        <AFText label="Phone" name="phone" id="branch-phone" defaultValue={branch?.phone} type="tel" />
        <AFText label="Email" name="email" id="branch-email" defaultValue={branch?.email} type="email" />
        <AFText label="Time zone (IANA)" name="timeZone" id="branch-tz" data-testid="branch-timezone" defaultValue={branch?.timeZone ?? "Asia/Dubai"} required />
        <AFText label="Latitude" name="latitude" id="branch-lat" defaultValue={branch?.latitude ?? ""} type="number" step="0.000001" />
        <AFText label="Longitude" name="longitude" id="branch-lng" defaultValue={branch?.longitude ?? ""} type="number" step="0.000001" />
        <AFText label="Image URL" name="imageUrl" id="branch-image" defaultValue={branch?.imageUrl} />
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Opening hours (branch local time)</legend>
        <AFCheckbox label="Open 24 hours" name="open24h" id="branch-24h" defaultChecked={Boolean(is24h)} wrapperClassName="self-end pb-3" />
        <AFText label="Opens" name="opensAt" id="branch-opens" type="time" defaultValue={firstWindow?.[0] ?? "08:00"} hint="Used when not 24h" />
        <AFText label="Closes" name="closesAt" id="branch-closes" type="time" defaultValue={firstWindow?.[1] ?? "22:00"} />
        <AFError name="openingHours" />
      </fieldset>
      <div className="flex flex-wrap gap-6">
        <AFCheckbox label="Airport branch" name="isAirport" id="branch-airport" defaultChecked={branch?.isAirport ?? false} />
        <AFCheckbox label="Active (bookable)" name="isActive" id="branch-active" defaultChecked={branch?.isActive ?? true} />
      </div>
    </div>
  );
}
