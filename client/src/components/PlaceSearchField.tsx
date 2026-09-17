import type { ReactNode } from "react";
import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlaceSearch } from "@/hooks/use-place-search";
import type { PlaceResult, SelectedLocation } from "@/lib/places-api";

interface PlaceSearchFieldProps {
  id: string;
  label: string;
  placeholder: string;
  icon: ReactNode;
  variant: "from" | "to";
  selectedLocation: SelectedLocation | null;
  onSelectLocation: (place: PlaceResult) => void;
  onDeselectLocation: () => void;
}

export default function PlaceSearchField({
  id,
  label,
  placeholder,
  icon,
  variant,
  selectedLocation,
  onSelectLocation,
  onDeselectLocation,
}: PlaceSearchFieldProps) {
  const placeSearch = usePlaceSearch();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const handleChange = (value: string) => {
    setText(value);
    if (selectedLocation && value.trim() !== selectedLocation.name) {
      onDeselectLocation();
    }
    placeSearch.setQuery(value);
  };

  const handleSelectPlace = (place: PlaceResult) => {
    setText(place.name);
    onSelectLocation(place);
    placeSearch.reset();
    setFocused(false);
  };

  const handleUseCurrentLocation = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation is not supported by this browser.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        handleSelectPlace({
          id: "current-location",
          name: "Current location",
          displayName: `Your current position · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          latitude,
          longitude,
        });
        setGeoBusy(false);
      },
      (err) => {
        setGeoBusy(false);
        if (err.code === 1) setGeoError("Location permission denied.");
        else if (err.code === 2) setGeoError("Location currently unavailable.");
        else if (err.code === 3) setGeoError("Location request timed out.");
        else setGeoError("Could not get your location.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  return (
    <div className="relative flex items-center gap-3">
      {variant === "from" ? (
        <div className="flex flex-col items-center shrink-0">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="w-px h-8 bg-border mt-1" />
        </div>
      ) : (
        <div className="flex flex-col items-center shrink-0">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-muted-foreground/60" />
        </div>
      )}

      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
          {label}
        </p>
        <Input
          id={id}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            setFocused(true);
            if (text.trim().length >= 2) {
              placeSearch.setQuery(text);
            }
          }}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          autoComplete="off"
          className="border-0 bg-transparent p-0 h-auto text-[13.5px] font-medium placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-0"
        />
      </div>
      {icon}

      {(placeSearch.status !== 'idle' || (variant === 'from' && focused)) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-border bg-popover p-0 overflow-hidden shadow-2xl">
          {variant === "from" && (
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={geoBusy}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-secondary/70 transition-colors border-b border-border disabled:opacity-60"
            >
              <LocateFixed className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="block text-[13px] font-semibold text-foreground">
                {geoBusy ? "Getting your location…" : "Use my current location"}
              </span>
            </button>
          )}
          {geoError && (
            <div className="px-4 py-3 text-[12px] text-destructive border-b border-border">
              {geoError}
            </div>
          )}
          {placeSearch.status === 'loading' && (
            <div className="px-4 py-3 text-[12px] text-muted-foreground">
              Searching locations…
            </div>
          )}
          {placeSearch.status === 'empty' && (
            <div className="px-4 py-3 text-[12px] text-muted-foreground">
              No locations found
            </div>
          )}
          {placeSearch.status === 'error' && (
            <div className="px-4 py-3 text-[12px] text-destructive">
              {placeSearch.error ?? 'Could not search locations right now.'}
            </div>
          )}
          {placeSearch.status === 'success' && (
            <ul className="max-h-64 overflow-y-auto py-1">
              {placeSearch.results.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectPlace(place)}
                    className="w-full px-4 py-2.5 text-left hover:bg-secondary/70 transition-colors"
                  >
                    <span className="block text-[13px] font-semibold text-foreground">
                      {place.name}
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground truncate">
                      {place.displayName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}