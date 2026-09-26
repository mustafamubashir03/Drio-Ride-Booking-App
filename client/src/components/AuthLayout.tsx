import type { ReactNode } from "react";
import heroImage from "@/assets/Hero-Image.png";
import Logo from "@/components/Logo";

type AuthLayoutProps = {
  children: ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
};

export default function AuthLayout({ children, title, subtitle, badge }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background pt-[env(safe-area-inset-top)] lg:flex-row lg:pt-0">
      {/* ── Left branding panel ─────────────────────────────────── */}
      <div
        className="relative h-[clamp(13rem,30svh,18rem)] w-full shrink-0 overflow-hidden rounded-t-[1.75rem] bg-drio-deep lg:flex lg:h-auto lg:w-[44%] lg:flex-col lg:rounded-none"
      >
        {/* Hero image — fills the whole panel */}
        <img
          src={heroImage}
          alt="Drio premium ride experience"
          className="absolute inset-0 h-full w-full object-cover object-[center_35%] lg:object-center"
        />

        {/* Legibility scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-drio-overlay via-drio-overlay/55 to-drio-overlay/10" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-drio-overlay/60 to-transparent" />

        {/* Ambient glow */}
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-[360px] w-[360px] rounded-full bg-primary/12 blur-[100px]" />

        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-5 pt-20 text-center lg:hidden">
          <Logo className="mx-auto !text-[2.25rem]" />
          {badge && (
            <span className="mt-2 inline-block rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
              {badge}
            </span>
          )}
          <h1 className="mt-1.5 font-serif text-[1.35rem] font-bold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        </div>

        {/* Bottom copy */}
        <div className="relative mt-auto hidden px-10 pb-12 lg:block">
          {badge && (
            <span className="inline-block rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary mb-3">
              {badge}
            </span>
          )}
          <Logo className="!text-[4rem]" />
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
      <div className="relative flex w-full grow items-start justify-center px-6 py-8 sm:items-center sm:px-8 sm:py-12 lg:w-[56%] lg:grow-0">
        {/* Mobile glows */}
        <div className="pointer-events-none absolute inset-0 lg:hidden">
          <div className="absolute left-4 top-4 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-4 right-4 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />
        </div>

        <div className="relative -mt-8 w-full max-w-[420px] rounded-t-[1.75rem] border-x border-t border-border bg-background/95 px-5 pb-8 pt-7 text-center shadow-2xl backdrop-blur-md [&_label]:text-left sm:mx-4 sm:max-w-[440px] sm:rounded-[1.75rem] sm:border lg:mx-0 lg:mt-0 lg:max-w-[420px] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:text-left lg:shadow-none lg:backdrop-blur-none">{children}</div>
      </div>
    </div>
  );
}