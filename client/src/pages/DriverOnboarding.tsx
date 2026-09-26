import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
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
  useCreateDriverApplicationMutation,
  useMyDriverApplicationQuery,
} from "@/hooks/queries/use-driver";
import {
  AtSign,
  Car,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileUp,
  Inbox,
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

  // The driver application is stable server state shared with the status page,
  // the profile page, the role gate and the account switcher, so it is read
  // from the shared query rather than fetched per screen.
  const {
    data: app,
    isPending: loading,
    error: loadError,
  } = useMyDriverApplicationQuery();
  const createMutation = useCreateDriverApplicationMutation();
  const [createError, setCreateError] = useState<string | null>(null);

  const handleStart = async () => {
    setCreateError(null);
    try {
      // The mutation writes the new application into the shared cache, so this
      // screen and every other consumer see it without another request.
      await createMutation.mutateAsync();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Could not start your application."
      );
    }
  };

  if (sessionPending || loading) {
    return (
      <MotionPage className="flex min-h-dvh items-center justify-center bg-background">
        <div
          role="status"
          aria-label="Loading driver onboarding"
          className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary motion-reduce:animate-none"
        />
      </MotionPage>
    );
  }

  // An approved driver belongs in the portal and a rejected one on the status
  // page, so this screen is not theirs to render.
  if (app?.status === "approved") {
    return <Navigate to="/driver/dashboard" replace />;
  }
  if (app?.status === "rejected") {
    return <Navigate to="/driver/status" replace />;
  }

  const hasApplication = Boolean(app);
  const visibleError =
    (loadError instanceof Error ? loadError.message : loadError) ?? createError;

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

        {visibleError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-[13px] font-medium break-words text-destructive [overflow-wrap:anywhere]"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {visibleError}
          </div>
        )}

        {hasApplication && app && app.status === "pending" && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15"
            >
              <Clock3 className="h-3.5 w-3.5 text-amber-500" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-foreground">
                Application submitted
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted-foreground">
                <Badge
                  variant="outline"
                  className="h-4 border-amber-500/25 bg-amber-500/15 text-[10px] text-amber-500"
                >
                  Pending review
                </Badge>
                submitted {formatSubmittedAt(app.submittedAt) || "recently"}. You
                can still add or replace documents.
              </p>
            </div>
          </div>
        )}

        {/* Step 1 — Personal information */}
        <Card className="mb-4">
          <CardContent>
            <div className="mb-4 flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-[15px] font-semibold text-foreground">
                Personal information
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                  Full name
                </p>
                <p className="mt-1 flex items-center gap-1.5 truncate text-[14px] font-semibold text-foreground">
                  <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {user?.name ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                  Email
                </p>
                <p className="mt-1 flex items-center gap-1.5 truncate text-[14px] font-semibold text-foreground">
                  <AtSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
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
          <CardContent>
            <div className="mb-4 flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-[15px] font-semibold text-foreground">
                Vehicle information
              </h2>
              <Badge variant="outline" className="ml-auto text-muted-foreground">
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
          <CardContent>
            <div className="mb-4 flex items-center gap-2">
              <FileUp className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-[15px] font-semibold text-foreground">
                Required documents
              </h2>
              {hasApplication && (
                <span
                  className={`ml-auto text-[11px] tabular-nums ${
                    (app?.documents.length ?? 0) >= 3
                      ? "font-semibold text-drio-success"
                      : "text-muted-foreground"
                  }`}
                >
                  {app?.documents.length ?? 0} / 3 uploaded
                </span>
              )}
            </div>

            {!hasApplication ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                <Inbox className="h-5 w-5 text-muted-foreground/60" aria-hidden />
                <p className="text-[13px] text-muted-foreground">
                  Start your application first to unlock document uploads.
                </p>
              </div>
            ) : (
              <DocumentUploadSection
                documents={app?.documents ?? []}
                disabled={false}
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
          <CardContent>
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-[15px] font-semibold text-foreground">
                Review &amp; submit
              </h2>
            </div>

            {!hasApplication ? (
              <>
                {loadError ? (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3">
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      We couldn&apos;t load your application. Try again before starting a new one.
                    </p>
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      onClick={() => window.location.reload()}
                    >
                      Try again
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      Review your details above, then start your application. It will
                      immediately enter &quot;Pending review&quot; and you can add or
                      replace documents until the review is complete.
                    </p>
                    <Button
                      id="start-driver-application"
                      size="lg"
                      className="mt-5 w-full font-semibold hover:scale-[1.01] motion-reduce:scale-100 motion-reduce:transition-none"
                      onClick={handleStart}
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
                      {createMutation.isPending ? "Starting…" : "Start my application"}
                    </Button>
                  </>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div
                  className={`rounded-xl border px-4 py-3 transition-colors duration-200 motion-reduce:transition-none ${
                    (app?.documents.length ?? 0) >= 3
                      ? "border-drio-success/25 bg-drio-success/8"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] text-muted-foreground">
                      Documents uploaded
                    </p>
                    <p
                      className={`text-[14px] font-semibold tabular-nums ${
                        (app?.documents.length ?? 0) >= 3
                          ? "text-drio-success"
                          : "text-foreground"
                      }`}
                    >
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
