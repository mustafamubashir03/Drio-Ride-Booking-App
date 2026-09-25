import { cn } from "@/lib/utils";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block bg-gradient-to-r from-drio-accent-light to-drio-accent bg-clip-text font-serif text-[1.6rem] font-extrabold leading-none tracking-tight text-transparent",
        className,
      )}
    >
      Drio
    </span>
  );
}
