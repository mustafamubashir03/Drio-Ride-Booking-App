import { useEffect, useState, type ReactNode, type Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp } from "lucide-react";
import { useMotionSystem } from "@/motion/use-motion";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom sheet with three explicit stops and one control.
 *
 * Stops, in the order the control cycles through them:
 *   collapsed  the sheet is just its handle, flush with the bottom edge
 *   peek       the resting height, so the map behind stays in view (default)
 *   expanded   most of the viewport, for the full form
 *
 * The chevron always points at the NEXT stop, so the control explains itself:
 * up while there is more sheet above, down once the sheet is at its largest.
 *
 * Deliberately has NO drag/swipe gesture. A previous implementation tracked
 * pointer velocity and snapped to the nearest stop, which in practice fought
 * scrolling, could not be reliably dismissed, and on the passenger side expanded
 * to the top with no dependable way back down. Reliability beat the gesture, so
 * the gesture is gone rather than retuned: every position change comes from the
 * control, driven by a spring so the travel still feels physical.
 *
 * No effect, map update, location change or route change can move the sheet, so
 * the map camera stays independent of it.
 *
 * At `lg` this is still only a static side panel, exactly as before. All of the
 * three-stop behaviour and all of the animation is scoped below `lg`.
 */
type SheetStop = "collapsed" | "peek" | "expanded";

const NEXT_STOP: Record<SheetStop, SheetStop> = {
  collapsed: "peek",
  peek: "expanded",
  expanded: "collapsed",
};

/** Handle height, fixed so the collapsed stop is exact rather than measured. */
const HANDLE_HEIGHT = 44;

const DESKTOP_QUERY = "(min-width: 1024px)";

