/**
 * Quality plus icons — serif-flared crosses.
 * Used to indicate narration upgrade level across the app.
 *
 * 0 pluses = base narration (renders nothing)
 * 1 plus   = improved script (free upgrade)
 * 2 pluses = polished voice (OpenAI)
 * 3 pluses = most lifelike voice (ElevenLabs)
 */

/**
 * A single serif plus — a cross where each arm ends with a small
 * perpendicular cap, giving it a typographic feel.
 */
export function SerifPlus({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className} fill="currentColor">
      <rect x="8.5" y="2.5" width="3" height="15" rx="0.4" />
      <rect x="2.5" y="8.5" width="15" height="3" rx="0.4" />
      <rect x="7.5" y="1.8" width="5" height="1.2" rx="0.3" />
      <rect x="7.5" y="17" width="5" height="1.2" rx="0.3" />
      <rect x="1.8" y="7.5" width="1.2" height="5" rx="0.3" />
      <rect x="17" y="7.5" width="1.2" height="5" rx="0.3" />
    </svg>
  );
}

/** Render 1–3 serif plus icons in a horizontal row. Returns null for count=0. */
export default function PlusIcons({
  count,
  size = 14,
  className = "text-stone-600",
  gap = "gap-0.5",
}: {
  count: number;
  size?: number;
  className?: string;
  /** Tailwind gap class between icons */
  gap?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex items-center ${gap} ${className}`}
      aria-label={`${count} plus${count > 1 ? "es" : ""}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <SerifPlus key={i} size={size} className={className} />
      ))}
    </span>
  );
}
