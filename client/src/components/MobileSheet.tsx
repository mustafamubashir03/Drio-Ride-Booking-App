import { useEffect, useState, type ReactNode, type Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp } from "lucide-react";
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
}: {
  /**
   * Either a node, or a render prop receiving the current expanded state. The
   * render-prop form lets a caller present a genuinely different collapsed
   * summary while keeping ONE state owner, so the collapsed and expanded views
   * can never disagree about booking or ride status.
   */
  children: ReactNode | ((state: { expanded: boolean }) => ReactNode);
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
}) {
  const [expanded, setExpanded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
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
          desktopClassName &&
            "lg:max-h-none lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none",
        )}
        style={panelMode ? undefined : { maxHeight: `${expandedVh}svh` }}
      >
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
          {typeof children === "function" ? children({ expanded }) : children}
        </div>
      </div>
    </div>
  );
}
