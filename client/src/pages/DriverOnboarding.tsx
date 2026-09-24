import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import Logo from "@/components/Logo";
import DocumentUploadSection from "@/components/DocumentUpload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MotionPage } from "@/motion/MotionPage";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import {
  createDriverApplication,
  fetchMyDriverApplication,
  type DriverApplication,
  type DriverApplicationDocument,
} from "@/lib/driver-api";
import {
  AtSign,
  Car,
  CircleCheck,
  FileUp,
  Loader2,
  User as UserIcon,
} from "lucide-react";

type SessionUser = { name?: string; email?: string };

function formatSubmittedAt(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function DriverOnboarding() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const user = (session as unknown as { user?: SessionUser } | null)?.user;

  const [app, setApp] = useState<DriverApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyDriverApplication()
      .then((application) => {
        if (cancelled) return;
        setApp(application);
        if (application?.status === "approved") {
          navigate("/driver/dashboard", { replace: true });
          return;
        }
        if (application?.status === "rejected") {
          navigate("/driver/status", { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) setCreateError("Could not load your driver application.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleStart = async () => {
    setCreateError(null);
    setCreating(true);
    try {
      const application = await createDriverApplication();
      setApp(application);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Could not start your application."
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDocumentsUpdated = (documents: DriverApplicationDocument[]) => {
    setApp((current) => (current ? { ...current, documents } : current));
  };

  if (sessionPending || loading) {
    return (
      <MotionPage className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
      </MotionPage>
    );
  }

  const hasApplication = Boolean(app);

  return (
    <MotionPage className="flex min-h-dvh flex-col bg-background">
      <header className="flex min-h-[64px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:h-[64px] sm:flex-nowrap sm:px-6 sm:py-0 sm:pt-0 md:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <Separator className="h-5 data-horizontal:h-5 data-horizontal:w-px" />
          <span className="text-[13px] font-medium text-muted-foreground">
            Driver onboarding
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
        <div className="mb-7">
          <h1 className="font-serif text-[1.75rem] font-bold tracking-tight text-foreground">
            Ready to drive with Drio?
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Complete your details and add your documents below. This uses the same
            Drio account you&apos;re signed into.
          </p>
        </div>

        {createError && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {createError}
          </div>
        )}

        {hasApplication && app && app.status === "pending" && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/8 px-4 py-3">
            <CircleCheck className="mt-0.5 h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-foreground">
                Application submitted
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Status: Pending review · submitted{" "}
                {formatSubmittedAt(app.submittedAt) || "recently"}. You can still
                add or replace documents.
              </p>
            </div>
          </div>
        )}

        {/* Step 1 — Personal information */}
        <Card className="mb-4">
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-primary" />
              <h2 className="text-[15px] font-semibold text-foreground">
                Personal information
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Full name
                </p>
                <p className="mt-1 truncate text-[14px] font-semibold text-foreground">
                  {user?.name ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Email
                </p>
                <p className="mt-1 flex items-center gap-1 truncate text-[14px] font-semibold text-foreground">
                  <AtSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {user?.email ?? "—"}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              Your identity comes from your Drio account. We&apos;ll confirm it
              during the review.
            </p>
          </CardContent>
        </Card>

        {/* Step 2 — Vehicle information */}
        <Card className="mb-4">
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" />
              <h2 className="text-[15px] font-semibold text-foreground">
                Vehicle information
              </h2>
              <Badge variant="secondary" className="ml-auto">
                Coming soon
              </Badge>
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Vehicle type, plate number and other details will be collected here
              in an upcoming milestone. You won&apos;t need to repeat this when it
              launches.
            </p>
          </CardContent>
        </Card>

        {/* Step 3 — Documents */}
        <Card className="mb-4">
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <FileUp className="h-4 w-4 text-primary" />
              <h2 className="text-[15px] font-semibold text-foreground">
                Required documents
              </h2>
            </div>

            {!hasApplication ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                <p className="text-[13px] text-muted-foreground">
                  Start your application first to unlock document uploads.
                </p>
              </div>
            ) : (
              <DocumentUploadSection
                documents={app?.documents ?? []}
                disabled={false}
                onUploaded={handleDocumentsUpdated}
              />
            )}
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              Documents are uploaded securely to Drio&apos;s review system and are
              only visible to review staff.
            </p>
          </CardContent>
        </Card>

        {/* Step 4 — Review & submit */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <CircleCheck className="h-4 w-4 text-primary" />
              <h2 className="text-[15px] font-semibold text-foreground">
                Review &amp; submit
              </h2>
            </div>

            {!hasApplication ? (
              <>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Review your details above, then start your application. It will
                  immediately enter &quot;Pending review&quot; and you can add or
                  replace documents until the review is complete.
                </p>
                <Button
                  id="start-driver-application"
                  size="lg"
                  className="mt-5 w-full font-semibold hover:scale-[1.01]"
                  onClick={handleStart}
                  disabled={creating}
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creating ? "Starting…" : "Start my application"}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] text-muted-foreground">
                      Documents uploaded
                    </p>
                    <p className="text-[14px] font-semibold text-foreground">
                      {app?.documents.length ?? 0} / 3
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  <Button
                    size="lg"
                    className="flex-1 font-semibold"
                    onClick={() => navigate("/driver/status")}
                  >
                    View application status
                  </Button>
                  <Link to="/dashboard" className="w-full sm:w-auto">
                    <Button size="lg" variant="outline" className="w-full sm:w-auto">
                      Back to dashboard
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </MotionPage>
  );
}