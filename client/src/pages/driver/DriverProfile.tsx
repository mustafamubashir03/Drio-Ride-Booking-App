import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  useDriverRatingQuery,
  useMyDriverApplicationQuery,
} from "@/hooks/queries/use-driver";
import {
  type DriverApplication,
} from "@/lib/driver-api";
import { formatDate } from "@/lib/format";
import { Car, CheckCircle2, CircleAlert, Clock3, FileImage, FileText, Info, Star, User as UserIcon, XCircle } from "lucide-react";
import { MotionPage } from "@/motion/MotionPage";

function Initials(name?: string, email?: string) {
  const source = name ?? email ?? "D";
  return source.charAt(0).toUpperCase();
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
  { label: string; badge: string; icon: typeof Clock3 }
> = {
  pending: {
    label: "Pending review",
    badge: "bg-amber-500/15 text-amber-500 border-amber-500/25",
    icon: Clock3,
  },
  approved: {
    label: "Approved",
    badge: "bg-drio-success/15 text-drio-success border-drio-success/25",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Not approved",
    badge: "bg-destructive/10 text-destructive border-destructive/25",
    icon: XCircle,
  },
};

export default function DriverProfile() {
  const { data: session } = authClient.useSession();
  const user = (session as unknown as {
    user?: { name?: string; email?: string; image?: string | null; role?: string };
  })?.user;

  // Both are stable server data: the application is shared with onboarding,
  // status, the role gate and the account switcher, and the rating aggregate
  // only changes when a review is submitted.
  const { data: app, isPending: loading, error } = useMyDriverApplicationQuery();
  const {
    data: rating,
    isPending: ratingPending,
    isError: ratingFailed,
  } = useDriverRatingQuery();
  const loadError = error instanceof Error ? error.message : error;

  const meta = app ? statusMeta[app.status] : null;
  const StatusIcon = meta?.icon;
  const documents = app?.documents ?? [];
  const hasRegistration = documents.some(
    (document) => document.documentType === "vehicle-registration",
  );

  return (
    <MotionPage className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto p-4 lg:p-8">
      <div className="mx-auto w-full min-w-0 max-w-2xl space-y-5">
        {loadError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-[13px] font-medium break-words text-destructive [overflow-wrap:anywhere]"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {loadError}
          </div>
        )}

        {/* Profile card.

            Laid out as a centred column rather than a decorative band with the
            avatar pulled up over it by a negative margin. That version had three
            coupled problems: -mb-6 (-24px) against pb-7 (28px) left only 4px of
            space under the row, so the content sat on the card's bottom edge; the
            -mt-8 (-32px) overlap only lined up because the 96px band and the 64px
            avatar happened to match it, so any change to either broke it; and
            px-7 was a fixed 28px at every width while the page gutter is p-4.

            Now the avatar, name, email, rating and role badge are one centred
            stack with an even responsive rhythm, so the content is genuinely
            centred on the Y axis at any width and nothing depends on a magic
            number staying in sync. */}
        <div className="rounded-3xl border border-border bg-card px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-col items-center gap-4 text-center">
            <Avatar className="h-16 w-16 shrink-0 ring-4 ring-card sm:h-20 sm:w-20">
              {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
              <AvatarFallback className="bg-primary/20 text-2xl font-bold text-primary">
                {Initials(user?.name, user?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex w-full min-w-0 flex-col items-center gap-1">
              <p className="max-w-full truncate text-[17px] font-semibold text-foreground sm:text-[19px]">
                {user?.name ?? "Drio Driver"}
              </p>
              <p className="max-w-full truncate text-[12.5px] text-muted-foreground sm:text-[13px]">{user?.email}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted-foreground">
                {!ratingPending && !ratingFailed && rating?.average != null && rating.count > 0 ? (
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden />
                ) : (
                  <Star className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />
                )}
                {ratingPending ? (
                  "Loading rating…"
                ) : ratingFailed ? (
                  "Rating unavailable"
                ) : rating?.average != null && rating.count > 0 ? (
                  <>
                    <span className="font-semibold text-foreground tabular-nums">
                      {rating.average.toFixed(1)}
                    </span>
                    <span className="tabular-nums">
                      · {rating.count} {rating.count === 1 ? "rating" : "ratings"}
                    </span>
                  </>
                ) : (
                  "No ratings yet"
                )}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-primary/20 bg-primary/12 px-3 py-1.5 text-[10px] font-semibold text-primary sm:px-3.5 sm:text-[11px]">
              Driver
            </span>
          </div>
        </div>

        {/* Driver application */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
              <UserIcon className="h-4 w-4 text-primary" aria-hidden />
              Driver application
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div
                role="status"
                aria-label="Loading driver application"
                className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-4 py-3"
              >
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" aria-hidden />
                <p className="text-[12px] text-muted-foreground">Loading…</p>
              </div>
            ) : loadError ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3">
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  We couldn&apos;t load your driver application.
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
            ) : app && meta && StatusIcon ? (
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] text-muted-foreground">Status</p>
                  <Badge variant="outline" className={meta.badge}>
                    <StatusIcon aria-hidden />
                    {meta.label}
                  </Badge>
                </div>
                <Separator className="my-2.5" />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] text-muted-foreground">Submitted</p>
                  <p className="text-[13px] font-semibold text-foreground tabular-nums">
                    {formatDate(app.submittedAt)}
                  </p>
                </div>
                <Separator className="my-2.5" />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] text-muted-foreground">Reviewed</p>
                  <p
                    className={`text-[13px] font-semibold tabular-nums ${
                      app.reviewedAt ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {formatDate(app.reviewedAt)}
                  </p>
                </div>
                {app.rejectionReason && (
                  <>
                    <Separator className="my-2.5" />
                    <div className="space-y-1.5 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5">
                      <p className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-destructive/80">
                        <XCircle className="h-3 w-3 shrink-0" aria-hidden />
                        Reason
                      </p>
                      <p className="whitespace-pre-wrap text-[13px] font-medium text-foreground [overflow-wrap:anywhere]">
                        {app.rejectionReason}
                      </p>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No driver application found for this account.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
              <FileText className="h-4 w-4 text-drio-blue" aria-hidden />
              Documents
              {documents.length > 0 && (
                <span className="ml-auto text-[11px] font-normal text-muted-foreground tabular-nums">
                  {documents.length} / 3
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No documents uploaded yet.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {documents.map((doc) => {
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
          </CardContent>
        </Card>

        {/* Vehicle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
              <Car className="h-4 w-4 text-drio-violet" aria-hidden />
              Vehicle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] text-muted-foreground">Vehicle details</p>
                <p
                  className={`flex items-center gap-1.5 text-[13px] font-semibold ${
                    hasRegistration ? "text-drio-success" : "text-muted-foreground"
                  }`}
                >
                  {hasRegistration ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  {hasRegistration ? "Registration uploaded" : "Registration not uploaded"}
                </p>
              </div>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Vehicle make, model, colour and plate aren&apos;t stored yet.
              They&apos;ll appear here once driver vehicle management ships.
            </p>
          </CardContent>
        </Card>
      </div>
    </MotionPage>
  );
}
