import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { ensureMyDriverApplication } from "@/hooks/queries/use-driver";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CircleAlert } from "lucide-react";

export default function DriverLogin() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const routeByApplicationState = async () => {
    if (rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")) {
      navigate(rawNext, { replace: true });
      return;
    }
    try {
      const app = await ensureMyDriverApplication(queryClient);
      if (!app) {
        navigate("/driver/onboarding", { replace: true });
      } else if (app.status === "approved") {
        navigate("/driver/dashboard", { replace: true });
      } else {
        navigate("/driver/status", { replace: true });
      }
    } catch {
      navigate("/driver/onboarding", { replace: true });
    }
  };

  useEffect(() => {
    if (!isPending && session) {
      queueMicrotask(() => setRedirecting(true));
      void routeByApplicationState();
    }
  }, [isPending, session, queryClient]);

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error } = await authClient.signIn.email({
      email,
      password,
    });

    if (error) {
      setError(error.message ?? "Unable to sign in. Please try again.");
      setSubmitting(false);
      return;
    }

    await routeByApplicationState();
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/driver/login`,
      });
    } catch {
      setError("Google sign-in failed. Make sure the API server is running.");
      setGoogleLoading(false);
    }
  };

  if (isPending || redirecting) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary motion-reduce:animate-none" />
      </div>
    );
  }

  return (
    <AuthLayout
      title="Drive with Drio"
      subtitle="One account. Same credentials you already use - this is the driver sign-in for the Drio driver portal."
      badge="DRIVER PORTAL"
    >

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
      >
        <GoogleIcon />
        {googleLoading ? "Redirecting..." : "Continue with Google"}
      </Button>

      <div className="my-5 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-[11px] font-medium text-muted-foreground">or sign in with email</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-5" noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-[13px] font-medium text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
        </div>
        <Button type="submit" size="lg" className="w-full font-semibold" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in to the driver portal"}
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-muted-foreground">
        New to Drio driving?{" "}
        <Link to="/driver/register" className="font-semibold text-primary hover:text-drio-accent-hover transition-colors">
          Create a driver account
        </Link>
      </p>

      <div className="mt-6 rounded-xl border border-border bg-muted/40 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[14px] font-semibold text-foreground">Looking to ride?</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Sign in to your passenger account instead.</p>
          </div>
          <Link to="/login" className="shrink-0 whitespace-nowrap rounded-md font-semibold text-primary transition-colors duration-150 hover:text-drio-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none">
            Passenger login
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}