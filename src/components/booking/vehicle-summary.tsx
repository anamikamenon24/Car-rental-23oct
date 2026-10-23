import { VehicleImage } from "@/components/vehicles/vehicle-image";
import { VehicleSpecs } from "@/components/vehicles/vehicle-specs";
import { formatDateTime } from "@/lib/ui/format";

type Props = {
  vehicle: {
    make: string;
    model: string;
    year: number;
    categoryName: string;
    imageUrl: string | null;
    photoUrls: string[];
    seats?: number;
    transmission?: string;
    fuelType?: string;
    luggage?: number | null;
  };
  trip?: {
    pickupBranch: { name: string; timeZone: string };
    returnBranch: { name: string; timeZone: string };
    pickupAt: Date;
    returnAt: Date;
  } | null;
};

/** Compact car + trip card shown beside every booking step. */
export function BookingVehicleSummary({ vehicle, trip }: Props) {
  const name = `${vehicle.make} ${vehicle.model}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <VehicleImage
        src={vehicle.imageUrl ?? vehicle.photoUrls[0]}
        alt={name}
        className="aspect-[16/9]"
        sizes="380px"
      />
      <div className="space-y-3 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">{vehicle.categoryName}</p>
          <p className="text-lg font-semibold text-ink-900">
            {name} <span className="font-normal text-ink-500">{vehicle.year}</span>
          </p>
        </div>
        {vehicle.seats && vehicle.transmission && vehicle.fuelType ? (
          <VehicleSpecs
            vehicle={{
              seats: vehicle.seats,
              transmission: vehicle.transmission,
              fuelType: vehicle.fuelType,
              luggage: vehicle.luggage,
            }}
          />
        ) : null}
        {trip ? (
          <dl className="grid gap-2 border-t border-ink-100 pt-3 text-sm">
            <div>
              <dt className="text-ink-500">Pick-up</dt>
              <dd className="font-medium text-ink-900">
                {trip.pickupBranch.name}
                <br />
                <span className="font-normal">{formatDateTime(trip.pickupAt, trip.pickupBranch.timeZone)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Return</dt>
              <dd className="font-medium text-ink-900">
                {trip.returnBranch.name}
                <br />
                <span className="font-normal">{formatDateTime(trip.returnAt, trip.returnBranch.timeZone)}</span>
              </dd>
            </div>
          </dl>
        ) : null}
      </div>
    </div>
  );
}
