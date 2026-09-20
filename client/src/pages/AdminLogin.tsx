import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import AuthLayout from "@/components/AuthLayout";
import Logo from "@/components/Logo";
import GoogleIcon from "@/components/GoogleIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const routeToAdmin = async () => {
    if (rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")) {
      navigate(rawNext, { replace: true });
      return;
    }
    navigate("/admin", { replace: true });
  };

  useEffect(() => {
    if (!isPending && session) {
      setRedirecting(true);
      void routeToAdmin();
    }
  }, [isPending, session]);

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

    await routeToAdmin();
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/admin/login`,
      });
    } catch {
      setError("Google sign-in failed. Make sure the API server is running.");
      setGoogleLoading(false);
    }
  };

  if (isPending || redirecting) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
      </div>
    );
  }

  if (session) {
    return <Navigate to={"/admin"} replace />;
  }

  return (
    <AuthLayout
      title="Admin Portal"
      subtitle="Secure administrative access for Drio operations."
      badge="ADMIN PORTAL"
    >
      <div className="mb-8 lg:hidden">
        <Logo />
      </div>

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
          <div
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {error}
          </div>
        )}
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@drio.com"
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
        </div>
        <Button type="submit" size="lg" className="w-full font-semibold" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in to admin portal"}
        </Button>
      </form>

      <div className="mt-6 rounded-xl border border-border bg-muted/40 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[14px] font-semibold text-foreground">Looking to ride or drive?</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Go to the passenger or driver portal instead.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to="/login"
              className="shrink-0 whitespace-nowrap font-semibold text-primary hover:text-drio-accent-hover transition-colors"
            >
              Passenger login
            </Link>
            <Link
              to="/driver/login"
              className="shrink-0 whitespace-nowrap font-semibold text-primary hover:text-drio-accent-hover transition-colors"
            >
              Driver login
            </Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}