export default function SiteName({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-bold underline text-stone-900">un</span>
      <span className="font-medium">arXiv</span>
    </span>
  );
}
