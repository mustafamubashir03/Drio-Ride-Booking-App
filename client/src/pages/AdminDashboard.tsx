import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { MotionPage } from "@/motion/MotionPage";
import { AnimatePresence, motion } from "motion/react";
import { motionStateProps, useMotionSystem } from "@/motion/use-motion";
import {
  DRIVER_DOCUMENT_LABELS,
  getDriverApplicationAdminApi,
  getDriverApplicationsOverview,
  listDriverApplicationsAdminApi,
  reviewDriverApplicationAdminApi,
  type AdminDriverApplication,
  type DriverApplicationStatus,
  type DriverApplicationsOverview,
} from "@/lib/driver-api";
import {
  Car,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  Files,
  Inbox,
  LayoutDashboard,
  Loader2,
  LogOut,
  RefreshCw,
  Shield,
  User as UserIcon,
  XCircle,
} from "lucide-react";

type Filter = "all" | DriverApplicationStatus;

const navItems: Array<{
  icon: typeof LayoutDashboard;
  label: string;
  active?: boolean;
  soon?: boolean;
}> = [
  { icon: LayoutDashboard, label: "Applications", active: true },
  { icon: Car, label: "Drivers", soon: true },
  { icon: Shield, label: "Settings", soon: true },
];

const filterTabs: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const statusMeta: Record<
  DriverApplicationStatus,
  { label: string; badge: string }
