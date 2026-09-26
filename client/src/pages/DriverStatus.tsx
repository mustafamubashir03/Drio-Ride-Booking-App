import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMyDriverApplicationQuery } from "@/hooks/queries/use-driver";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MotionPage } from "@/motion/MotionPage";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import {
  type DriverApplication,
} from "@/lib/driver-api";
import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ClipboardX,
  Clock3,
  FileImage,
  FileText,
  ShieldCheck,
  XCircle,
} from "lucide-react";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isPdfDocument(doc: { secureUrl: string; originalFilename?: string | null }): boolean {
  if (doc.secureUrl.toLowerCase().endsWith(".pdf")) return true;
  if (doc.originalFilename?.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

function documentFormatMeta(doc: { secureUrl: string; originalFilename?: string | null }) {
  return isPdfDocument(doc)
    ? { icon: FileText, chip: "bg-drio-violet/12 text-drio-violet" }
    : { icon: FileImage, chip: "bg-drio-blue/12 text-drio-blue" };
}

const statusMeta: Record<
  DriverApplication["status"],
  { label: string; icon: typeof Clock3; badge: string; soft: string }
> = {
  pending: {
    label: "Pending review",
    icon: Clock3,
    badge: "bg-amber-500/15 text-amber-500 border-amber-500/25",
    soft: "bg-amber-500/15 text-amber-500",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    badge: "bg-drio-success/15 text-drio-success border-drio-success/25",
    soft: "bg-drio-success/15 text-drio-success",
  },
  rejected: {
    label: "Not approved",
    icon: XCircle,
    badge: "bg-destructive/10 text-destructive border-destructive/25",
    soft: "bg-destructive/12 text-destructive",
  },
};

export default function DriverStatus() {
  const navigate = useNavigate();
  // Shared with onboarding, profile, the role gate and the account switcher:
  // one query, one request.
  const { data: app, isPending: loading, error } = useMyDriverApplicationQuery();
  const loadError = error instanceof Error ? error.message : error;

  // No application at all means the driver never started one.
  if (!loading && app === null && !error) {
    return <Navigate to="/driver/onboarding" replace />;
  }

  if (loading) {
    return (
      <MotionPage className="flex min-h-dvh items-center justify-center bg-background">
        <div
          role="status"
          aria-label="Loading your application"
          className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary motion-reduce:animate-none"
        />
      </MotionPage>
    );
  }

  if (!app) {
    return (
      <MotionPage className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-destructive/20 bg-destructive/8 p-6 text-center">
          <span
            aria-hidden
            className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/12"
          >
            <CircleAlert className="h-5 w-5 text-destructive" />
          </span>
          <p className="text-[14px] font-semibold text-destructive">Could not load your application</p>
          <p className="mt-1.5 text-[12px] leading-relaxed break-words text-muted-foreground [overflow-wrap:anywhere]">{loadError ?? "Try again in a moment."}</p>
          <Button className="mt-5" variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </MotionPage>
    );
  }

  const meta = statusMeta[app.status];
  const Icon = meta.icon;
  const heading =
    app.status === "approved"
      ? "Application approved"
      : app.status === "rejected"
        ? "Application not approved"
        : "Application submitted";
  const uploaded = app.documents ?? [];

  return (
    <MotionPage className="flex min-h-dvh flex-col bg-background">
      <header className="flex min-h-[64px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:h-[64px] sm:flex-nowrap sm:px-6 sm:py-0 sm:pt-0 md:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <Separator className="h-5 data-horizontal:h-5 data-horizontal:w-px" />
          <span className="text-[13px] font-medium text-muted-foreground">
            Driver application
          </span>
        </div>
        <div className="ml-auto flex w-full items-center justify-end gap-2 sm:w-auto">
          <AccountSwitcher compact placement="bottom">
            <span />
          </AccountSwitcher>
          <Link to="/dashboard" className="w-auto">
            <Button variant="ghost" size="sm" className="w-auto px-2 text-[11px] text-muted-foreground sm:px-3 sm:text-[12px]">
              Back to passenger app
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-2xl flex-1 px-6 py-8">
        <div className="mb-6 text-center">
          <div
            className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full ${meta.soft}`}
          >
            <Icon className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="font-serif text-[1.75rem] font-bold tracking-tight text-foreground">
            {heading}
          </h1>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Badge variant="outline" className={meta.badge}>
              <Icon aria-hidden />
              {meta.label}
            </Badge>
            <span className="flex items-center gap-1 text-[12px] text-muted-foreground tabular-nums">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {formatDate(app.submittedAt)}
            </span>
          </div>
        </div>

        {loadError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-[13px] font-medium break-words text-destructive [overflow-wrap:anywhere]"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {loadError}
          </div>
        )}

        {app.status === "pending" && (
          <Card className="mb-5">
            <CardContent>
              <h2 className="text-[15px] font-semibold text-foreground">
                What happens next
              </h2>
              <ul className="mt-3 space-y-2">
                {[
                  "Our review team checks your documents and details.",
                  "We update your status here — no need to contact us.",
                  "Once approved, the driver portal unlocks for your account.",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground"
                  >
                    <span
                      aria-hidden
                      className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/12"
                    >
                      <ShieldCheck className="h-2.5 w-2.5 text-primary" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate("/driver/onboarding")}
                >
                  Add or replace documents
                </Button>
                <Link to="/dashboard" className="flex-1">
                  <Button variant="ghost" className="w-full">
                    Back to dashboard
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {app.status === "approved" && (
          <Card className="mb-5 border-drio-success/25 bg-drio-success/5">
            <CardContent>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-drio-success/12"
                >
                  <CheckCircle2 className="h-4 w-4 text-drio-success" />
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold text-foreground">
                    You&apos;re approved!
                  </h2>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    Your driver application was approved
                    {app.reviewedAt ? ` on ${formatDate(app.reviewedAt)}` : ""}.
                    Your account is now a driver account — open the driver portal
                    to get started.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link to="/driver/dashboard" className="flex-1">
                  <Button className="w-full">Open driver portal</Button>
                </Link>
                <Link to="/dashboard" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Back to passenger app
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {app.status === "rejected" && (
          <Card className="mb-5">
            <CardContent>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/12"
                >
                  <ClipboardX className="h-4 w-4 text-destructive" />
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold text-foreground">
                    Application not approved
                  </h2>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    Your application was reviewed
                    {app.reviewedAt ? ` on ${formatDate(app.reviewedAt)}` : ""}{" "}
                    but wasn&apos;t approved.
                  </p>
                </div>
              </div>
              {app.rejectionReason && (
                <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-destructive/80">
                    <XCircle className="h-3 w-3 shrink-0" aria-hidden />
                    Reason
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] font-medium text-foreground [overflow-wrap:anywhere]">
                    {app.rejectionReason}
                  </p>
                </div>
              )}
              {app.adminNote && (
                <div
                  className={`rounded-xl border border-border bg-muted/30 px-4 py-3 ${
                    app.rejectionReason ? "mt-2.5" : "mt-4"
                  }`}
                >
                  <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                    Review note
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
                    {app.adminNote}
                  </p>
                </div>
              )}
              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                Re-applying and updating your documents isn&apos;t enabled yet.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Documents */}
        <Card>
          <CardContent>
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-[15px] font-semibold text-foreground">
                Uploaded documents
              </h2>
              {uploaded.length > 0 && (
                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                  {uploaded.length} / 3
                </span>
              )}
            </div>
            {uploaded.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No documents uploaded yet.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {uploaded.map((doc) => {
                  const format = documentFormatMeta(doc);
                  const FormatIcon = format.icon;
                  return (
                    <li
                      key={doc.publicId}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-secondary/40 motion-reduce:transition-none"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${format.chip}`}
                        >
                          <FormatIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-foreground">
                            {doc.originalFilename ?? doc.publicId}
                          </p>
                          <p className="text-[12px] text-muted-foreground tabular-nums">
                            Uploaded {formatDate(doc.uploadedAt)}
                          </p>
                        </div>
                      </div>
                      <a
                        href={doc.secureUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-md text-[13px] font-medium text-primary transition-colors duration-150 hover:text-drio-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none"
                      >
                        {isPdfDocument(doc) ? "View PDF ↗" : "View ↗"}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            {app.status === "pending" && uploaded.length > 0 && (
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => navigate("/driver/onboarding")}
              >
                Add or replace documents
              </Button>
            )}
          </CardContent>
        </Card>
      </main>
    </MotionPage>
  );
}
