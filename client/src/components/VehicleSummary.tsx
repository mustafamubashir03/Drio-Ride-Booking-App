import { cn } from "@/lib/utils";
import {
  readableTextOn,
  vehicleColorBorder,
  vehicleColorHex,
} from "@/lib/vehicle-colors";

type VehicleSummary = {
  vehicleName?: string | null;
  vehicleColor?: string | null;
  vehicleNumberPlate?: string | null;
  vehicleImage?: string | null;
};

type VehiclePlateProps = {
  vehicle: VehicleSummary;
  /** Tailwind size for the plate text. */
  compact?: boolean;
  className?: string;
};

/**
 * The number plate of a driver's own car.
 *
 * Rendered as a plate-style block so it reads like the physical plate rather
 * than a row of loose text, which is what most modern ride apps do.
 */
export function VehiclePlate({ vehicle, compact = false, className }: VehiclePlateProps) {
  const plate = vehicle.vehicleNumberPlate?.trim();
  if (!plate) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border/70 bg-background/80 font-mono font-bold tracking-[0.12em] text-foreground",
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[13px]",
        className
      )}
    >
      {plate}
    </div>
  );
}

type VehicleChipProps = {
  vehicle: VehicleSummary;
  compact?: boolean;
  className?: string;
};

/**
 * The vehicle name plus a chip filled with the actual paint colour.
 *
 * The colour name is rendered inside a block filled with that colour, and the
 * label colour is picked from the fill so it stays readable on both light
 * (White, Beige) and dark (Carbon Black, Navy Blue) bodies.
 */
export function VehicleChip({ vehicle, compact = false, className }: VehicleChipProps) {
  const name = vehicle.vehicleName?.trim();
  const color = vehicle.vehicleColor?.trim();
  if (!name && !color) return null;

  const hex = vehicleColorHex(color);
  const foreground = readableTextOn(hex);
  const border = vehicleColorBorder(hex);

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {name ? (
        <span
          className={cn(
            "min-w-0 truncate font-semibold text-foreground",
            compact ? "max-w-[130px] text-[11px]" : "max-w-[190px] text-[13px]"
          )}
        >
          {name}
        </span>
      ) : null}
      {color ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-lg font-medium",
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11.5px]"
          )}
          style={{ backgroundColor: hex, color: foreground, border: `1px solid ${border}` }}
        >
          {color}
        </span>
      ) : null}
    </div>
  );
}

type VehicleThumbnailProps = {
  vehicle: VehicleSummary;
  /** "sm" for the history rows, "md" for the live driver card. */
  size?: "sm" | "md";
  className?: string;
};

/**
 * The picture of the driver's own car.
 *
 * The image is stored as a client-relative path ("/mini.png"), so it always
 * resolves against the app origin and shows the vehicle that matches the
 * driver's category.
 *
 * The artwork is never cropped: the picture is scaled down to fit the frame
 * with object-contain, so the whole car stays visible whatever its original
 * proportions are.
 */
export function VehicleThumbnail({ vehicle, size = "md", className }: VehicleThumbnailProps) {
  const image = vehicle.vehicleImage?.trim();
  if (!image) return null;

  const alt = vehicle.vehicleName?.trim() || "Vehicle";

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-muted/40",
        size === "sm" ? "h-14 w-20" : "h-20 w-28",
        className
      )}
    >
      <img
        src={image}
        alt={alt}
        loading="lazy"
        className="max-h-full max-w-full object-contain object-center"
      />
    </div>
  );
}
