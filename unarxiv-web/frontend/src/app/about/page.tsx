import type { Metadata } from "next";
import SiteName from "@/components/SiteName";

export const metadata: Metadata = {
  title: "About — unarXiv",
  description: "About unarXiv — free audio narrations of arXiv research papers.",
};

export default function AboutPage() {
  return (
    <div className="py-12">
      {/* Hero */}
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold text-stone-900 mb-3">
          About <SiteName />
        </h1>
        <p className="text-stone-500 text-sm">Launched March 15, 2026</p>
      </div>

      {/* Cards */}
      <div className="space-y-6">
        {/* What */}
        <section className="bg-white rounded-2xl border border-stone-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400 mb-3">What is this?</h2>
          <p className="text-stone-700 leading-relaxed">
            <SiteName /> is an audio mirror of arXiv. Paste any arXiv URL or paper ID and
            we&apos;ll generate a free narrated audiobook from the paper.
            Listen while you commute, exercise, or do chores.
          </p>
        </section>

        {/* How */}
        <section className="bg-white rounded-2xl border border-stone-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400 mb-3">How it works</h2>
          <div className="flex flex-col sm:flex-row gap-4 text-sm text-stone-600">
            <div className="flex-1 flex gap-3">
              <span className="text-lg font-bold text-stone-300">1</span>
              <p>Paste an arXiv URL or paper ID — or browse to any arxiv.org paper and add <span className="font-semibold text-stone-800">un</span> to the URL.</p>
            </div>
            <div className="flex-1 flex gap-3">
              <span className="text-lg font-bold text-stone-300">2</span>
              <p>We extract the paper&apos;s text and convert it to natural-sounding speech.</p>
            </div>
            <div className="flex-1 flex gap-3">
              <span className="text-lg font-bold text-stone-300">3</span>
              <p>Stream or download the MP3 — add it to your playlist and listen on the go.</p>
            </div>
          </div>
        </section>

        {/* Recommended apps */}
        <section className="bg-white rounded-2xl border border-stone-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400 mb-3">Listen on the go</h2>
          <div className="flex flex-col gap-4 text-sm text-stone-600">
            <div>
              <p className="font-semibold text-stone-800 mb-1">Add to Home Screen (recommended)</p>
              <p>
                On your iPhone, open unarxiv.org in Safari, tap the{" "}
                <span className="inline-flex items-center align-middle">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </span>{" "}
                Share button, then choose <strong>Add to Home Screen</strong>. This gives you a full-screen app experience with playback controls on your lock screen.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <p className="font-semibold text-stone-800 mb-1">BookPlayer (offline support)</p>
                <p>
                  For offline listening, download the MP3 and store it in iCloud Drive. Use{" "}
                  <a
                    href="https://apps.apple.com/app/bookplayer-audio-book-player/id1138219998"
                    className="text-stone-800 font-medium underline hover:text-stone-600"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    BookPlayer
                  </a>{" "}
                  — a free audiobook player that supports variable speed, bookmarks, and sleep timers.
                </p>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-stone-800 mb-1">WatchAudio (offline support)</p>
                <p>
                  For offline listening on your wrist, try{" "}
                  <a
                    href="https://apps.apple.com/app/watchaudio-audio-for-watch/id1576731498"
                    className="text-stone-800 font-medium underline hover:text-stone-600"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    WatchAudio
                  </a>{" "}
                  — a one-time $4 app that syncs MP3s directly to your Apple Watch for phone-free playback.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Who + Contact side by side on desktop */}
        <div className="grid sm:grid-cols-2 gap-6">
          <section className="bg-white rounded-2xl border border-stone-200 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400 mb-3">Built by</h2>
            <p className="text-stone-700">
              <a
                href="https://inventsean.com"
                className="text-stone-900 font-semibold underline hover:text-stone-600"
                target="_blank"
                rel="noopener noreferrer"
              >
                Sean Ahrens
              </a>
            </p>
          </section>

          <section className="bg-white rounded-2xl border border-stone-200 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400 mb-3">Get in touch</h2>
            <p className="text-sm text-stone-600">hello at this domain</p>
          </section>
        </div>

      </div>

    </div>
  );
}
