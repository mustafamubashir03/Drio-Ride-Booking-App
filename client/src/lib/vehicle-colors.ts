/**
 * Vehicle colour helpers.
 *
 * The colour is stored as a human readable name ("Pearl White", "Carbon
 * Black"). `CSSStyleDeclaration.backgroundColor` only understands real CSS
 * colour keywords, so passing the raw name through rendered nothing for every
 * multi-word colour and only worked by accident for the single-word ones.
 * This maps the stored names onto real hex values and derives a readable
 * foreground colour for the chip so the label is legible on every swatch.
 */

/** The palette the server can assign, keyed by its exact stored name. */
const VEHICLE_COLOR_HEX: Record<string, string> = {
  White: "#f8fafc",
  Black: "#1c1c1e",
  Silver: "#cbd5e1",
  Grey: "#94a3b8",
  Red: "#ef4444",
  Blue: "#3b82f6",
  "Navy Blue": "#1e3a8a",
  Maroon: "#7f1d1d",
  Beige: "#e7d8c3",
  "Pearl White": "#f1f5f9",
  "Carbon Black": "#27272a",
  "Midnight Blue": "#172554",
};

/** Fallback for any colour name the server adds later. */
const FALLBACK_HEX = "#a1a1aa";

/**
 * Resolve a stored colour name to a hex value.
 * Unknown names fall back to a neutral grey rather than rendering nothing.
 */
export function vehicleColorHex(color: string | null | undefined): string {
  if (!color) return FALLBACK_HEX;
  const trimmed = color.trim();
  const direct = VEHICLE_COLOR_HEX[trimmed];
  if (direct) return direct;

  // Case-insensitive fallback so "white" and "White" behave the same.
  const match = Object.keys(VEHICLE_COLOR_HEX).find(
    (key) => key.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return VEHICLE_COLOR_HEX[match];

  // Last resort: a single CSS keyword the browser understands.
  if (/^[a-z]+$/i.test(trimmed)) return trimmed.toLowerCase();
  return FALLBACK_HEX;
}

/**
 * Relative luminance of a hex colour, per WCAG.
 */
function relativeLuminance(hex: string): number {
  const normalised = hex.replace("#", "");
  const full =
    normalised.length === 3
      ? normalised
          .split("")
          .map((c) => c + c)
          .join("")
      : normalised;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return 0.5;

  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(
    (channel) => {
      const srgb = channel / 255;
      return srgb <= 0.03928
        ? srgb / 12.92
        : Math.pow((srgb + 0.055) / 1.055, 2.4);
    }
  );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Pick the foreground that stays readable on the given background.
 * Dark text on light swatches, light text on dark ones.
 */
export function readableTextOn(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? "#1c1c1e" : "#f8fafc";
}

/**
 * A subtle border that keeps a light swatch visible on a light card.
 */
export function vehicleColorBorder(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)";
}
