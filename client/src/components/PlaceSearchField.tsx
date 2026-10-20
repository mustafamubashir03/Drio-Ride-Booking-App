import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Crosshair, LocateFixed, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlaceSearch } from "@/hooks/use-place-search";
import { AnimatePresence, motion } from "motion/react";
import { useMotionSystem } from "@/motion/use-motion";
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
  pinActive?: boolean;
  onPinToggle?: () => void;
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
  pinActive = false,
  onPinToggle,
}: PlaceSearchFieldProps) {
  const placeSearch = usePlaceSearch();
  const { popover, reduced } = useMotionSystem();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const geoBusyRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Identifies the in-flight "use my current location" request. Anything that
  // supersedes it — a newer request, a pin dropped on the map, or the watchdog
  // below — advances this counter, which is what turns a late geolocation
  // callback into a no-op instead of something that overwrites a newer choice
  // or leaves the row stuck on "Getting your location…" forever.
  const geoRequestRef = useRef(0);
  const geoWatchdogRef = useRef<number | null>(null);
  // The last selection this field was told about, so a pickup set from OUTSIDE
  // it (a pin dropped on the map) is recognised as an external change.
  const syncedSelectionRef = useRef<SelectedLocation | null>(null);

  useEffect(() => {
    geoBusyRef.current = geoBusy;
  }, [geoBusy]);

  useEffect(() => {
    return () => {
      if (geoWatchdogRef.current !== null) window.clearTimeout(geoWatchdogRef.current);
    };
  }, []);

  // The popover is forced open while `geoError` is set, so without a dismissal
  // path the notice never leaves the screen. Pressing anywhere outside the
  // field ends the interaction that produced it and clears it; the inline ✕ on
  // the error row does the same without leaving the field.
  useEffect(() => {
    if (!geoError) return;
    const handleOutsidePress = (event: MouseEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) setGeoError(null);
    };
    document.addEventListener("mousedown", handleOutsidePress);
    return () => document.removeEventListener("mousedown", handleOutsidePress);
  }, [geoError]);

  // This field owns only its own `text`, while the selection is owned by the
  // parent — so a pin dropped on the map changes `selectedLocation` without
  // touching `text`, and the row would keep showing the previous value whenever
  // the input is focused. Syncing here is what makes From show the picked
  // position. It also settles the race with an in-flight "use my current
  // location": the deliberate, newer selection wins and the pending fix is
  // dropped rather than arriving late and overwriting it.
  useEffect(() => {
    if (!selectedLocation) {
      syncedSelectionRef.current = null;
      return;
    }
    if (syncedSelectionRef.current === selectedLocation) return;
    syncedSelectionRef.current = selectedLocation;
    setText(selectedLocation.name);
    setGeoError(null);
    if (geoBusyRef.current) {
      geoRequestRef.current += 1;
      geoBusyRef.current = false;
      setGeoBusy(false);
    }
  }, [selectedLocation]);

  const displayValue = focused
    ? text
    : selectedLocation
      ? selectedLocation.name
      : text;

  const handleChange = (value: string) => {
    setText(value);
    setGeoError(null);
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

  const handleClear = () => {
    onDeselectLocation();
    setText("");
    setGeoError(null);
    placeSearch.reset();
    setFocused(false);
  };

  const requestLocation = () => {
    const request = geoRequestRef.current + 1;
    geoRequestRef.current = request;
    const isCurrent = () => geoRequestRef.current === request;
    const settle = () => {
      geoRequestRef.current = request + 1;
      if (geoWatchdogRef.current !== null) {
        window.clearTimeout(geoWatchdogRef.current);
        geoWatchdogRef.current = null;
      }
    };

    setGeoBusy(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isCurrent()) return;
        settle();
        const { latitude, longitude } = pos.coords;
        setGeoBusy(false);
        handleSelectPlace({
          id: "current-location",
          name: "Current location",
          displayName: `Your current position · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          latitude,
          longitude,
        });
      },
      (err) => {
        if (!isCurrent()) return;
        settle();
        setGeoBusy(false);
        setFocused(true);
        if (err.code === 1) setGeoError("Location permission denied.");
        else if (err.code === 2) setGeoError("Location currently unavailable.");
        else if (err.code === 3) setGeoError("Location request timed out.");
        else setGeoError("Could not get your location.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );

    // Safety net for a browser that never answers. `timeout` above is supposed
    // to make the error callback fire, but some silent-denial and cross-origin
    // cases call neither callback at all, and then the row sat on "Getting your
    // location…" forever — which also kept the popover pinned open and hid the
    // real pickup behind it.
    geoWatchdogRef.current = window.setTimeout(() => {
      if (!isCurrent()) return;
      settle();
      setGeoBusy(false);
      setGeoError("Location request timed out.");
    }, 12000);
  };

  const cancelLocationRequest = () => {
    // Supersede whatever is in flight: its callbacks check the token before
    // doing anything, so a late geolocation result becomes a no-op instead of
    // resurrecting a request the user has already walked away from.
    geoRequestRef.current += 1;
    if (geoWatchdogRef.current !== null) {
      window.clearTimeout(geoWatchdogRef.current);
      geoWatchdogRef.current = null;
    }
    geoBusyRef.current = false;
    setGeoBusy(false);
  };

  const handleUseCurrentLocation = () => {
    // A fresh attempt supersedes anything still in flight, so a fix from an
    // earlier press cannot land in the middle of this one.
    geoRequestRef.current += 1;
    geoBusyRef.current = false;
    setGeoBusy(false);
    setGeoError(null);
    setFocused(true);
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation is not supported by this browser.");
      return;
    }
    const permissions = (
      navigator as { permissions?: { query: (desc: PermissionDescriptor) => Promise<PermissionStatus> } }
    ).permissions;
    if (permissions?.query) {
      permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (status.state === "denied") {
            setGeoError(
              "Location access is blocked for this site. Allow location in your browser settings, then try again.",
            );
            setFocused(true);
            return;
          }
          requestLocation();
        })
        .catch(() => requestLocation());
    } else {
      requestLocation();
    }
  };

  return (
    <div ref={rootRef} className="relative flex items-center gap-3">
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

      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
          {label}
        </p>
        <Input
          id={id}
          value={displayValue}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            setFocused(true);
            // A fresh focus is a fresh attempt, so a stale failure is dropped
            // instead of being re-shown over the field the user just tapped.
            setGeoError(null);
            if (text.trim().length >= 2) {
              placeSearch.setQuery(text);
            }
          }}
          onBlur={() =>
            // Focus no longer has to be held open while a fix is in flight: the
            // popover's own condition already keeps it up on `geoBusy` or
            // `geoError`. Holding focus here instead is what pinned the input
            // onto its stale text, so a pin dropped on the map never showed.
            window.setTimeout(() => setFocused(false), 120)
          }
          placeholder={placeholder}
          autoComplete="off"
           className="border-0 bg-transparent p-0 h-auto text-base font-medium placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-0 sm:text-[13.5px]"
        />
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {selectedLocation && (
          <button
            type="button"
            id={`${id}-clear`}
            onClick={handleClear}
            aria-label={`Remove ${label}`}
            title={`Remove ${label}`}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {onPinToggle && (
          <button
            type="button"
            id={`${id}-pin`}
            onClick={onPinToggle}
            aria-label={`Place ${label} on the map`}
            title={
              pinActive
                ? `Done placing ${label} on the map`
                : `Place ${label} on the map`
            }
            className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${pinActive
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
              }`}
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
        )}
        {icon}
      </div>

      <AnimatePresence>
        {(placeSearch.status !== 'idle' ||
          (variant === 'from' && (focused || geoBusy || geoError))) && (
            <motion.div
              initial={reduced ? false : "hidden"}
              animate={reduced ? undefined : "visible"}
              exit={reduced ? undefined : "exit"}
              variants={popover}
              className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-border bg-popover p-0 overflow-hidden shadow-2xl"
            >
              {/* Offered only while nothing has been chosen yet: once a pin or a
                  picked result exists, this row would just be a way to undo the
                  user's selection by accident, so it leaves with the selection.
                  While a request is in flight the same slot keeps a visible
                  cancel, because the browser gives no guarantee the request
                  ever answers. */}
              {variant === "from" && !selectedLocation &&
                (geoBusy ? (
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                    <LocateFixed className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="block min-w-0 flex-1 text-[13px] font-semibold text-foreground">
                      Getting your location…
                    </span>
                    <button
                      type="button"
                      onClick={cancelLocationRequest}
                      aria-label="Cancel location request"
                      title="Cancel"
                      className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-secondary/70 transition-colors border-b border-border"
                  >
                    <LocateFixed className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="block text-[13px] font-semibold text-foreground">
                      Use my current location
                    </span>
                  </button>
                ))}
              {geoError && (
                <div className="flex items-start gap-2 border-b border-border px-4 py-3 text-[12px] text-destructive">
                  <span className="min-w-0 flex-1">{geoError}</span>
                  <button
                    type="button"
                    onClick={() => setGeoError(null)}
                    aria-label="Dismiss location message"
                    title="Dismiss"
                    className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
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
            </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
}