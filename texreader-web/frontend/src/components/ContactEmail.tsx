"use client";

import { useState } from "react";
import TurnstileWidget from "./TurnstileWidget";

export default function ContactEmail() {
  const [revealed, setRevealed] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);

  function handleVerify(_token: string) {
    // Token verified client-side — the goal is just to gate bots from scraping
    const parts = ["hello", "unarxiv.org"];
    setRevealed(true);
    // Build email after verification so it never exists in DOM for scrapers
    const el = document.getElementById("contact-email-target");
    if (el) {
      const addr = parts.join("@");
      el.innerHTML = `<a href="mailto:${addr}" class="text-stone-800 font-medium underline hover:text-stone-600">${addr}</a>`;
    }
  }

  if (revealed) {
    return <p id="contact-email-target" className="text-sm text-stone-600" />;
  }

  if (showChallenge) {
    return (
      <div className="py-2">
        <TurnstileWidget onVerify={handleVerify} />
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowChallenge(true)}
      className="text-sm text-stone-800 font-medium underline hover:text-stone-600 cursor-pointer bg-transparent border-none p-0"
    >
      Show email address
    </button>
  );
}
