import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Mobile drag-to-expand bottom sheet.
 *
 * Presentation only: it owns no data, calls no APIs and renders whatever it is
 * given. Desktop is left to the caller, which keeps its existing side-panel
 * layout and simply does not mount this.
 *
 * The sheet rests with `peekHeight` of itself visible, so the map behind it
 * stays in view. Dragging the handle (or tapping it) snaps between the peek and
 * the expanded height, which is capped so the map is never fully covered.
 */
export default function MobileSheet({
  children,
  /** Visible height of the sheet at rest. The rest of it slides below the fold. */
  peekHeight = 200,
  /** Expanded height as a share of the viewport. */
  expandedVh = 78,
  /** Label announced for the drag handle. */
  label = "Expand or collapse",
  className,
  contentClassName,
  /** Ref for the scrollable body, so callers can keep reveal-on-focus. */
  contentRef,
  /** Fired when a field inside the sheet takes focus. */
  onFieldFocus,
  /** Rendered instead of the default collapsed hint. */
  peekHint,
  /**
   * When set, the sheet becomes a plain static side panel at `lg` and up, using
   * these classes. That lets a caller keep ONE content tree for both
   * breakpoints instead of rendering it twice, which would double-fire any
   * effects inside it.
   */
  desktopClassName,
  /** Fired when the sheet settles in either position. */
  onExpandedChange,
}: {
  children: ReactNode;
  peekHeight?: number;
  expandedVh?: number;
  label?: string;
  className?: string;
  contentClassName?: string;
  contentRef?: Ref<HTMLDivElement>;
  onFieldFocus?: (field: HTMLElement) => void;
  peekHint?: ReactNode;
  desktopClassName?: string;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Below `lg` this is a floating sheet; at `lg` and up (when a
  // desktopClassName is supplied) the same DOM becomes a static side panel, so
  // the inline transform must be dropped.
  const [isDesktop, setIsDesktop] = useState(false);
  const dragState = useRef<{ startY: number; startOffset: number; lastY: number; lastT: number; velocity: number } | null>(null);

  useEffect(() => {
    if (!desktopClassName) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [desktopClassName]);

  const panelMode = Boolean(desktopClassName) && isDesktop;

  // Distance the sheet can travel: everything above the peek height.
  const [travel, setTravel] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const el = sheetRef.current;
      if (!el) return;
      setTravel(Math.max(0, el.offsetHeight - peekHeight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (sheetRef.current) ro.observe(sheetRef.current);
    return () => ro.disconnect();
  }, [peekHeight, children]);

  // The expanded height is viewport-relative, so it must be recomputed on
  // rotate/resize rather than baked into a class.
  useEffect(() => {
    const onResize = () => {
      const el = sheetRef.current;
      if (el) setTravel(Math.max(0, el.offsetHeight - peekHeight));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [peekHeight]);

  const settle = useCallback(
    (next: boolean) => {
      setExpanded(next);
      setDragOffset(0);
      onExpandedChange?.(next);
    },
    [onExpandedChange],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return; // mouse users get click-to-toggle
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      startY: event.clientY,
      startOffset: dragOffset,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
    };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const st = dragState.current;
    if (!st) return;
    const delta = event.clientY - st.startY;
    // Dragging up expands, dragging down collapses. Clamp so the sheet can
    // never be dragged past either end.
    const raw = st.startOffset + delta;
    const min = -travel;
    const next = Math.min(0, Math.max(min, raw));
    const dt = event.timeStamp - st.lastT;
    if (dt > 0) st.velocity = (event.clientY - st.lastY) / dt;
    st.lastY = event.clientY;
    st.lastT = event.timeStamp;
    setDragOffset(next);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const st = dragState.current;
    dragState.current = null;
    setDragging(false);
    if (!st) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // Flick wins over distance: a fast short flick should still change state.
    const flung = Math.abs(st.velocity) > 0.45;
    const pastMidpoint = dragOffset < -travel / 2;
    if (flung) settle(st.velocity < 0);
    else settle(pastMidpoint);
  };

  const onHandleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      settle(!expanded);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      settle(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      settle(false);
    } else if (event.key === "Escape") {
      settle(false);
    }
  };

  const shift = expanded ? -travel : 0;

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
        ref={sheetRef}
        className={cn(
          "pointer-events-auto flex flex-col overflow-hidden rounded-t-3xl border-x border-t border-border bg-card shadow-[0_-8px_32px_rgba(0,0,0,0.45)]",
          desktopClassName &&
            "lg:max-h-none lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none",
          dragging ? "" : "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        )}
        style={
          panelMode
            ? undefined
            : {
                maxHeight: `${expandedVh}svh`,
                transform: `translate3d(0, ${shift + dragOffset}px, 0)`,
              }
        }
      >
        {/* Drag handle doubles as the expand/collapse control. */}
        <div
          role="button"
          tabIndex={0}
          aria-label={label}
          aria-expanded={expanded}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (dragState.current === null && !dragging) settle(!expanded);
          }}
          onKeyDown={onHandleKeyDown}
          className={cn(
            "shrink-0 cursor-grab touch-none select-none px-4 pb-2 pt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 active:cursor-grabbing",
            desktopClassName && "lg:hidden",
          )}
        >
          <div className="mx-auto h-1.5 w-11 rounded-full bg-muted-foreground/35" />
        </div>

        {/* Collapsed: show a hint of what is below the fold. */}
        <div
          className={cn(
            "shrink-0 overflow-hidden px-4 pb-2 transition-opacity duration-200",
            desktopClassName && "lg:hidden",
          )}
          style={{ opacity: expanded ? 0 : 1, height: expanded ? 0 : undefined }}
          aria-hidden={expanded}
        >
          {peekHint ?? <SheetPeekHint />}
        </div>

        <div
          ref={contentRef}
          onFocusCapture={(event) => {
            const field = event.target;
            if (field instanceof HTMLElement && field.matches("input, textarea")) {
              onFieldFocus?.(field);
            }
          }}
          className={cn(
            "min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 pb-4",
            desktopClassName && "lg:overflow-y-auto lg:overscroll-contain",
            contentClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Default collapsed hint. Callers can hide it with MobileSheet's own slots. */
function SheetPeekHint() {
  return (
    <p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
      Drag up for details
    </p>
  );
}
