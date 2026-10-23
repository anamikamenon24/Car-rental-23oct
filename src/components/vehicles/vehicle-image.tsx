import Image from "next/image";
import { cn } from "@/lib/ui/cn";
import { CarIcon } from "@/components/ui/icons";

/**
 * Vehicle photo. Photos are SVG/PNG/JPEG files served from public/ or the public uploads
 * route, so they are rendered unoptimised (SVGs can't go through the image optimiser).
 */
export function VehicleImage({
  src,
  alt,
  className,
  priority = false,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br from-brand-50 to-ink-100", className)}>
      {src ? (
        <Image src={src} alt={alt} fill unoptimized priority={priority} sizes={sizes} className="object-contain p-3" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-brand-300" role="img" aria-label={alt}>
          <CarIcon className="size-16" />
        </div>
      )}
    </div>
  );
}
