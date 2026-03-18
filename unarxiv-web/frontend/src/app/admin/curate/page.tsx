import { redirect } from "next/navigation";

// /admin/curate was merged into /admin — redirect for backwards compatibility
export default function CuratePage() {
  redirect("/admin");
}
