export default function SiteName({ className }: { className?: string }) {
  return (
    <span className={`font-[family-name:var(--font-mono-brand)] font-normal relative -top-[3px] ${className}`}>
      <span className="underline text-slate-100 font-bold">un</span>
      <span>ar</span><span className="relative top-[0.12em] text-[1.35em]">X</span><span>iv</span>
    </span>
  );
}
