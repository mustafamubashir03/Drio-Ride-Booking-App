import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Banknote, Car, Home, LogOut, Navigation, User as UserIcon } from "lucide-react";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { cn } from "@/lib/utils";

const navItems: Array<{
  to: string;
  end?: boolean;
  label: string;
  icon: typeof Home;
  accent: "primary" | "blue" | "green" | "violet";
}> = [
  { to: "/driver/dashboard", end: true, label: "Home", icon: Home, accent: "primary" },
  { to: "/driver/dashboard/rides", label: "Rides", icon: Navigation, accent: "blue" },
  { to: "/driver/dashboard/earnings", label: "Earnings", icon: Banknote, accent: "green" },
  { to: "/driver/dashboard/profile", label: "Profile", icon: UserIcon, accent: "violet" },
];

const navAccentStyles: Record<
  (typeof navItems)[number]["accent"],
  { button: string; chip: string; ident: string }
> = {
  primary: {
    button: "bg-primary/12 text-primary",
    chip: "bg-primary/15 text-primary",
    ident: "bg-primary",
  },
  blue: {
    button: "bg-drio-blue/12 text-drio-blue",
    chip: "bg-drio-blue/15 text-drio-blue",
    ident: "bg-drio-blue",
  },
  green: {
    button: "bg-drio-success/12 text-drio-success",
    chip: "bg-drio-success/15 text-drio-success",
    ident: "bg-drio-success",
  },
  violet: {
    button: "bg-drio-violet/12 text-drio-violet",
    chip: "bg-drio-violet/15 text-drio-violet",
    ident: "bg-drio-violet",
  },
};

const TITLES: Record<string, string> = {
  "": "Driver Home",
  rides: "Rides",
  earnings: "Earnings",
  profile: "Profile",
};

function pageTitleFor(pathname: string) {
  const base = "/driver/dashboard";
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const key = rest.replace(/^\/+/, "").split("/")[0] ?? "";
  return TITLES[key] ?? "Driver Portal";
}

export default function DriverLayout() {
  const { data: session } = authClient.useSession();
  const user = (session as unknown as {
    user?: { name?: string; email?: string };
  })?.user;
  const location = useLocation();

  const handleSignOut = async () => {
    await authClient.signOut({ disableRedirect: false, callbackURL: "/login" });
  };

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[220px] flex-col border-r bg-sidebar">
        <div className="flex h-[64px] shrink-0 items-center px-5">
          <Logo />
        </div>

        <div className="mb-1 px-3">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Driver
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const accent = navAccentStyles[item.accent];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150",
                    isActive
                      ? accent.button
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                        isActive
                          ? accent.chip
                          : "bg-white/5 text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {item.label}
                    {isActive && (
                      <span className={cn("ml-auto h-1.5 w-1.5 rounded-full", accent.ident)} />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mx-3 my-4 rounded-2xl bg-primary/8 border border-primary/15 p-4">
          <p className="text-xs font-semibold text-primary mb-1">Driver portal</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Go online from Home to start receiving ride requests. Dispatch and
            live matching arrive in a future milestone.
          </p>
        </div>

        <div className="border-t border-border px-3 py-3 shrink-0">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
              {(user?.name ?? "D").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground leading-tight">
                {user?.name ?? "Driver"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">Driver</p>
            </div>
          </div>
          <AccountSwitcher>
            <Link to="/dashboard" className="mt-1 block">
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                <Car className="h-3.5 w-3.5" />
                Passenger app
              </Button>
            </Link>
            <button
              onClick={handleSignOut}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[12px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </AccountSwitcher>
        </div>
      </aside>

      {/* Main */}
      <div className="ml-[220px] flex flex-1 flex-col min-h-dvh">
        <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-border px-8">
          <h1 className="font-serif text-[20px] font-bold tracking-tight text-foreground leading-tight">
            {pageTitleFor(location.pathname)}
          </h1>
          <span className="rounded-full bg-drio-success/15 px-3 py-1 text-[11px] font-semibold text-drio-success">
            ● Driver
          </span>
        </header>

        <main className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}