> = {
  pending: {
    label: "Pending",
    badge: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  },
  approved: {
    label: "Approved",
    badge: "bg-drio-success/15 text-drio-success border-drio-success/25",
  },
  rejected: {
    label: "Rejected",
    badge: "bg-destructive/10 text-destructive border-destructive/25",
  },
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isPdfDocument(doc: {
  secureUrl: string;
  originalFilename?: string | null;
}): boolean {
  if (doc.secureUrl.toLowerCase().endsWith(".pdf")) return true;
  if (doc.originalFilename?.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

function Initials({ name, email }: { name?: string; email?: string }) {
  const source = name ?? email ?? "U";
  return source.charAt(0).toUpperCase();
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | undefined;
  icon: typeof Files;
  tone: "default" | "pending" | "approved" | "rejected";
}) {
  const toneStyles = {
    default: { icon: "text-primary", bg: "bg-primary/12" },
    pending: { icon: "text-amber-500", bg: "bg-amber-500/15" },
    approved: { icon: "text-drio-success", bg: "bg-drio-success/15" },
    rejected: { icon: "text-destructive", bg: "bg-destructive/10" },
  } as const;
  const current = toneStyles[tone];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${current.bg}`}
          >
            <Icon className={`h-4 w-4 ${current.icon}`} />
          </span>
        </div>
        <p className="mt-3 font-serif text-[2rem] font-bold leading-none text-foreground">
          {value === undefined ? "—" : value}
        </p>
      </CardContent>
    </Card>
  );
}

function ReviewDecisionCard({
  application,
  onReviewed,
}: {
  application: AdminDriverApplication;
  onReviewed: (updated: AdminDriverApplication) => void;
}) {
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [adminNote, setAdminNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (decision === "rejected" && !rejectionReason.trim()) {
      setError("Add a reason for the rejection.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const updated = await reviewDriverApplicationAdminApi({
        applicationId: application._id,
        decision,
        adminNote: adminNote.trim() || null,
        rejectionReason:
          decision === "rejected" ? rejectionReason.trim() || null : null,
      });
      onReviewed(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not submit your decision."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/8">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h3 className="text-[15px] font-semibold text-foreground">
            Review decision
          </h3>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Approving unlocks the driver portal for this account. Rejecting
          requires a reason, which is shown to the applicant.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted/30 p-1">
          <Button
            type="button"
            variant={decision === "approved" ? "default" : "ghost"}
            className="gap-1.5 py-2 text-[13px] font-semibold"
            onClick={() => setDecision("approved")}
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve
          </Button>
          <Button
            type="button"
            variant={decision === "rejected" ? "destructive" : "ghost"}
            className="gap-1.5 py-2 text-[13px] font-semibold"
            onClick={() => setDecision("rejected")}
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          {decision === "approved" ? (
            <div>
              <label
                htmlFor="review-admin-note"
                className="mb-1.5 block text-sm leading-none font-medium text-muted-foreground select-none"
              >
                Admin note{" "}
                <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <Textarea
                id="review-admin-note"
                rows={2}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Visible to the applicant on their status page."
              />
            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="review-rejection-reason"
                  className="mb-1.5 block text-sm leading-none font-medium text-muted-foreground select-none"
                >
                  Rejection reason <span className="text-destructive">*</span>
                </label>
                <Textarea
                  id="review-rejection-reason"
                  rows={2}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Why wasn't this application approved?"
                />
              </div>
              <div>
                <label
                  htmlFor="review-reject-note"
                  className="mb-1.5 block text-sm leading-none font-medium text-muted-foreground select-none"
                >
                  Admin note{" "}
                  <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <Textarea
                  id="review-reject-note"
                  rows={2}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Private note for the review record."
                />
              </div>
            </>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="mt-3 text-[12px] font-medium text-destructive"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant={decision === "approved" ? "default" : "destructive"}
            className="flex-1 font-semibold hover:scale-[1.01]"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {decision === "approved"
              ? "Approve application"
              : "Reject application"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data: session } = authClient.useSession();
  const { page, stagger, reduced } = useMotionSystem();
  const admin = (session as unknown as {
    user?: { name?: string; email?: string };
  })?.user;

  const [overview, setOverview] = useState<DriverApplicationsOverview | null>(
    null
  );
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>("all");
  const [applications, setApplications] = useState<AdminDriverApplication[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminDriverApplication | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);

  const loadOverview = async () => {
    try {
      const data = await getDriverApplicationsOverview();
      setOverview(data);
      setOverviewError(null);
    } catch (err) {
      setOverviewError(
        err instanceof Error ? err.message : "Could not load overview statistics."
      );
    }
  };

  const loadList = async () => {
    setListLoading(true);
    setListError(null);
    try {
      const result = await listDriverApplicationsAdminApi({
        page: 1,
        limit: 50,
        status: filter === "all" ? undefined : filter,
      });
      setApplications(result.applications);
      setTotalCount(result.pagination.total);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : "Could not load driver applications."
      );
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    void loadList();
  }, [filter]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    getDriverApplicationAdminApi(selectedId)
      .then((application) => {
        if (!cancelled) setSelected(application);
      })
      .catch((err) => {
        if (!cancelled) {
          setSelected(null);
          setDetailError(
            err instanceof Error ? err.message : "Could not load this application."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, detailAttempt]);

  const handleFilterChange = (next: Filter) => {
    if (next === filter) return;
    setFilter(next);
    setSelectedId(null);
    setSelected(null);
  };

  const handleReviewed = (updated: AdminDriverApplication) => {
    setSelected(updated);
    void loadList();
    void loadOverview();
  };

  const handleSignOut = async () => {
    await authClient.signOut({ disableRedirect: false, callbackURL: "/login" });
  };

  const filterCount = (id: Filter) => {
    if (!overview) return undefined;
    if (id === "all") return overview.total;
    return overview[id];
  };

  const selectedMeta = selected ? statusMeta[selected.status] : null;

  return (
    <MotionPage className="flex min-h-dvh bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[220px] flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-[64px] shrink-0 items-center px-5">
          <Logo />
        </div>

        <div className="mb-1 px-3">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Admin
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                disabled={!item.active}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150 ${
                  item.active
                    ? "bg-primary/12 text-primary"
                    : "cursor-default text-muted-foreground/60"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    item.active ? "bg-primary/15 text-primary" : "bg-white/5"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {item.label}
                {item.soon && (
                  <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mx-3 my-4 rounded-2xl bg-primary/8 border border-primary/15 p-4">
          <p className="text-xs font-semibold text-primary mb-1">
            Review queue
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Pending applications show up here for review.
          </p>
        </div>

        <div className="border-t border-border px-3 py-3 shrink-0">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
              {(admin?.name ?? "A").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground leading-tight">
                {admin?.name ?? "Admin"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">Admin</p>
            </div>
          </div>
          <AccountSwitcher>
            <Link to="/dashboard" className="mt-1 block">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
              >
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
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col lg:min-h-dvh lg:ml-[220px]">
        <header className="hidden h-[64px] shrink-0 items-center justify-between border-b border-border px-8 lg:flex">
          <div>
            <h1 className="font-serif text-[20px] font-bold tracking-tight text-foreground leading-tight">
              Admin Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-500/25 bg-amber-500/15 text-amber-500"
            >
              {overview ? `${overview.pending} pending` : "Pending…"}
            </Badge>
          </div>
        </header>

        {/* Mobile header */}
        <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <h1 className="truncate text-[14px] font-semibold text-foreground">
            Admin Dashboard
          </h1>
          <div className="flex items-center gap-2">
            <AccountSwitcher compact placement="bottom">
              <span />
            </AccountSwitcher>
            <Badge
              variant="outline"
              className="border-amber-500/25 bg-amber-500/15 text-amber-500"
            >
              {overview ? `${overview.pending} pending` : "Pending…"}
            </Badge>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Overview */}
          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">
                  Overview
                </h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Live counts from the driver applications database.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadOverview()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
            <motion.div
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              variants={stagger.container}
              initial={reduced ? false : "hidden"}
              animate={reduced ? undefined : "visible"}
            >
              <motion.div key="total" variants={stagger.item}>
                <MetricCard
                  label="Total applications"
                  value={overview?.total}
                  icon={Files}
                  tone="default"
                />
              </motion.div>
              <motion.div key="pending" variants={stagger.item}>
                <MetricCard
                  label="Pending review"
                  value={overview?.pending}
                  icon={Clock3}
                  tone="pending"
                />
              </motion.div>
              <motion.div key="approved" variants={stagger.item}>
                <MetricCard
                  label="Approved"
                  value={overview?.approved}
                  icon={CheckCircle2}
                  tone="approved"
                />
              </motion.div>
              <motion.div key="rejected" variants={stagger.item}>
                <MetricCard
                  label="Rejected"
                  value={overview?.rejected}
                  icon={XCircle}
                  tone="rejected"
                />
              </motion.div>
            </motion.div>
            {overviewError && (
              <p className="mt-3 text-[12px] font-medium text-destructive">
                {overviewError}
              </p>
            )}
          </section>

          {/* Applications */}
          <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
            {/* List */}
            <Card className="xl:sticky xl:top-0">
              <div className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold text-foreground">
                    Applications
                  </h2>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {totalCount} total
                    {filter !== "all"
                      ? ` · ${statusMeta[filter].label.toLowerCase()}`
                      : ""}
                  </p>
                </div>
                <div className="flex w-full min-w-0 flex-wrap gap-1.5 sm:w-auto sm:shrink-0">
                  {filterTabs.map((tab) => {
                    const isActive = filter === tab.id;
                    const count = filterCount(tab.id);
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => handleFilterChange(tab.id)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                          isActive
                            ? "border-primary/25 bg-primary/12 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                        {count !== undefined && (
                          <span
                            className={`rounded-full px-1 text-[10px] font-semibold ${
                              isActive
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 px-3 pb-3">
                <AnimatePresence mode="wait">
                  {listLoading && applications.length === 0 ? (
                    <motion.div
                      {...motionStateProps({ variants: page, reduced })}
                      key="loading"
                      className="flex h-40 items-center justify-center"
                    >
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </motion.div>
                  ) : listError ? (
                    <motion.div
                      {...motionStateProps({ variants: page, reduced })}
                      key="error"
                      className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/30 px-4 text-center"
                    >
                      <p className="text-[13px] font-medium text-destructive">
                        Could not load applications
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void loadList()}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Try again
                      </Button>
                    </motion.div>
                  ) : applications.length === 0 ? (
                    <motion.div
                      {...motionStateProps({ variants: page, reduced })}
                      key="empty"
                      className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 text-center"
                    >
                      <Inbox className="h-6 w-6 text-muted-foreground/60" />
                      <p className="text-[13px] font-medium text-foreground">
                        No{" "}
                        {filter === "all" ? "" : statusMeta[filter].label.toLowerCase()}{" "}
                        applications
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      {...motionStateProps({ variants: page, reduced })}
                      key="list"
                      className="divide-y divide-border overflow-hidden rounded-xl border border-border"
                    >
                      {applications.map((application) => {
                        const isSelected = selectedId === application._id;
                        return (
                          <button
                            key={application._id}
                            type="button"
                            onClick={() => setSelectedId(application._id)}
                            className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                              isSelected ? "bg-primary/8" : "hover:bg-secondary/50"
                            }`}
                          >
                            <Avatar size="sm" className="shrink-0">
                              <AvatarFallback className="bg-primary/20 text-[10px] font-bold text-primary">
                                <Initials
                                  name={application.user?.name ?? undefined}
                                  email={application.user?.email ?? undefined}
                                />
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-foreground">
                                {application.user?.name ??
                                  application.user?.email ??
                                  "Applicant"}
                              </p>
                              <p className="truncate text-[12px] text-muted-foreground">
                                {application.user?.email ?? "—"}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <Badge
                                variant="outline"
                                className={statusMeta[application.status].badge}
                              >
                                {statusMeta[application.status].label}
                              </Badge>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {formatDate(application.submittedAt)}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Card>

            {/* Detail */}
            <div className="min-w-0">
              <AnimatePresence mode="wait">
                {!selectedId ? (
                  <motion.div
                    {...motionStateProps({ variants: page, reduced })}
                    key="empty"
                  >
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
                        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                          <UserIcon className="h-7 w-7 text-primary" />
                        </span>
                        <p className="text-[15px] font-semibold text-foreground">
                          Select an application
                        </p>
                        <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                          Choose an application from the list to review the
                          applicant, view their documents and approve or reject.
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ) : detailLoading ? (
                  <motion.div
                    {...motionStateProps({ variants: page, reduced })}
                    key="loading"
                  >
                    <Card>
                      <CardContent className="flex h-64 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </motion.div>
                ) : detailError ? (
                  <motion.div
                    {...motionStateProps({ variants: page, reduced })}
                    key="error"
                  >
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                        <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                          <FileText className="h-6 w-6 text-destructive" />
                    </span>
                    <p className="text-[14px] font-semibold text-destructive">
                      Could not load this application
                    </p>
                    <p className="max-w-xs text-[12px] leading-relaxed text-muted-foreground">
                      {detailError}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetailAttempt((n) => n + 1)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Try again
                    </Button>
                  </CardContent>
                    </Card>
                  </motion.div>
                ) : selected ? (
                <motion.div
                  {...motionStateProps({ variants: page, reduced })}
                  key="detail"
                  className="space-y-4"
                >
                  {/* Applicant */}
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <Avatar size="lg" className="shrink-0">
                          <AvatarFallback className="bg-primary/20 text-sm font-bold text-primary">
                            <Initials
                              name={selected.user?.name ?? undefined}
                              email={selected.user?.email ?? undefined}
                            />
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-foreground">
                            {selected.user?.name ?? "Applicant"}
                          </p>
                          <p className="truncate text-[13px] text-muted-foreground">
                            {selected.user?.email ?? "—"}
                          </p>
                        </div>
                        {selectedMeta && (
                          <Badge
                            variant="outline"
                            className={selectedMeta.badge}
                          >
                            {selectedMeta.label}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Submitted
                          </p>
                          <p className="mt-1 text-[13px] font-semibold text-foreground">
                            {formatDate(selected.submittedAt)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Reviewed
                          </p>
                          <p className="mt-1 text-[13px] font-semibold text-foreground">
                            {formatDate(selected.reviewedAt)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Documents
                          </p>
                          <p className="mt-1 text-[13px] font-semibold text-foreground">
                            {selected.documents.length} / 3
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Documents */}
                  <Card>
                    <CardContent className="pt-6">
                      <div className="mb-4 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <h3 className="text-[15px] font-semibold text-foreground">
                          Uploaded documents
                        </h3>
                      </div>

                      {selected.documents.length === 0 ? (
                        <p className="text-[13px] text-muted-foreground">
                          No documents uploaded yet.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {selected.documents.map((doc) => {
                            const isPdf = isPdfDocument(doc);
                            const label =
                              DRIVER_DOCUMENT_LABELS[doc.documentType] ??
                              doc.documentType;
                            return (
                              <div
                                key={doc.publicId}
                                className="overflow-hidden rounded-xl border border-border bg-muted/20"
                              >
                                {!isPdf && (
                                  <a
                                    href={doc.secureUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                  >
                                    <img
                                      src={doc.secureUrl}
                                      alt={doc.originalFilename ?? label}
                                      className="h-44 w-full bg-drio-deep object-contain"
                                    />
                                  </a>
                                )}
                                <div className="flex items-center justify-between gap-3 px-4 py-3">
                                  <div className="flex min-w-0 items-center gap-2.5">
                                    {isPdf ? (
                                      <FileText className="h-4 w-4 shrink-0 text-destructive" />
                                    ) : (
                                      <CheckCircle2 className="h-4 w-4 shrink-0 text-drio-success" />
                                    )}
                                    <div className="min-w-0">
                                      <p className="truncate text-[13px] font-semibold text-foreground">
                                        {label}
                                      </p>
                                      <p className="truncate text-[12px] text-muted-foreground">
                                        {doc.originalFilename ?? "Document"}
                                        {doc.uploadedAt
                                          ? ` · ${formatDate(doc.uploadedAt)}`
                                          : ""}
                                      </p>
                                    </div>
                                  </div>
                                  <a
                                    href={doc.secureUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-[12px] font-semibold text-primary transition-colors hover:text-drio-accent-hover"
                                  >
                                    {isPdf ? "Open PDF ↗" : "Open ↗"}
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Review notes */}
                  {(selected.adminNote || selected.rejectionReason) && (
                    <Card>
                      <CardContent className="pt-6">
                        <h3 className="text-[15px] font-semibold text-foreground">
                          Review notes
                        </h3>
                        <div className="mt-3 space-y-3">
                          {selected.rejectionReason && (
                            <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3">
                              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                Rejection reason
                              </p>
                              <p className="mt-1 text-[13px] font-medium text-foreground">
                                {selected.rejectionReason}
                              </p>
                            </div>
                          )}
                          {selected.adminNote && (
                            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                Admin note
                              </p>
                              <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                                {selected.adminNote}
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Decision */}
                  {selected.status === "pending" ? (
                    <ReviewDecisionCard
                      application={selected}
                      onReviewed={handleReviewed}
                    />
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                      <p className="text-[12px] text-muted-foreground">
                        This application is already{" "}
                        {statusMeta[selected.status].label.toLowerCase()}.
                      </p>
                    </div>
                  )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </section>
        </main>
      </div>
    </MotionPage>
  );
}