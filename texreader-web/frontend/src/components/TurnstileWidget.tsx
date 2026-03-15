"use client";

import { useEffect, useRef, useCallback } from "react";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
}

export default function TurnstileWidget({ onVerify }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const scriptLoaded = useRef(false);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || widgetId.current !== null) return;
    if (!(window as any).turnstile) return;

    widgetId.current = (window as any).turnstile.render(containerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: onVerify,
      theme: "light",
      size: "normal",
    });
  }, [onVerify]);

  useEffect(() => {
    if (scriptLoaded.current) {
      renderWidget();
      return;
    }

    // Check if script already exists
    if (document.querySelector('script[src*="turnstile"]')) {
      scriptLoaded.current = true;
      // Wait for it to load
      const check = setInterval(() => {
        if ((window as any).turnstile) {
          clearInterval(check);
          renderWidget();
        }
      }, 100);
      return () => clearInterval(check);
    }

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      scriptLoaded.current = true;
      renderWidget();
    };
    document.head.appendChild(script);

    return () => {
      if (widgetId.current !== null && (window as any).turnstile) {
        (window as any).turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [renderWidget]);

  return <div ref={containerRef} />;
}
