import { useEffect, useState, type ReactNode, type Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp, MapPinned } from "lucide-react";
import { useMotionSystem } from "@/motion/use-motion";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom sheet with a single, explicit open/close control.
 *
 * Deliberately has NO drag/swipe gesture. The previous implementation tracked
 * pointer velocity and snapped to the nearest stop, which in practice fought
 * scrolling, could not be reliably dismissed, and on the passenger side expanded
 * to the top with no dependable way back down. Reliability beat the gesture, so
 * the gesture is gone rather than retuned.
 *
 * The sheet only ever moves between two fixed positions, and only ever in
 * response to the chevron button. No effect, map update, location change or
 * route change can move it, so the map camera stays independent of the sheet.
 */
export default function MobileSheet({
  children,
  /** Visible height at rest, so the map behind stays in view. */
  peekHeight = 200,
  /** Expanded height as a share of the viewport. */
  expandedVh = 78,
  label = "Show more",
  expandedLabel = "Show less",
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
   * Either a node, or a render prop receiving the current expanded state. The
   * render-prop form lets a caller present a genuinely different collapsed
   * summary while keeping ONE state owner, so the collapsed and expanded views
   * can never disagree about booking or ride status.
   */
  children: ReactNode | ((state: { expanded: boolean; panelMode: boolean }) => ReactNode);
  peekHeight?: number;
  expandedVh?: number;
  label?: string;
  expandedLabel?: string;
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
  const [expanded, setExpanded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(false);
  const { reduced } = useMotionSystem();

  useEffect(() => {
    if (!desktopClassName) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [desktopClassName]);

  const panelMode = Boolean(desktopClassName) && isDesktop;
  const isCollapsed =
    panelMode && desktopCollapsible
      ? desktopCollapsed ?? uncontrolledCollapsed
      : false;
  const setCollapsed = (next: boolean) => {
    if (onDesktopCollapsedChange) onDesktopCollapsedChange(next);
    if (desktopCollapsed === undefined) setUncontrolledCollapsed(next);
  };

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

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 lg:hidden",
        desktopClassName,
        className,
      )}
      style={panelMode ? undefined : { paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
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
        style={panelMode ? undefined : { maxHeight: `${expandedVh}svh` }}
      >
        {/* Desktop collapse control, when the caller opted in. Sits at the top of
            the floating panel, mirroring the mobile chevron below. */}
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

        {/* The one and only control. Fixed hit area, so it is always reachable
            and always does exactly one thing. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? expandedLabel : label}
          className={cn(
            "flex w-full shrink-0 items-center justify-center gap-1.5 px-4 pb-2 pt-3",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50",
            desktopClassName && "lg:hidden",
          )}
        >
          <span className="h-1.5 w-11 shrink-0 rounded-full bg-muted-foreground/35" aria-hidden="true" />
          <ChevronUp
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              expanded ? "rotate-180" : "rotate-0",
            )}
            aria-hidden="true"
          />
        </button>

        {/* Collapsed: a hint of what is below the fold. Fades rather than
            collapsing abruptly, so the change of state is legible. */}
        <AnimatePresence initial={false}>
          {!expanded && (
            <motion.div
              key="peek-hint"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.15, ease: "easeOut" }}
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

        {/* Collapsed: capped to the peek height but still scrollable, so a tall
            ride card can be read by scrolling without expanding first.
            Expanded: the body takes the full height and scrolls normally.
            There is no drag handler, so scrolling here can never move the
            sheet, and overscroll-contain stops the chain reaching the map. */}
        <div
          ref={contentRef}
          onFocusCapture={(event) => {
            const field = event.target;
            if (field instanceof HTMLElement && field.matches("input, textarea")) {
              // Tapping a field is a deliberate user action, so expanding here is
              // expected rather than surprising. It also guarantees a focused
              // input is never left out of view inside the collapsed peek.
              setExpanded(true);
              onFieldFocus?.(field);
            }
          }}
          className={cn(
            "overscroll-contain overflow-y-auto px-4 pb-4",
            desktopClassName ? "lg:min-h-0 lg:flex-1 lg:overflow-y-auto" : "min-h-0",
            expanded ? "flex-1" : "shrink-0",
            contentClassName,
          )}
          style={panelMode || expanded ? undefined : { maxHeight: peekHeight }}
        >
          {typeof children === "function" ? children({ expanded, panelMode }) : children}
        </div>
      </div>
    </div>
  );
}
