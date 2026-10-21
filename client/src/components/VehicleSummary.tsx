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

type VehicleNameProps = {
  vehicle: VehicleSummary;
  /** Tailwind size for the name text. */
  compact?: boolean;
  className?: string;
};

/**
 * The model of the vehicle ("Skoda Slavia").
 *
 * Kept separate from the colour badge so a card can stack the two in the
 * order the design asks for: plate, model, then the paint colour.
 */
export function VehicleName({ vehicle, compact = false, className }: VehicleNameProps) {
  const name = vehicle.vehicleName?.trim();
  if (!name) return null;

  return (
    <span
      className={cn(
        "min-w-0 truncate font-semibold text-foreground",
        compact ? "max-w-[130px] text-[11px]" : "max-w-[190px] text-[13px]",
        className
      )}
    >
      {name}
    </span>
  );
}

type VehicleColorBadgeProps = {
  vehicle: VehicleSummary;
  compact?: boolean;
  className?: string;
};

/**
 * The paint colour of the vehicle, shown as a chip filled with that exact
 * colour.
 *
 * The label colour is derived from the fill so the name stays readable on
 * light (White, Beige) as well as dark (Carbon Black, Midnight Blue) bodies.
 */
export function VehicleColorBadge({
  vehicle,
  compact = false,
  className,
}: VehicleColorBadgeProps) {
  const color = vehicle.vehicleColor?.trim();
  if (!color) return null;

  const hex = vehicleColorHex(color);
  const foreground = readableTextOn(hex);
  const border = vehicleColorBorder(hex);

  return (
    <span
      title={color}
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg font-medium",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11.5px]",
        className
      )}
      style={{ backgroundColor: hex, color: foreground, border: `1px solid ${border}` }}
    >
      {color}
    </span>
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
 * Composed from {@link VehicleName} and {@link VehicleColorBadge} so the
 * name and the colour chip stay visually identical everywhere they appear.
 */
export function VehicleChip({ vehicle, compact = false, className }: VehicleChipProps) {
  const name = vehicle.vehicleName?.trim();
  const color = vehicle.vehicleColor?.trim();
  if (!name && !color) return null;

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      <VehicleName vehicle={vehicle} compact={compact} />
      <VehicleColorBadge vehicle={vehicle} compact={compact} />
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
 * The artwork is never cropped: it keeps its own proportions
 * (object-contain) and the frame only reserves a width, so the height
 * follows the artwork instead of boxing it into a fixed square. A wide car
 * therefore sits snugly in its frame rather than floating in a tall empty
 * box, and a tall car is scaled down instead of being cut off.
 */
export function VehicleThumbnail({ vehicle, size = "md", className }: VehicleThumbnailProps) {
  const image = vehicle.vehicleImage?.trim();
  if (!image) return null;

  const alt = vehicle.vehicleName?.trim() || "Vehicle";

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-muted/40",
        size === "sm" ? "w-20 sm:w-24" : "w-24 sm:w-28 lg:w-32",
        className
      )}
    >
      <img
        src={image}
        alt={alt}
        loading="lazy"
        className={cn(
          "h-auto w-full object-contain object-center",
          size === "sm" ? "max-h-16 sm:max-h-20" : "max-h-20 sm:max-h-24 lg:max-h-28"
        )}
      />
    </div>
  );
}
