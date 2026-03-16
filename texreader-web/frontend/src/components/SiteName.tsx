export default function SiteName({ className }: { className?: string }) {
  return (
    <span className={`font-[family-name:var(--font-brand)] font-bold ${className}`}>
      <span className="underline text-stone-900">un</span>
      <span>arXiv</span>
    </span>
  );
}
