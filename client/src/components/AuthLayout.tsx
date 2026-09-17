import type { ReactNode } from "react";
import heroImage from "@/assets/Hero-Image.png";

type AuthLayoutProps = {
  children: ReactNode;
  title: string;
  subtitle: string;
};

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh bg-background">
      {/* ── Left branding panel ─────────────────────────────────── */}
      <div
        className="relative hidden w-[44%] overflow-hidden lg:flex lg:flex-col bg-drio-deep"
      >
        {/* Hero image — fills the whole panel */}
        <img
          src={heroImage}
          alt="Drio premium ride experience"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />

        {/* Legibility scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-drio-overlay via-drio-overlay/55 to-drio-overlay/10" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-drio-overlay/60 to-transparent" />

        {/* Ambient glow */}
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-[360px] w-[360px] rounded-full bg-primary/12 blur-[100px]" />

        {/* Bottom copy */}
        <div className="relative mt-auto px-10 pb-12">
          <p className="bg-gradient-to-r from-drio-accent-light to-drio-accent bg-clip-text font-serif text-[4rem] leading-none font-extrabold tracking-tight text-transparent">
            Drio
          </p>
          <h1 className="mt-4 max-w-sm font-serif text-[1.75rem] font-bold leading-[1.25] tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>

          {/* Trust badges */}
          <div className="mt-9 flex items-center gap-6">
            {[
              { value: "4.9★", label: "Rating" },
              { value: "50K+", label: "Rides" },
              { value: "99%", label: "On-time" },
            ].map((badge) => (
              <div key={badge.label} className="text-center">
                <p className="text-[17px] font-semibold text-primary">
                  {badge.value}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {badge.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right form panel ───────────────────────────────────── */}
      <div className="relative flex w-full items-center justify-center px-8 py-12 lg:w-[56%]">
        {/* Mobile glows */}
        <div className="pointer-events-none absolute inset-0 lg:hidden">
          <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-primary/8 blur-3xl" />
        </div>

        <div className="relative w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  );
}