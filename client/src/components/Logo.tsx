export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-serif font-bold tracking-tight text-foreground ${className}`}
      style={{ fontSize: "1.6rem", letterSpacing: "-0.03em" }}
    >
      Drio
    </span>
  );
}