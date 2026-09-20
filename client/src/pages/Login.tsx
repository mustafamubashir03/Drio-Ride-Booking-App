import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import AuthLayout from "@/components/AuthLayout";
import Logo from "@/components/Logo";
import GoogleIcon from "@/components/GoogleIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function Login() {
  const rawNext = useSearchParams()[0].get("next");
  const redirectTo =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}${redirectTo}`,
      });
    } catch {
      setError("Google sign-in failed. Make sure the API server is running.");
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Your premium ride, every time."
      subtitle="Fast, dependable rides with a calm, refined experience from pickup to drop-off."
    >
      <div className="mb-8 lg:hidden">
        <Logo />
        <p className="mt-2 text-[13px] text-muted-foreground">
          Your premium ride, every time.
        </p>
      </div>

      <div className="mb-7">
        <h2 className="font-serif text-[1.75rem] font-bold tracking-tight text-foreground leading-tight">
          Welcome back
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Sign in to continue your journey.
        </p>
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
        {googleLoading ? "Redirecting..." : "Log in with Google"}
      </Button>

      <div className="my-5 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-[11px] font-medium text-muted-foreground">or continue with email</span>
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
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="password" className="mb-0">
              Password
            </Label>
            <a
              href="#"
              className="text-xs font-medium text-primary hover:text-drio-accent-hover"
            >
              Forgot password?
            </a>
          </div>
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

        <Button
          type="submit"
          size="lg"
          className="w-full font-semibold"
          disabled={submitting}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          to="/register"
          className="font-semibold text-primary hover:text-drio-accent-hover transition-colors"
        >
          Create one
        </Link>
      </p>

      <div className="mt-6 rounded-xl border border-border bg-muted/40 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[14px] font-semibold text-foreground">
              Want to join as a driver?
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Apply to drive with Drio using your existing account.
            </p>
          </div>
          <Link
            to="/driver/login"
            className="shrink-0 whitespace-nowrap font-semibold text-primary hover:text-drio-accent-hover transition-colors"
          >
            Driver Login
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}