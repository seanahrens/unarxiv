export default function SiteName({ className }: { className?: string }) {
  return (
    <span className={`font-[family-name:var(--font-brand)] font-normal ${className}`}>
      <span className="underline text-stone-900 font-bold">un</span>
      <span>arXiv</span>
    </span>
  );
}
