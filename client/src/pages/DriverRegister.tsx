import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { fetchMyDriverApplication } from "@/lib/driver-api";
import AuthLayout from "@/components/AuthLayout";
import Logo from "@/components/Logo";
import GoogleIcon from "@/components/GoogleIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MailCheck } from "lucide-react";

export default function DriverRegister() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [registered, setRegistered] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const routeByApplicationState = async () => {
    if (rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")) {
      navigate(rawNext, { replace: true });
      return;
    }
    try {
      const app = await fetchMyDriverApplication();
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
      setRedirecting(true);
      void routeByApplicationState();
    }
  }, [isPending, session]);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);

    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: `${window.location.origin}/driver/onboarding`,
    });

    if (error) {
      setError(error.message ?? "Unable to create your account.");
      setSubmitting(false);
      return;
    }

    // Check if session was established (e.g. if email verification is disabled in dev)
    const currentSession = await authClient.getSession({ query: {} });
    if (currentSession.data?.session) {
      await routeByApplicationState();
    } else {
      setRegistered(email);
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!registered) return;
    setResending(true);
    setError(null);
    const { error } = await authClient.sendVerificationEmail({
      email: registered,
      callbackURL: `${window.location.origin}/driver/onboarding`,
    });
    if (error) {
      setError(error.message ?? "Unable to resend the verification email.");
    }
    setResending(false);
  };

  const handleGoogleSignUp = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/driver/register`,
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

  if (registered) {
    return (
      <AuthLayout
        title="Drive with Drio"
        subtitle="Verification link sent. Confirm your email to start your driver application."
        badge="DRIVER PORTAL"
      >
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
            <MailCheck className="h-7 w-7 text-primary" />
          </div>
          <h2 className="font-serif text-[1.75rem] font-bold tracking-tight text-foreground leading-tight">
            Check your inbox
          </h2>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">{registered}</span>.
            <br />
            Click it to confirm your email and proceed to your driver application.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 w-full rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            >
              {error}
            </div>
          )}

          <Button
            variant="outline"
            className="mt-6 w-full font-medium"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? "Sending..." : "Resend verification email"}
          </Button>

          <p className="mt-6 text-[13px] text-muted-foreground">
            Already verified?{" "}
            <Link
              to="/driver/login"
              className="font-semibold text-primary hover:text-drio-accent-hover transition-colors"
            >
              Sign in to driver portal
            </Link>
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Join Drio as a driver"
      subtitle="Create your account to start your driver onboarding. One Drio account works for both riding and driving."
      badge="DRIVER PORTAL"
    >
      <div className="mb-8 lg:hidden">
        <Logo />
      </div>

      <div className="mb-7">
        <h2 className="font-serif text-[1.75rem] font-bold tracking-tight text-foreground leading-tight">
          Create your driver account
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Fill in your details below to get started.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={handleGoogleSignUp}
        disabled={googleLoading}
      >
        <GoogleIcon />
        {googleLoading ? "Redirecting..." : "Sign up with Google"}
      </Button>

      <div className="my-5 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-[11px] font-medium text-muted-foreground">or continue with email</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={handleRegister} className="space-y-5" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {error}
          </div>
        )}

        <div>
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>

        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full font-semibold"
          disabled={submitting}
        >
          {submitting ? "Creating account..." : "Create driver account"}
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link
          to="/driver/login"
          className="font-semibold text-primary hover:text-drio-accent-hover transition-colors"
        >
          Sign in to driver portal
        </Link>
      </p>

      <div className="mt-6 rounded-xl border border-border bg-muted/40 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[14px] font-semibold text-foreground">Looking to ride?</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Go to passenger account registration.</p>
          </div>
          <Link
            to="/register"
            className="shrink-0 whitespace-nowrap font-semibold text-primary hover:text-drio-accent-hover transition-colors"
          >
            Passenger registration
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
