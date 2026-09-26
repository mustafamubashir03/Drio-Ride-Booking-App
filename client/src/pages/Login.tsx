import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CircleAlert } from "lucide-react";

/**
 * Better Auth redirects authentication failures here with the reason in
 * `?error=` (see onAPIError.errorURL in server/src/lib/auth.ts). The codes are
 * mapped to plain language: the raw value is never shown, so nothing internal
 * leaks into the UI.
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // The single-use OAuth state cookie expired, or a second attempt consumed it.
  state_mismatch: "Google sign-in expired or was interrupted. Please try again.",
  state_not_found: "Google sign-in expired or was interrupted. Please try again.",
  // The user backed out of the consent screen.
  access_denied: "Google sign-in was cancelled.",
  // Other known provider-side failures.
  no_code: "Google sign-in did not complete. Please try again.",
  invalid_code: "Google sign-in could not be verified. Please try again.",
  unable_to_get_user_info: "Google sign-in could not be completed. Please try again.",
  unable_to_link_account: "That Google account is linked to a different Drio account.",
  account_already_linked_to_different_user:
    "That Google account is linked to a different Drio account.",
  email_does_not_match: "Google sign-in did not match your Drio account.",
  // Known non-OAuth auth failures.
  email_not_verified: "Please verify your email address before signing in.",
  invalid_email_or_password: "That email and password combination is not recognised.",
};

function messageForAuthError(code: string | null): string | null {
  if (!code) return null;
  return (
    AUTH_ERROR_MESSAGES[code] ?? "Something went wrong during sign-in. Please try again."
  );
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");
  const redirectTo =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";
  // Survives a failed Google round trip and explains itself on arrival. Seeded
  // into the same state the form uses so a later submit clears it.
  const [error, setError] = useState<string | null>(() =>
    messageForAuthError(searchParams.get("error")),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <div className="mb-4">
        <h2 className="font-serif text-[1.6rem] font-bold tracking-tight text-foreground leading-tight">
          Welcome back
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
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

      <div className="my-4 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-[11px] font-medium text-muted-foreground">or continue with email</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-[13px] font-medium text-destructive"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
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
              className="rounded-md text-xs font-medium text-primary transition-colors duration-150 hover:text-drio-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none"
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

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          to="/register"
          className="font-semibold text-primary hover:text-drio-accent-hover transition-colors"
        >
          Create one
        </Link>
      </p>

      {/* One line, no supporting paragraph: the driver's own portal is reachable
          from here, but the extra sentence was filler that cost vertical room. */}
      <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
        <p className="text-[13px] text-muted-foreground">Want to drive with Drio?</p>
        <Link
          to="/driver/login"
          className="shrink-0 whitespace-nowrap rounded-md text-[13px] font-semibold text-primary transition-colors duration-150 hover:text-drio-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none"
        >
          Driver Login
        </Link>
      </div>
    </AuthLayout>
  );
}