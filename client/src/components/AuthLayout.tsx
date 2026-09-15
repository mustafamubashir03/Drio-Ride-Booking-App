import type { ReactNode } from "react";
import Logo from "./Logo";

type AuthLayoutProps = {
  children: ReactNode;
  title: string;
  subtitle: string;
};

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh bg-background">
      <div className="relative hidden w-[46%] overflow-hidden bg-card lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-24 -top-24 h-[22rem] w-[22rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute left-[18%] top-[12%] h-44 w-44 rounded-full border border-primary/15" />
        <div className="pointer-events-none absolute right-[12%] top-[38%] h-64 w-64 rounded-full border border-primary/10" />
        <div className="pointer-events-none absolute bottom-[18%] left-[28%] h-28 w-28 rounded-full bg-primary/8 blur-2xl" />

        <div className="relative p-10">
          <Logo className="text-[2rem]" />
        </div>

        <div className="relative px-10 pb-16">
          <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="relative flex w-full items-center justify-center px-6 py-12 lg:w-[54%]">
        <div className="pointer-events-none absolute inset-0 lg:hidden">
          <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-primary/12 blur-3xl" />
          <div className="absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-primary/8 blur-3xl" />
        </div>
        <div className="relative w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
