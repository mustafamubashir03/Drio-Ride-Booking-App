import { Home, History, User as UserIcon } from "lucide-react";
import BottomTabs, { type BottomTabItem } from "@/components/BottomTabs";

type Tab = "home" | "history" | "account";

/**
 * Passenger bottom navigation. Thin wrapper over the shared BottomTabs so the
 * passenger and driver portals are guaranteed to render the same control.
 */
const navItems: BottomTabItem[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "history", label: "History", icon: History },
  { key: "account", label: "Account", icon: UserIcon },
];

export default function BottomNav({
  activeTab,
  onTabChange,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  return (
    <BottomTabs
      items={navItems}
      ariaLabel="Main navigation"
      activeKey={activeTab}
      onSelect={(key) => onTabChange(key as Tab)}
    />
  );
}
