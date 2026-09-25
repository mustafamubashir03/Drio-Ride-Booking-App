import { Home, History, User as UserIcon } from "lucide-react";
import { motion } from "motion/react";
import { useMotionSystem } from "@/motion/use-motion";

type Tab = "home" | "history" | "account";

type NavItem = {
  icon: typeof Home;
  label: string;
  id: Tab;
  accent: "primary" | "blue" | "violet";
};

const navItems: NavItem[] = [
  { icon: Home, label: "Home", id: "home", accent: "primary" },
  { icon: History, label: "History", id: "history", accent: "blue" },
  { icon: UserIcon, label: "Account", id: "account", accent: "violet" },
];

const navAccentStyles: Record<NavItem["accent"], { icon: string; label: string; dot: string; bg: string }> = {
  primary: {
    icon: "text-primary",
    label: "text-primary",
    dot: "bg-primary",
    bg: "bg-primary/10",
  },
  blue: {
    icon: "text-drio-blue",
    label: "text-drio-blue",
    dot: "bg-drio-blue",
    bg: "bg-drio-blue/10",
  },
  violet: {
    icon: "text-drio-violet",
    label: "text-drio-violet",
    dot: "bg-drio-violet",
    bg: "bg-drio-violet/10",
  },
};

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { reduced } = useMotionSystem();

  return (
    <nav
      aria-label="Main navigation"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden"
      style={{
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="pointer-events-auto relative mx-auto flex h-12 max-w-md items-stretch overflow-hidden rounded-[1.25rem] border border-border/80 bg-sidebar/90 shadow-[0_12px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const accent = navAccentStyles[item.accent];

          return (
            <button
              key={item.id}
              type="button"
              id={`mobile-nav-${item.id}`}
              onClick={() => onTabChange(item.id)}
              aria-current={isActive ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/45 motion-safe:active:scale-[0.98] motion-reduce:transition-none"
            >
              {/* Active indicator pill behind icon */}
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-pill"
                  className={`absolute inset-x-[18%] top-1.5 h-9 rounded-xl ${accent.bg}`}
                   transition={{ duration: reduced ? 0 : 0.2, ease: "easeOut" }}
                />
              )}

              <span className="relative z-10 flex items-center justify-center">
                <Icon
                  className={`h-[17px] w-[17px] transition-colors duration-150 ${
                    isActive ? accent.icon : "text-muted-foreground"
                  }`}
                />
              </span>
              <span
                className={`relative z-10 text-[9.5px] font-semibold tracking-wide transition-colors duration-150 leading-none ${
                  isActive ? accent.label : "text-muted-foreground/70"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
