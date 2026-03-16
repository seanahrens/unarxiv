import { findCompletePaper } from "./api";

export default async function globalSetup() {
  const id = await findCompletePaper();
  process.env.KNOWN_COMPLETE_ID = id;
  console.log(`Global setup: KNOWN_COMPLETE_ID = ${id}`);
}
