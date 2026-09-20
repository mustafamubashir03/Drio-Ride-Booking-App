import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  fetchMyDriverApplication,
  type DriverApplication,
} from "@/lib/driver-api";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardX,
  Clock3,
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

const statusMeta: Record<
  DriverApplication["status"],
  { label: string; icon: typeof Clock3; badge: string }
> = {
  pending: {
    label: "Pending review",
    icon: Clock3,
    badge: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    badge: "bg-drio-success/15 text-drio-success border-drio-success/25",
  },
  rejected: {
    label: "Not approved",
    icon: XCircle,
    badge: "bg-destructive/10 text-destructive border-destructive/25",
  },
};

export default function DriverStatus() {
  const navigate = useNavigate();
  const [app, setApp] = useState<DriverApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyDriverApplication()
      .then((application) => {
        if (cancelled) return;
        if (!application) {
          navigate("/driver/onboarding", { replace: true });
          return;
        }
        setApp(application);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your application.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
      </div>
    );
  }

  if (!app) return null;

  const meta = statusMeta[app.status];
  const Icon = meta.icon;
  const uploaded = app.documents ?? [];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-border px-6 md:px-10">
        <div className="flex items-center gap-3">
          <Logo />
          <Separator className="h-5 data-horizontal:h-5 data-horizontal:w-px" />
          <span className="text-[13px] font-medium text-muted-foreground">
            Driver application
          </span>
        </div>
        <Link to="/dashboard">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Back to passenger app
          </Button>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-serif text-[1.75rem] font-bold tracking-tight text-foreground">
            Application submitted
          </h1>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Badge variant="outline" className={meta.badge}>
              {meta.label}
            </Badge>
            <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {formatDate(app.submittedAt)}
            </span>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {error}
          </div>
        )}

        {app.status === "pending" && (
          <Card className="mb-5">
            <CardContent className="pt-6">
              <h2 className="text-[15px] font-semibold text-foreground">
                What happens next
              </h2>
              <ul className="mt-3 space-y-2.5">
                {[
                  "Our review team checks your documents and details.",
                  "We update your status here — no need to contact us.",
                  "Once approved, the driver portal unlocks for your account.",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground"
                  >
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
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
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-drio-success" />
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
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <ClipboardX className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
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
              {(app.rejectionReason || app.adminNote) && (
                <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                  {app.rejectionReason && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Reason
                      </p>
                      <p className="mt-1 text-[13px] font-medium text-foreground">
                        {app.rejectionReason}
                      </p>
                    </div>
                  )}
                  {app.adminNote && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Review note
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                        {app.adminNote}
                      </p>
                    </div>
                  )}
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
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="text-[15px] font-semibold text-foreground">
                Uploaded documents
              </h2>
            </div>
            {uploaded.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No documents uploaded yet.
              </p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-xl">
                {uploaded.map((doc) => (
                  <li
                    key={doc.publicId}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-foreground">
                        {doc.originalFilename ?? doc.publicId}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        Uploaded {formatDate(doc.uploadedAt)}
                      </p>
                    </div>
                    <a
                      href={doc.secureUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-[13px] font-medium text-primary hover:text-drio-accent-hover transition-colors"
                    >
                      {isPdfDocument(doc) ? "View PDF" : "View"}
                    </a>
                  </li>
                ))}
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
    </div>
  );
}