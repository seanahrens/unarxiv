/**
 * Theme configuration.
 *
 * Set NEXT_PUBLIC_THEME to switch the active theme.
 * Valid values: 'default' | any theme name defined in themes.css
 *
 * Usage:
 *   NEXT_PUBLIC_THEME=neon-noir npm run dev
 */
export type ThemeName = string;

export const ACTIVE_THEME: ThemeName =
  process.env.NEXT_PUBLIC_THEME || "retro-terminal";

/**
 * Per-theme metadata for favicons, manifest colors, and PWA appearance.
 * Themes without an entry here fall back to the "default" config.
 */
interface ThemeMeta {
  /** PWA background_color and manifest theme */
  backgroundColor: string;
  /** PWA theme_color (address bar, status bar) */
  themeColor: string;
  /** Apple status bar style */
  statusBarStyle: "default" | "black" | "black-translucent";
  /** Path prefix for favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png */
  iconDir: string;
}

const THEME_META: Record<string, ThemeMeta> = {
  default: {
    backgroundColor: "#fafaf9",
    themeColor: "#fafaf9",
    statusBarStyle: "default",
    iconDir: "/themes/default",
  },
  "retro-terminal": {
    backgroundColor: "#000a00",
    themeColor: "#000a00",
    statusBarStyle: "black",
    iconDir: "/themes/retro-terminal",
  },
};

/** Resolve metadata for the currently active theme, falling back to default. */
export function getThemeMeta(): ThemeMeta {
  return THEME_META[ACTIVE_THEME] ?? THEME_META.default;
}
