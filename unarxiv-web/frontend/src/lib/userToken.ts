const STORAGE_KEY = "user_token";

/** Get or create a persistent user identity token. */
export function getUserToken(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const token = crypto.randomUUID().replace(/-/g, "");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
  return token;
}
