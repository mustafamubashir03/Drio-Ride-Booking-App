import { useEffect, useState, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { ensureMyDriverApplication } from "@/hooks/queries/use-driver";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "motion/react";
import { useMotionSystem } from "@/motion/use-motion";
import {
  ChevronDown,
  LogOut,
  Car,
  Shield,
  User as UserIcon,
  CheckCircle2,
} from "lucide-react";

type DriverCapability = {
  hasAccess: boolean;
  destination: string;
  label: string;
  status: "approved" | "pending" | "rejected" | "none";
};

function getDriverCapability(app: { status: string } | null): DriverCapability {
  if (!app) {
    return {
      hasAccess: true,
      destination: "/driver/onboarding",
      label: "Driver application",
      status: "none",
    };
  }
  if (app.status === "approved") {
    return {
      hasAccess: true,
      destination: "/driver/dashboard",
      label: "Driver",
      status: "approved",
    };
  }
  if (app.status === "pending") {
    return {
      hasAccess: true,
      destination: "/driver/status",
      label: "Driver application · Pending",
      status: "pending",
    };
  }
  if (app.status === "rejected") {
    return {
      hasAccess: true,
      destination: "/driver/status",
      label: "Driver application · Rejected",
      status: "rejected",
    };
  }
  return {
    hasAccess: true,
    destination: "/driver/onboarding",
    label: "Driver application",
    status: "none",
  };
}

export function AccountSwitcher({
  children,
  placement = "top",
  compact = false,
  live = false,
}: {
  children?: ReactNode;
  placement?: "top" | "bottom";
  compact?: boolean;
  /**
   * Marks the current context as live (driver online / socket connected).
   * Callers pass this because they already own the authoritative value; this
   * component deliberately starts no socket or availability subscription.
   */
  live?: boolean;
}) {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const queryClient = useQueryClient();
  const [driverCapability, setDriverCapability] = useState<
    { hasAccess: boolean; destination: string; label: string; status: "approved" | "pending" | "rejected" | "none" } | null
  >(null);
  const [checking, setChecking] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { popover, reduced } = useMotionSystem();

  useEffect(() => {
    let cancelled = false;

    const checkCapabilities = async () => {
      if (isPending) return;

      const user = (session as unknown as {
        user?: { role?: string; name?: string; email?: string };
      } | null)?.user;

      if (!user) {
        setChecking(false);
        return;
      }

      // Check driver capability. One-shot read through the shared cache, not a
      // subscription: the menu only needs the value to label and route.
      try {
        const app = await ensureMyDriverApplication(queryClient);
        if (!cancelled) {
          setDriverCapability(getDriverCapability(app));
        }
      } catch {
        if (!cancelled) {
          setDriverCapability({
            hasAccess: true,
            destination: "/driver/onboarding",
            label: "Driver application",
            status: "none",
          });
        }
      }

      if (!cancelled) {
        setChecking(false);
      }
    };

    checkCapabilities();

    return () => {
      cancelled = true;
    };
  }, [session, isPending, queryClient]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const sessionUser = (session as unknown as {
    user?: { role?: string; name?: string; email?: string; image?: string | null };
  } | null)?.user;
  const isAdmin = sessionUser?.role === "admin";

  // Real session data only: no placeholder identity is ever rendered.
  const displayName = sessionUser?.name?.trim() || sessionUser?.email || "Account";
  const contextLabel = isAdmin
    ? "Admin"
    : driverCapability?.status === "approved"
      ? "Driver"
      : driverCapability?.status === "pending"
        ? "Driver · Pending"
        : driverCapability?.status === "rejected"
          ? "Driver · Rejected"
          : "Passenger";
  const initials = (
    sessionUser?.name?.trim() ||
    sessionUser?.email ||
    "?"
  )
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (isPending || checking) {
    return compact ? (
      <div
        className="h-11 w-11 animate-pulse rounded-full bg-muted"
        aria-label="Loading account"
        aria-busy="true"
      />
    ) : (
      <>{children}</>
    );
  }

  // Build available contexts
  const contexts = [
    {
      id: "passenger",
      label: "Passenger",
      icon: UserIcon,
      destination: "/dashboard",
      available: true,
    },
    {
      id: "driver",
      label: driverCapability?.label ?? "Driver",
      icon: Car,
      destination: driverCapability?.destination ?? "/driver/onboarding",
      available: driverCapability?.hasAccess ?? false,
      status: driverCapability?.status,
    },
    {
      id: "admin",
      label: "Admin",
      icon: Shield,
      destination: "/admin",
      available: isAdmin, // The /admin route is still guarded server-side by requireRole("admin")
    },
  ];

  // Only show contexts the user has access to
  const availableContexts = contexts.filter((ctx) => ctx.available);

  // If only passenger is available, don't show switcher
  if (availableContexts.length <= 1) {
    return <>{children}</>;
  }

  return (
    <div className="relative w-fit" ref={dropdownRef}>
      <button
        type="button"
        aria-label={`Switch context. Signed in as ${displayName}, ${contextLabel}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen(!isOpen)}
        className={
          compact
            ? "flex h-11 items-center gap-2 rounded-full border border-border/70 bg-card/70 py-1 pl-1 pr-2.5 text-left transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-safe:active:scale-[0.98]"
            : "flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        }
      >
        <span className="relative shrink-0">
          {sessionUser?.image ? (
            <img
              src={sessionUser.image}
              alt=""
              className={compact ? "h-9 w-9 rounded-full object-cover" : "h-6 w-6 rounded-full object-cover"}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span
              aria-hidden="true"
              className={`flex items-center justify-center rounded-full bg-primary/20 font-bold text-primary ${
                compact ? "h-9 w-9 text-[12px]" : "h-6 w-6 text-[10px]"
              }`}
            >
              {initials}
            </span>
          )}
          {/* Subtle live marker, anchored to the avatar corner. */}
          {live && (
            <span
              className="absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full border-2 border-card bg-drio-success"
              title="Live"
            />
          )}
        </span>

        {compact ? (
          <span className="flex min-w-0 flex-col leading-none">
            <span className="max-w-[5.5rem] truncate text-[12px] font-semibold text-foreground">
              {displayName}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              {live && <span className="h-1.5 w-1.5 rounded-full bg-drio-success" aria-hidden="true" />}
              <span className="truncate">{contextLabel}</span>
            </span>
          </span>
        ) : (
          <>
            <span className="text-[13px] font-medium">{displayName}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={reduced ? false : "hidden"}
            animate={reduced ? undefined : "visible"}
            exit={reduced ? undefined : "exit"}
            variants={popover}
            role="menu"
            className={`absolute z-50 min-w-[14rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md ${placement === "bottom" ? "right-0 top-full mt-1 max-w-[calc(100vw-2rem)]" : "left-0 bottom-full mb-1"}`}
          >
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Switch context
          </div>
          <hr className="my-1 border-border" />
          {availableContexts.map((ctx) => (
            <Button
              key={ctx.id}
              variant="ghost"
              className="w-full justify-start gap-2 rounded-sm px-2 py-1.5 text-sm"
              onClick={() => {
                navigate(ctx.destination);
                setIsOpen(false);
              }}
            >
              <ctx.icon className="h-4 w-4" />
              <span className="flex-1 text-left">
                {ctx.label}
                {ctx.id === "driver" && (
                  <>
                    {driverCapability?.status === "pending" && (
                      <Badge variant="secondary" className="ml-2 text-[9px]">
                        Pending
                      </Badge>
                    )}
                    {driverCapability?.status === "rejected" && (
                      <Badge variant="destructive" className="ml-2 text-[9px]">
                        Rejected
                      </Badge>
                    )}
                    {driverCapability?.status === "approved" && (
                      <CheckCircle2 className="ml-2 h-3.5 w-3.5 text-drio-success" />
                    )}
                  </>
                )}
              </span>
            </Button>
          ))}
          <hr className="my-1 border-border" />
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive"
            onClick={async () => {
              setIsOpen(false);
              await authClient.signOut({
                disableRedirect: false,
                callbackURL: "/login",
              });
            }}
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}