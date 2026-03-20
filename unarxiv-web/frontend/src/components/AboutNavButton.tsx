"use client";

import { usePathname, useRouter } from "next/navigation";

export default function AboutNavButton() {
  const pathname = usePathname();
  const router = useRouter();
  const isOnAbout = pathname === "/about" || pathname === "/about/";

  const handleClick = () => {
    if (isOnAbout) {
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    } else {
      router.push("/about");
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-6 h-6 flex items-center justify-center rounded-full text-sm font-bold leading-none transition-colors ${
        isOnAbout
          ? "bg-stone-900 text-white"
          : "bg-stone-500 text-white hover:bg-stone-600"
      }`}
      title="About"
    >
      i
    </button>
  );
}
