import { ACTIVE_THEME } from "@/lib/theme-config";

/**
 * Theme-aware logo icon.
 *
 * Each theme can define its own icon variant. The default theme uses the
 * original smooth unarchive arrow; retro-terminal uses a pixelated bracket
 * icon [↑].  Add new cases here when new themes need custom icons.
 */

function DefaultIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="self-center">
      <path fillRule="evenodd" clipRule="evenodd" d="M 11 5.414 L 11 15 C 11 15.552 11.448 16 12 16 C 12.552 16 13 15.552 13 15 L 13 5.414 L 15.293 7.707 C 15.683 8.098 16.317 8.098 16.707 7.707 C 17.098 7.317 17.098 6.683 16.707 6.293 L 12.707 2.293 C 12.317 1.902 11.683 1.902 11.293 2.293 L 7.293 6.293 C 6.902 6.683 6.902 7.317 7.293 7.707 C 7.683 8.098 8.317 8.098 8.707 7.707 L 11 5.414 Z M 4 4 C 4 4 3.447 4.077 3.253 4.398 C 2.998 4.819 3 6 3 6 L 3 17 C 3 18.657 4.343 20 6 20 L 18 20 C 19.657 20 21 18.657 21 17 L 21 6 C 21 6 21.08 4.713 20.704 4.26 C 20.544 4.068 20 4 20 4 C 19.448 4 19 4.448 19 5 L 19 17 C 19 17.552 18.552 18 18 18 L 6 18 C 5.448 18 5 17.552 5 17 L 5 5 C 5 4.448 4.552 4 4 4 Z" fill="currentColor"/>
    </svg>
  );
}

function RetroTerminalIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="self-center">
      {/* Left bracket */}
      <rect x="2" y="4" width="2" height="16" />
      <rect x="2" y="4" width="5" height="2" />
      <rect x="2" y="18" width="5" height="2" />
      {/* Right bracket */}
      <rect x="20" y="4" width="2" height="16" />
      <rect x="17" y="4" width="5" height="2" />
      <rect x="17" y="18" width="5" height="2" />
      {/* Up arrow — vertically centered in brackets */}
      <rect x="11" y="5" width="2" height="12" />
      <rect x="9" y="7" width="2" height="2" />
      <rect x="7" y="9" width="2" height="2" />
      <rect x="13" y="7" width="2" height="2" />
      <rect x="15" y="9" width="2" height="2" />
    </svg>
  );
}

const THEME_ICONS: Record<string, React.ComponentType<{ size: number }>> = {
  "retro-terminal": RetroTerminalIcon,
};

export default function LogoIcon({ size = 34 }: { size?: number }) {
  const Icon = THEME_ICONS[ACTIVE_THEME] || DefaultIcon;
  return <Icon size={size} />;
}
