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
  process.env.NEXT_PUBLIC_THEME || "default";
