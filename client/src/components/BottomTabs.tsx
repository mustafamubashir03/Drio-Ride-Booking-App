import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { useMotionSystem } from "@/motion/use-motion";
import { cn } from "@/lib/utils";

/**
 * The single bottom-navigation component for the whole app.
 *
 * The passenger portal and the driver portal render the same control with the
 * same height, icon/label sizing, spacing, active treatment and colours. Only
 * the destinations differ, so the two portals cannot drift apart visually.
 *
 * Routing items pass `href` (rendered as a NavLink); stateful items pass
 * `activeKey` + `onSelect` (rendered as buttons).
 *
 * The active tab is an outlined shape with rounded top corners that rises out
 * of the bar. Its border is the Drio accent gradient, drawn as a gradient layer
 * with the bar's own background showing through the middle, so the "tab" reads
 * as connected to the navigation area rather than floating above it.
 */

export type BottomTabItem = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Route destination. When omitted the item is a controlled button. */
  href?: string;
  /** Only meaningful with href. */
  end?: boolean;
};

/**
 * The active tab is marked by a solid accent bar attached to the TOP edge of the
 * tab, narrow rather than full-width, with rounded bottom corners so it reads as
 * hanging from the top of the tab rather than floating inside it.
 *
 * This is a solid shape on purpose: no border on any side, no outline, no pill.
 * The top corners stay square so the bar is flush with the top of the tab.
 */
function ActiveTabIndicator({ reduced }: { reduced: boolean }) {
  return (
    <motion.span
      layoutId="bottom-tabs-active-indicator"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-[32%] top-0 h-[6px] rounded-b-lg bg-primary"
      transition={{ duration: reduced ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
    />
  );
}

export default function BottomTabs({
  items,
  ariaLabel,
  activeKey,
  onSelect,
  className,
  heightClass = "h-[4.25rem]",
}: {
  items: BottomTabItem[];
  ariaLabel: string;
  activeKey?: string;
  onSelect?: (key: string) => void;
  className?: string;
  heightClass?: string;
}) {
  const { reduced } = useMotionSystem();

  const inner = (isActive: boolean, item: BottomTabItem) => (
    <>
      {isActive && <ActiveTabIndicator reduced={reduced} />}
      <span className="relative z-10 flex items-center justify-center">
        <item.icon
          strokeWidth={isActive ? 2.2 : 1.9}
          className={cn(
            "h-5 w-5 transition-colors duration-150",
            isActive ? "text-primary" : "text-muted-foreground/75",
          )}
        />
      </span>
      <span
        className={cn(
          "relative z-10 text-[10.5px] font-semibold tracking-wide leading-none transition-colors duration-150",
          isActive ? "text-primary" : "text-muted-foreground/75",
        )}
      >
        {item.label}
      </span>
    </>
  );

  const buttonClass = cn(
    "relative flex flex-1 flex-col items-center justify-center gap-[0.3rem] px-1.5 pb-1.5 pt-2 transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/45",
    "motion-safe:active:scale-[0.98] motion-reduce:transition-none",
  );

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:hidden", className)}
      style={{
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Lightly separated rather than a heavy opaque slab over the map. */}
      <div
        className={cn(
          "pointer-events-auto relative mx-auto flex max-w-md items-stretch overflow-hidden rounded-[1.5rem] border border-border/70",
          "bg-sidebar/75 shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-md",
          heightClass,
        )}
      >
        {items.map((item) =>
          item.href ? (
            <NavLink
              key={item.key}
              to={item.href}
              end={item.end}
              className={buttonClass}
            >
              {({ isActive }) => inner(isActive, item)}
            </NavLink>
          ) : (
            <button
              key={item.key}
              type="button"
              id={`bottom-tab-${item.key}`}
              onClick={() => onSelect?.(item.key)}
              aria-current={activeKey === item.key ? "page" : undefined}
              className={buttonClass}
            >
              {inner(activeKey === item.key, item)}
            </button>
          ),
        )}
      </div>
    </nav>
  );
}
