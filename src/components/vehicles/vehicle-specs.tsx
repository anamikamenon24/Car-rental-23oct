import { BagIcon, FuelIcon, GearIcon, UsersIcon } from "@/components/ui/icons";
import { humanize } from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";

export function VehicleSpecs({
  vehicle,
  className,
}: {
  vehicle: { seats: number; transmission: string; fuelType: string; luggage?: number | null; doors?: number | null };
  className?: string;
}) {
  const items = [
    { icon: UsersIcon, label: `${vehicle.seats} seats` },
    { icon: GearIcon, label: humanize(vehicle.transmission) },
    { icon: FuelIcon, label: humanize(vehicle.fuelType) },
    ...(vehicle.luggage != null ? [{ icon: BagIcon, label: `${vehicle.luggage} bags` }] : []),
  ];
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-600", className)}>
      {items.map(({ icon: Icon, label }) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <Icon className="size-4 text-ink-400" />
          {label}
        </li>
      ))}
    </ul>
  );
}
