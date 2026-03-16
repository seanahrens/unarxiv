"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
}

export default function TurnstileWidget({ onVerify }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || widgetId.current !== null) return;
    if (!(window as any).turnstile) return;

    try {
      widgetId.current = (window as any).turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: onVerify,
        theme: "light",
        size: "normal",
      });
      setLoading(false);
    } catch (e) {
      console.error("Turnstile render failed:", e);
    }
  }, [onVerify]);

  useEffect(() => {
    // Always reset widget ID on mount (fresh render each time modal opens)
    widgetId.current = null;

    const tryRender = () => {
      if ((window as any).turnstile) {
        // Small delay to ensure container is in DOM and visible
        setTimeout(renderWidget, 50);
        return true;
      }
      return false;
    };

    // Check if script already loaded
    if (tryRender()) return;

    // Check if script tag exists but hasn't loaded yet
    if (document.querySelector('script[src*="turnstile"]')) {
      const check = setInterval(() => {
        if ((window as any).turnstile) {
          clearInterval(check);
          setTimeout(renderWidget, 50);
        }
      }, 100);
      return () => clearInterval(check);
    }

    // Load script fresh
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      setTimeout(renderWidget, 50);
    };
    document.head.appendChild(script);

    return () => {
      if (widgetId.current !== null && (window as any).turnstile) {
        try { (window as any).turnstile.remove(widgetId.current); } catch {}
        widgetId.current = null;
      }
    };
  }, [renderWidget]);

  return (
    <div>
      <div ref={containerRef} />
      {loading && (
        <div className="text-sm text-stone-500 py-4 text-center">
          Loading verification...
        </div>
      )}
    </div>
  );
}
