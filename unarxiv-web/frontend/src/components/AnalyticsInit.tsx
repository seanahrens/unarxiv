"use client";
import { useEffect } from "react";
import { init } from "@/lib/analytics";

export default function AnalyticsInit() {
  useEffect(() => {
    init();
  }, []);
  return null;
}
