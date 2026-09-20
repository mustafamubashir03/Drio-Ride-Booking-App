import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  fetchMyDriverApplication,
  type DriverApplication,
} from "@/lib/driver-api";
import { formatDate } from "@/lib/format";
import { Car, FileText, User as UserIcon } from "lucide-react";

function Initials(name?: string, email?: string) {
  const source = name ?? email ?? "D";
  return source.charAt(0).toUpperCase();
}

function isPdfDocument(doc: { secureUrl: string; originalFilename?: string | null }): boolean {
  if (doc.secureUrl.toLowerCase().endsWith(".pdf")) return true;
  if (doc.originalFilename?.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

const statusMeta: Record<
  DriverApplication["status"],
  { label: string; badge: string }
> = {
  pending: {
    label: "Pending review",
    badge: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  },
  approved: {
    label: "Approved",
    badge: "bg-drio-success/15 text-drio-success border-drio-success/25",
  },
  rejected: {
    label: "Not approved",
    badge: "bg-destructive/10 text-destructive border-destructive/25",
  },
};

export default function DriverProfile() {
  const { data: session } = authClient.useSession();
  const user = (session as unknown as {
    user?: { name?: string; email?: string; image?: string; role?: string };
  })?.user;

  const [app, setApp] = useState<DriverApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyDriverApplication()
      .then((application) => {
        if (cancelled) return;
        setApp(application);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your driver application.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const meta = app ? statusMeta[app.status] : null;
  const documents = app?.documents ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {error}
          </div>
        )}

        {/* Profile card */}
        <div className="rounded-3xl border border-border bg-card overflow-hidden">
          <div className="h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent relative">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card/60 to-transparent" />
          </div>
          <div className="px-7 pb-7">
            <div className="flex items-end gap-5 -mt-8 mb-6">
              <Avatar size="lg" className="ring-4 ring-card h-16 w-16">
                {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
                <AvatarFallback className="bg-primary/20 text-2xl font-bold text-primary">
                  {Initials(user?.name, user?.email)}
                </AvatarFallback>
              </Avatar>
              <div className="pb-1">
                <p className="text-[18px] font-semibold text-foreground">
                  {user?.name ?? "Drio Driver"}
                </p>
                <p className="text-[13px] text-muted-foreground">{user?.email}</p>
              </div>
              <div className="ml-auto pb-1">
                <span className="rounded-full bg-primary/12 border border-primary/20 px-3.5 py-1.5 text-[11px] font-semibold text-primary">
                  Driver
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Driver application */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-primary" />
              Driver application
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
                <p className="text-[12px] text-muted-foreground">Loading…</p>
              </div>
            ) : app && meta ? (
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-muted-foreground">Status</p>
                  <Badge variant="outline" className={meta.badge}>
                    {meta.label}
                  </Badge>
                </div>
                <Separator className="my-2.5" />
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-muted-foreground">Submitted</p>
                  <p className="text-[13px] font-semibold text-foreground">
                    {formatDate(app.submittedAt)}
                  </p>
                </div>
                <Separator className="my-2.5" />
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-muted-foreground">Reviewed</p>
                  <p className="text-[13px] font-semibold text-foreground">
                    {formatDate(app.reviewedAt)}
                  </p>
                </div>
                {app.rejectionReason && (
                  <>
                    <Separator className="my-2.5" />
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-[12px] text-muted-foreground shrink-0">Reason</p>
                      <p className="text-[13px] font-medium text-foreground text-right">
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
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-drio-blue" />
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No documents uploaded yet.
              </p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-xl">
                {documents.map((doc) => (
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
          </CardContent>
        </Card>

        {/* Vehicle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-4 w-4 text-drio-violet" />
              Vehicle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-muted-foreground">Vehicle details</p>
                <p className="text-[13px] font-semibold text-foreground">
                  Registration uploaded
                </p>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              Vehicle make, model, colour and plate aren&apos;t stored yet.
              They&apos;ll appear here once driver vehicle management ships.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}