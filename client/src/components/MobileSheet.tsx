import { useEffect, useState, type ReactNode, type Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp, MapPinned } from "lucide-react";
import { useMotionSystem } from "@/motion/use-motion";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet with three explicit stops and one control.
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
 */
type SheetStop = "collapsed" | "peek" | "expanded";

const NEXT_STOP: Record<SheetStop, SheetStop> = {
  collapsed: "peek",
  peek: "expanded",
  expanded: "collapsed",
};

/** Handle height, fixed so the collapsed stop is exact rather than measured. */
const HANDLE_HEIGHT = 44;

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
  /**
   * Opt in to a desktop collapse control. Off by default, so the driver's
   * existing static side panel is unaffected until a caller asks for it.
   */
  desktopCollapsible = false,
  /** Controlled desktop collapse state. Omit to let the sheet own it. */
  desktopCollapsed,
  onDesktopCollapsedChange,
  desktopCollapseLabel = "Collapse panel",
  desktopExpandLabel = "Expand panel",
  /** Short summary shown beside the desktop collapse control. */
  desktopTitle,
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
  desktopCollapsible?: boolean;
  desktopCollapsed?: boolean;
  onDesktopCollapsedChange?: (collapsed: boolean) => void;
  desktopCollapseLabel?: string;
  desktopExpandLabel?: string;
  desktopTitle?: string;
}) {
  const [stop, setStop] = useState<SheetStop>("peek");
  const [isDesktop, setIsDesktop] = useState(false);
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(false);
  const { reduced, transition } = useMotionSystem();

  useEffect(() => {
    if (!desktopClassName) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [desktopClassName]);

  const panelMode = Boolean(desktopClassName) && isDesktop;
  const expanded = stop === "expanded";
  const isCollapsed =
    panelMode && desktopCollapsible
      ? desktopCollapsed ?? uncontrolledCollapsed
      : false;
  const setCollapsed = (next: boolean) => {
    if (onDesktopCollapsedChange) onDesktopCollapsedChange(next);
    if (desktopCollapsed === undefined) setUncontrolledCollapsed(next);
  };

  const nextStop = NEXT_STOP[stop];

  // Collapsed on desktop: a small pill in the bottom-left corner. The content
  // stays mounted (and therefore keeps its state) but is hidden, so nothing is
  // unmounted, no effect re-runs, and no data is discarded.
  if (panelMode && desktopCollapsible && isCollapsed) {
    return (
      <div className={cn("pointer-events-none absolute bottom-0 z-20 lg:pointer-events-auto", desktopClassName, className)}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-expanded={false}
          aria-label={desktopExpandLabel}
          className={cn(
            "pointer-events-auto m-4 flex items-center gap-2 rounded-full border border-border/70 bg-sidebar/85 px-4 py-2.5",
            "text-[12px] font-semibold text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.30)] backdrop-blur-md",
            "transition-colors hover:bg-sidebar",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            "motion-safe:active:scale-[0.98]",
          )}
        >
          <MapPinned className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          {desktopExpandLabel}
        </button>
      </div>
    );
  }

  // The sheet's height is the animated value. Desktop panel mode is left
  // unconstrained so the card can be as tall as its column layout needs.
  const targetMaxHeight = panelMode
    ? undefined
    : stop === "collapsed"
      ? HANDLE_HEIGHT
      : stop === "expanded"
        ? `${expandedVh}svh`
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
          // A collapsible desktop panel supplies its own card chrome (surface,
          // border, radius, height cap) via desktopClassName, so only a
          // non-collapsible desktop panel is flattened into a bare column.
          desktopClassName &&
            !desktopCollapsible &&
            "lg:max-h-none lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none",
          // The collapsible card is bounded so it can never grow into the map.
          desktopCollapsible &&
            "lg:max-h-[calc(100%-3rem)] lg:rounded-2xl lg:border lg:border-border/70 lg:bg-background/95 lg:shadow-[0_18px_50px_rgba(0,0,0,0.42)] lg:backdrop-blur-md",
        )}
        // Height is what moves, so the spring carries the whole travel. Duration
        // transitions on max-height look like the sheet is being dragged by a
        // rope; a spring settles instead.
        animate={panelMode ? undefined : { maxHeight: targetMaxHeight }}
        initial={false}
        transition={transition.spring}
      >
        {/* Desktop collapse control, when the caller opted in. Sits at the top of
            the floating panel, mirroring the mobile handle below. */}
        {panelMode && desktopCollapsible && (
          <div className="hidden shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 lg:flex">
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              {desktopTitle ?? ""}
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-expanded={true}
              aria-label={desktopCollapseLabel}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-muted-foreground",
                "transition-colors hover:bg-white/5 hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              )}
            >
              <ChevronUp className="h-4 w-4 rotate-180" aria-hidden="true" />
              Collapse
            </button>
          </div>
        )}

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

        {/* Scrolls internally, and there is no drag handler, so scrolling here can
            never move the sheet; overscroll-contain stops the chain reaching the
            map. The collapsed stop keeps this mounted so nothing is unmounted
            and no form state is lost. */}
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
            desktopClassName ? "lg:min-h-0 lg:flex-1 lg:overflow-y-auto" : "min-h-0",
            expanded ? "flex-1" : "shrink-0",
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
