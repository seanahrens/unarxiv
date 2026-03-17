"use client";

import { useState, useCallback, useEffect } from "react";
import { verifyAdminPassword, fetchAdminStats, API_BASE, type Contributor } from "@/lib/api";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [hasLowRatings, setHasLowRatings] = useState(false);

  // Check sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("admin_password");
    if (saved) {
      verifyAdminPassword(saved)
        .then((valid) => {
          if (valid) {
            setPassword(saved);
            setAuthenticated(true);
          } else {
            sessionStorage.removeItem("admin_password");
          }
        })
        .catch(() => {})
        .finally(() => setCheckingSession(false));
    } else {
      setCheckingSession(false);
    }
  }, []);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setVerifying(true);
    setError("");
    try {
      const valid = await verifyAdminPassword(password);
      if (valid) {
        sessionStorage.setItem("admin_password", password);
        setAuthenticated(true);
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Could not verify password");
    } finally {
      setVerifying(false);
    }
  }, [password]);

  useEffect(() => {
    if (!authenticated) return;
    const pw = sessionStorage.getItem("admin_password");
    if (!pw) return;

    fetchAdminStats(pw)
      .then((data) => setContributors(data.contributors))
      .catch(console.error);

    // Check for low-rated papers
    fetch(`${API_BASE}/api/admin/has-low-ratings`, {
      headers: { "X-Admin-Password": pw },
    })
      .then((r) => r.json())
      .then((data) => setHasLowRatings(data.has_low_ratings))
      .catch(() => {});
  }, [authenticated]);

  if (checkingSession) {
    return <div className="text-center py-20 text-slate-500 text-sm">Loading...</div>;
  }

  if (!authenticated) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <h1 className="text-xl font-bold text-slate-100 mb-4">Admin Access</h1>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full px-4 py-2.5 border border-slate-700 rounded-lg mb-3
                       focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          {error && (
            <p className="text-sm text-red-400 mb-3">{error}</p>
          )}
          <button
            type="submit"
            disabled={verifying}
            className="w-full px-4 py-2.5 bg-slate-100 hover:bg-indigo-600 text-white
                       text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {verifying ? "Verifying..." : "Continue"}
          </button>
        </form>
      </div>
    );
  }

  const internalLinks = [
    {
      label: "Curate Papers",
      url: "/admin/curate",
      description: "Review, manage, and delete papers from the database",
    },
  ];

  const links = [
    {
      label: "Modal Apps",
      url: "https://modal.com/apps/seanahrens/main/deployed/unarxiv-worker",
      description: "Narration worker logs & invocations",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
        </svg>
      ),
    },
    {
      label: "Workers API",
      url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/workers/services/view/unarxiv-api",
      description: "API worker settings & analytics",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
          <path d="M7 8l3 3-3 3" /><path d="M13 14h4" />
        </svg>
      ),
    },
    {
      label: "D1 Database",
      url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/workers/d1/databases/d1936353-a389-4f38-a109-79db70cc44ef",
      description: "Tables & query explorer",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      ),
    },
    {
      label: "R2 Storage",
      url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/r2/overview",
      description: "Audio files bucket",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20h16a2 2 0 002-2V8a2 2 0 00-2-2h-7.93a2 2 0 01-1.66-.9l-.82-1.2A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: "Pages",
      url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/pages",
      description: "Frontend deployments & domains",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
      ),
    },
    {
      label: "Turnstile",
      url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/turnstile",
      description: "Bot protection & analytics",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      ),
    },
    {
      label: "DNS",
      url: "https://dash.cloudflare.com/4c9d05e2d48211dd3456d108f246e340/aixdemocracy.fyi/dns/records",
      description: "DNS records for papers.aixdemocracy.fyi",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
          <circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="6" cy="18" r="1" fill="currentColor" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <a
        href="/"
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        &larr; Back to papers
      </a>

      <h1 className="text-2xl font-bold text-slate-100 mb-6">Admin</h1>

      <div className="space-y-3 mb-8">
        {internalLinks.map((link) => (
          <a
            key={link.url}
            href={link.url}
            className={`block bg-slate-900 rounded-lg border p-4 hover:shadow-md transition-shadow no-underline ${
              link.label === "Curate Papers" && hasLowRatings
                ? "border-orange-300"
                : "border-slate-700"
            }`}
          >
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              {link.label}
              {link.label === "Curate Papers" && hasLowRatings && (
                <span className="text-orange-500" title="Papers with low narration ratings need attention">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                  </svg>
                </span>
              )}
            </h3>
            <p className="text-sm text-slate-9000 mt-1">
              {link.description}
              {link.label === "Curate Papers" && hasLowRatings && (
                <span className="text-orange-600 font-medium ml-1">
                  — Papers with low ratings need review
                </span>
              )}
            </p>
          </a>
        ))}
      </div>

      {contributors.length > 0 && (
        <>
          <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-4">
            Top Contributors
          </h2>
          <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5 text-right">Papers</th>
                </tr>
              </thead>
              <tbody>
                {contributors.map((c, i) => (
                  <tr key={i} className={`border-b border-slate-800 ${c.is_you ? "bg-indigo-950/30" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-slate-100">
                      {c.name}
                      {c.is_you && (
                        <span className="ml-2 text-xs text-indigo-400 font-normal">(you)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-9000">{c.location}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">{c.paper_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-4">
        External Dashboards
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center text-center bg-slate-900 rounded-xl border border-slate-700
                       p-5 hover:border-slate-700 hover:shadow-md transition-all no-underline"
          >
            <div className="text-slate-500 mb-3">{link.icon}</div>
            <h3 className="text-sm font-semibold text-slate-100">{link.label}</h3>
            <p className="text-xs text-slate-500 mt-1">{link.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
