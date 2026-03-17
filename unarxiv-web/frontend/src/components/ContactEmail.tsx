"use client";

import { useState } from "react";
import TurnstileWidget from "./TurnstileWidget";

export default function ContactEmail() {
  const [revealed, setRevealed] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [email, setEmail] = useState("");

  function handleVerify(_token: string) {
    // Token verified client-side — the goal is just to gate bots from scraping
    const parts = ["hello", "unarxiv.org"];
    const addr = parts.join("@");
    setEmail(addr);
    setRevealed(true);
  }

  if (revealed) {
    return (
      <p className="text-sm text-slate-400">
        <a href={`mailto:${email}`} className="text-slate-200 font-medium underline hover:text-slate-400">{email}</a>
      </p>
    );
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
      className="text-sm text-slate-200 font-medium underline hover:text-slate-400 cursor-pointer bg-transparent border-none p-0"
    >
      Show email address
    </button>
  );
}
