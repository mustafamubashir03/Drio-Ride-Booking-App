export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-serif text-2xl font-semibold tracking-wide text-drio-accent ${className}`}
    >
      Drio
    </span>
  );
}
