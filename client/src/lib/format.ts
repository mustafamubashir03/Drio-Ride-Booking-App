export function formatDistance(meters: number | null | undefined) {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return "—";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return `${Math.round(seconds)} sec`;
  return `${minutes} min`;
}

export function formatFare(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `PKR ${Math.round(value).toLocaleString("en-US")}`;
}

export function formatCoordinates(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "—";
  return `Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`;
}

export function formatPlace(place: {
  name?: string;
  displayName?: string;
  latitude: number;
  longitude: number;
}) {
  if (place.displayName || place.name) {
    return place.displayName ?? place.name!;
  }
  return formatCoordinates(place.latitude, place.longitude);
}

export function formatDate(iso: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", options ?? { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined) {
  return formatDate(iso, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}