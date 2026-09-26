import { AnimatePresence, motion } from "motion/react";
import { Loader2, LocateFixed, MapPin, ShieldAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMotionSystem } from "@/motion/use-motion";
import { cn } from "@/lib/utils";

/**
 * Presentational only. It never touches the Geolocation API itself: the caller
 * owns the existing permission/location logic and passes the state in, so this
 * cannot change how location is requested or retried.
 */
export type LocationUiState =
  | "prompt"
  | "loading"
  | "granted"
  | "unavailable"
  | "denied"
  | "unsupported";

type Copy = {
  title: string;
  body: string;
  icon: typeof MapPin;
  tone: string;
  showAction: boolean;
};

const COPY: Record<LocationUiState, Copy> = {
  prompt: {
    title: "Use your location",
    body: "Drio needs your location to set pickup, find nearby drivers and give you an accurate ETA. It is only read while the app is open.",
    icon: LocateFixed,
    tone: "text-primary",
    showAction: true,
  },
  loading: {
    title: "Finding your location",
    body: "Hold still for a moment while we get a fix.",
    icon: Loader2,
    tone: "text-primary",
    showAction: false,
  },
  granted: {
    title: "Location on",
    body: "Pickup and ETAs are using your live position.",
    icon: MapPin,
    tone: "text-drio-success",
    showAction: false,
  },
  unavailable: {
    title: "Location unavailable",
    body: "We could not get a fix right now. You can still search for a pickup point by hand, or try again in a moment.",
    icon: WifiOff,
    tone: "text-drio-warning",
    showAction: true,
  },
  denied: {
    title: "Location blocked",
    body: "Your browser is blocking location access, so pickup and ETAs cannot use it. Re-allow it from the site settings in your browser, then come back — we will not keep asking.",
    icon: ShieldAlert,
    tone: "text-destructive",
    showAction: false,
  },
  unsupported: {
    title: "Location not supported",
    body: "This browser does not expose a location API. Search for your pickup point manually instead.",
    icon: ShieldAlert,
    tone: "text-muted-foreground",
    showAction: false,
  },
};

export default function LocationPermission({
  state,
  onRequest,
  className,
  compact = false,
}: {
  state: LocationUiState;
  /** Calls the caller's existing "use my location" handler. Never called for denied/unsupported. */
  onRequest?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const { title, body, icon: Icon, tone, showAction } = COPY[state];
  const spinning = state === "loading";
  const { reduced } = useMotionSystem();

  return (
    <div
      className={cn(
        "flex gap-3 rounded-2xl border border-border bg-muted/25",
        compact ? "px-3 py-2.5" : "px-4 py-3.5",
        className,
      )}
      // Permission state is announced so a screen reader hears the change
      // without the user hunting for it.
      role="status"
      aria-live="polite"
    >
      <span className={cn("mt-0.5 shrink-0", tone)}>
        <Icon className={cn("h-4 w-4", spinning && "animate-spin")} aria-hidden="true" />
      </span>

      {/* Cross-fade on state change so moving from loading to granted (or to
          denied) reads as a transition instead of a jump. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }}
          className="min-w-0 flex-1"
        >
          <p className="text-[13px] font-semibold leading-tight text-foreground">
            {title}
          </p>
          {!compact && (
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {body}
            </p>
          )}

          {showAction && onRequest && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRequest}
              className="mt-2.5 h-8 rounded-lg px-3 text-[12px] font-semibold"
            >
              {state === "unavailable" ? "Try again" : "Allow location"}
            </Button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