export default function MobileSheet({
  children,
  /** Visible height at rest, so the map behind stays in view. */
  peekHeight = 200,
  /** Expanded height as a share of the viewport. */
  expandedVh = 78,
  label = "Show more",
  expandedLabel = "Show less",
  collapsedLabel = "Collapse",
  className,
  contentClassName,
  contentRef,
  onFieldFocus,
  peekHint,
  /** At `lg` the same DOM becomes a static side panel via these classes. */
  desktopClassName,
}: {
  /**
   * Either a node, or a render prop receiving the current state. The render-prop
   * form lets a caller present a genuinely different collapsed summary while
   * keeping ONE state owner, so the collapsed and expanded views can never
   * disagree about booking or ride status.
   */
  children: ReactNode | ((state: {
    expanded: boolean;
    panelMode: boolean;
    stop: SheetStop;
  }) => ReactNode);
  peekHeight?: number;
  expandedVh?: number;
  label?: string;
  expandedLabel?: string;
  collapsedLabel?: string;
  className?: string;
  contentClassName?: string;
  contentRef?: Ref<HTMLDivElement>;
  onFieldFocus?: (field: HTMLElement) => void;
  peekHint?: ReactNode;
  desktopClassName?: string;
}) {
  const [stop, setStop] = useState<SheetStop>("peek");
  // Seeded synchronously, not from an effect. Reading this in an effect meant
  // the first paint on a desktop screen still ran the mobile branch and briefly
  // applied the phone's resting height before correcting itself.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
  );
  // The three stops resolve to PIXELS so the spring animates between one unit
  // only. Mixing a number with an "svh" string is what made the travel
  // unreliable, and it is why the svh cap below is kept in plain CSS as the
  // authority rather than left to the animation.
  const [viewportHeight, setViewportHeight] = useState(0);
  const { reduced, transition } = useMotionSystem();

  useEffect(() => {
    if (!desktopClassName) return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [desktopClassName]);

  useEffect(() => {
    const sync = () => setViewportHeight(window.innerHeight);
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  const panelMode = Boolean(desktopClassName) && isDesktop;
  const expanded = stop === "expanded";
  const nextStop = NEXT_STOP[stop];

  // Before the first measurement (and on a server render) there is no viewport
  // to measure, so it falls back to the resting height rather than guessing.
  const stopHeight = panelMode
    ? undefined
    : stop === "collapsed"
      ? HANDLE_HEIGHT
      : stop === "expanded"
        ? Math.round((viewportHeight * expandedVh) / 100) || peekHeight
        : peekHeight;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 lg:hidden",
        desktopClassName,
        className,
      )}
      style={panelMode ? undefined : { paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <motion.div
        className={cn(
          "pointer-events-auto flex flex-col overflow-hidden rounded-t-3xl border-x border-t border-border bg-card shadow-[0_-8px_32px_rgba(0,0,0,0.45)]",
          desktopClassName &&
            "lg:h-auto lg:max-h-none lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none",
        )}
        // Height is the animated value, in pixels at every stop, so the spring
        // carries the whole travel between consistent units.
        animate={panelMode ? undefined : { height: stopHeight }}
        initial={false}
        transition={transition.spring}
        // The cap stays in plain CSS and stays the authority. It guarantees the
        // sheet can never exceed the viewport even if the measured pixel height
        // is generous, and it is correct on a phone because "svh" excludes the
        // browser chrome that innerHeight includes.
        style={panelMode ? undefined : { maxHeight: `${expandedVh}svh` }}
      >
        {/* The one and only control. Fixed hit area, so it is always reachable and
            always does exactly one thing: advance to the next stop. */}
        <button
          type="button"
          onClick={() => setStop(nextStop)}
          aria-expanded={expanded}
          aria-label={
            nextStop === "expanded" ? label : nextStop === "collapsed" ? collapsedLabel : expandedLabel
          }
          className={cn(
            "flex w-full shrink-0 items-center justify-center gap-1.5 px-4",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50",
            desktopClassName && "lg:hidden",
          )}
          style={{ height: HANDLE_HEIGHT }}
        >
          <motion.span
            className="h-1.5 w-11 shrink-0 rounded-full bg-muted-foreground/35"
            aria-hidden="true"
            // The grabber stretches a little as the sheet moves, which is what
            // sells the travel as physical rather than a height swap.
            animate={{ scaleX: stop === "collapsed" ? 0.7 : 1 }}
            transition={transition.spring}
          />
          <motion.span
            className="flex h-4 w-4 shrink-0 items-center justify-center"
            aria-hidden="true"
            animate={{ rotate: nextStop === "collapsed" ? 180 : 0 }}
            transition={transition.spring}
          >
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          </motion.span>
        </button>

        {/* Peek only: a hint of what is below the fold. Cross-fades on the same
            spring so it never pops. */}
        <AnimatePresence initial={false}>
          {stop === "peek" && (
            <motion.div
              key="peek-hint"
              initial={reduced ? false : { opacity: 0, y: reduced ? 0 : -4 }}
              animate={{ opacity: 1, y: 0, transition: transition.spring }}
              exit={reduced ? undefined : { opacity: 0, y: reduced ? 0 : 4, transition: transition.fast }}
              className={cn(
                "shrink-0 overflow-hidden px-4 pb-2",
                desktopClassName && "lg:hidden",
              )}
            >
              {peekHint ?? (
                <p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                  Tap to expand
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bounded and scrollable at EVERY stop. The card carries an explicit
            pixel height, so a plain flex child with min-h-0 is what makes the
            content scroll instead of being clipped away. Previously this was
            "flex-1" only when expanded and "shrink-0" otherwise, so at the
            smaller stops the element took its full content height and
            overflow-y-auto had nothing to scroll: the lower half of the form was
            unreachable. The collapsed stop keeps this mounted so nothing is
            unmounted and no form state is lost. */}
        <div
          ref={contentRef}
          onFocusCapture={(event) => {
            const field = event.target;
            if (field instanceof HTMLElement && field.matches("input, textarea")) {
              // Tapping a field is a deliberate user action, so expanding here is
              // expected rather than surprising. It also guarantees a focused
              // input is never left out of view inside a collapsed sheet.
              if (stop !== "expanded") setStop("expanded");
              onFieldFocus?.(field);
            }
          }}
          aria-hidden={stop === "collapsed" || undefined}
          className={cn(
            "overscroll-contain overflow-y-auto px-4 pb-4",
            "min-h-0 flex-1",
            desktopClassName && "lg:overflow-y-auto",
            stop === "collapsed" && "pointer-events-none",
            contentClassName,
          )}
        >
          {typeof children === "function" ? children({ expanded, panelMode, stop }) : children}
        </div>
      </motion.div>
    </div>
  );
}
