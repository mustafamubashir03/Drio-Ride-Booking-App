import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import AuthLayout from "@/components/AuthLayout";
import Logo from "@/components/Logo";
import GoogleIcon from "@/components/GoogleIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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
    });

    if (error) {
      setError(error.message ?? "Unable to create your account.");
      setSubmitting(false);
      return;
    }

    navigate("/dashboard");
  };

  const handleGoogleSignUp = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/dashboard`,
      });
    } catch {
      setError("Google sign-in failed. Make sure the API server is running.");
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Join Drio today."
      subtitle="Create your account and start riding in minutes. Your premium experience awaits."
    >
      <div className="mb-10 lg:hidden">
        <Logo className="text-[1.75rem]" />
        <p className="mt-2 text-sm text-muted-foreground">
          Your premium ride, every time.
        </p>
      </div>

      <div className="mb-8">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Create your account
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Join Drio and get moving in minutes.
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

      <div className="my-6 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs font-medium text-muted-foreground">or</span>
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

        <Button type="submit" size="lg" className="w-full font-semibold" disabled={submitting}>
          {submitting ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-primary hover:text-drio-accent-hover">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
