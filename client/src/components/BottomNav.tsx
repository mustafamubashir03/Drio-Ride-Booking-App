import { Home, History, User as UserIcon } from "lucide-react";
import { motion } from "motion/react";

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
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-30 w-screen lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Blur backdrop */}
      <div className="absolute inset-0 bg-sidebar/90 backdrop-blur-xl border-t border-border" />

      <div className="relative flex h-[60px] items-stretch">
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
              className="relative flex flex-1 flex-col items-center justify-center gap-[3px] transition-all duration-150 active:scale-95"
            >
              {/* Active indicator pill behind icon */}
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-pill"
                  className={`absolute inset-x-[20%] top-[6px] h-[32px] rounded-xl ${accent.bg}`}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                />
              )}

              <span className="relative z-10 flex items-center justify-center">
                <Icon
                  className={`h-[18px] w-[18px] transition-colors duration-150 ${
                    isActive ? accent.icon : "text-muted-foreground"
                  }`}
                />
              </span>
              <span
                className={`relative z-10 text-[10px] font-semibold tracking-wide transition-colors duration-150 leading-none ${
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
