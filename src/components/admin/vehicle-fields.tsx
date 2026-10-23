import { AFSelect, AFText, AFTextarea } from "@/components/ui/action-form";
import type { AdminVehicleRow } from "@/server/admin/fleet";

export interface VehicleFieldsProps {
  vehicle?: AdminVehicleRow;
  categories: { id: string; name: string }[];
  branches: { id: string; name: string; city: string }[];
  features: { id: string; code: string; name: string }[];
}

export function VehicleFields({ vehicle, categories, branches, features }: VehicleFieldsProps) {
  const selectedFeatures = new Set(vehicle?.featureCodes ?? []);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <AFText label="Make" name="make" id="v-make" defaultValue={vehicle?.make} placeholder="e.g. Toyota" required />
        <AFText label="Model" name="model" id="v-model" defaultValue={vehicle?.model} placeholder="e.g. Camry" required />
        <AFText label="Year" name="year" id="v-year" type="number" min="1990" max="2100" defaultValue={vehicle?.year ?? new Date().getFullYear()} required />

        <AFText label="Plate number" name="plate" id="v-plate" defaultValue={vehicle?.plate} hint="e.g. DXB-A1234" required />
        <AFText label="VIN (17 characters)" name="vin" id="v-vin" defaultValue={vehicle?.vin} hint="17 alphanumeric chars" maxLength={17} required />
        <AFText label="Color" name="color" id="v-color" defaultValue={vehicle?.color ?? "White"} required />

        <AFSelect label="Category" name="categoryId" id="v-cat" defaultValue={vehicle?.categoryId} required>
          <option value="">Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </AFSelect>

        <AFSelect label="Assigned Branch" name="branchId" id="v-branch" defaultValue={vehicle?.branchId} required>
          <option value="">Select a branch</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.city})
            </option>
          ))}
        </AFSelect>

        <AFSelect label="Status" name="status" id="v-status" defaultValue={vehicle?.status ?? "AVAILABLE"} required>
          <option value="AVAILABLE">Available</option>
          <option value="RESERVED">Reserved</option>
          <option value="ON_RENT">On Rent</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="RETIRED">Retired</option>
        </AFSelect>

        <AFSelect label="Transmission" name="transmission" id="v-trans" defaultValue={vehicle?.transmission ?? "AUTOMATIC"} required>
          <option value="AUTOMATIC">Automatic</option>
          <option value="MANUAL">Manual</option>
        </AFSelect>

        <AFSelect label="Fuel Type" name="fuelType" id="v-fuel" defaultValue={vehicle?.fuelType ?? "PETROL"} required>
          <option value="PETROL">Petrol</option>
          <option value="DIESEL">Diesel</option>
          <option value="HYBRID">Hybrid</option>
          <option value="ELECTRIC">Electric</option>
        </AFSelect>

        <AFText label="Current Mileage (km)" name="mileageKm" id="v-mileage" type="number" min="0" defaultValue={vehicle?.mileageKm ?? 0} required />
        <AFText label="Seats" name="seats" id="v-seats" type="number" min="1" max="15" defaultValue={vehicle?.seats ?? 5} required />
        <AFText label="Doors" name="doors" id="v-doors" type="number" min="2" max="6" defaultValue={vehicle?.doors ?? 4} required />
        <AFText label="Luggage capacity (bags)" name="luggage" id="v-luggage" type="number" min="0" max="10" defaultValue={vehicle?.luggage ?? 2} required />
      </div>

      <AFText label="Image URL" name="imageUrl" id="v-image" defaultValue={vehicle?.imageUrl ?? ""} hint="URL or /vehicles/filename.webp" />
      <AFTextarea label="Description / notes" name="description" id="v-desc" defaultValue={vehicle?.description ?? ""} rows={2} />

      {features.length > 0 && (
        <fieldset className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-600">Features</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {features.map((f) => (
              <label key={f.code} className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  name="featureCodes"
                  value={f.code}
                  defaultChecked={selectedFeatures.has(f.code)}
                  className="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                <span>{f.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
