export const TEST_ARXIV_ID = "2602.21593";
export const API_BASE =
  process.env.TEST_API_URL || "https://api.unarxiv.org";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

/** Discovered in global-setup.ts and written to env */
export function knownCompleteId(): string {
  const id = process.env.KNOWN_COMPLETE_ID;
  if (!id) throw new Error("KNOWN_COMPLETE_ID not set — global setup failed");
  return id;
}
