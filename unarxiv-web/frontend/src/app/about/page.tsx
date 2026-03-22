import type { Metadata } from "next";
import SiteName from "@/components/SiteName";
import UrlAnimation from "@/components/UrlAnimation";

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
        <section className="bg-surface rounded-2xl border border-stone-300 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400 mb-3">What is this?</h2>
          <p className="text-stone-700 leading-relaxed">
            <SiteName /> turns arXiv papers into audio you can listen to anywhere.
            Search for any paper by ID, URL, title, author, or abstract. If it&apos;s already been
            narrated, you can play it instantly. If it&apos;s new, narration takes about a minute.
            Unlimited and free.
          </p>
        </section>

        {/* How */}
        <section className="bg-surface rounded-2xl border border-stone-300 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400 mb-3">How it works</h2>
          <div className="flex flex-col sm:flex-row gap-4 text-sm text-stone-600">
            <div className="flex-1 flex gap-3">
              <span className="text-lg font-bold text-stone-300">1</span>
              <p>Search for a paper — by arXiv ID, URL, title, author, or keywords from the abstract.</p>
            </div>
            <div className="flex-1 flex gap-3">
              <span className="text-lg font-bold text-stone-300">2</span>
              <p>Hit play if it&apos;s ready, or tap Narrate and it&apos;ll be generated in about a minute.</p>
            </div>
            <div className="flex-1 flex gap-3">
              <span className="text-lg font-bold text-stone-300">3</span>
              <p>Papers go straight to your playlist. Listen on the go, adjust speed, pick up where you left off.</p>
            </div>
          </div>
        </section>

        {/* Quick tip */}
        <section className="bg-surface rounded-2xl border border-stone-300 p-6 flex flex-col items-center text-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400 mb-3">Pro tip</h2>
          <p className="text-sm text-stone-600">
            Browsing arxiv.org? Just add &lsquo;<span className="font-semibold text-stone-900 underline">un</span>&rsquo; to the domain and you&apos;ll land directly on the narration.
          </p>
          <UrlAnimation static />
        </section>

        {/* Recommended apps */}
        <section className="bg-surface rounded-2xl border border-stone-300 p-6">
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

        {/* Voice Quality */}
        <section className="bg-surface rounded-2xl border border-stone-300 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400 mb-3">Voice Quality</h2>
          <div className="text-sm text-stone-600 space-y-3 leading-relaxed">
            <p>
              As a free service, <SiteName /> aims for good narration quality &mdash; but not state-of-the-art.
              True SOTA voice synthesis would cost roughly $8 per paper. The model we use is effectively free,
              which is how we can offer unlimited narrations at no cost.
            </p>
            <p>
              Beyond the voice itself, converting a PDF into a script formatted for speech is a non-trivial task.
              Academic papers are full of equations, tables, figures, and formatting that don&apos;t translate
              cleanly to spoken word. We handle this conversion programmatically to keep the service free &mdash;
              which means some errors are inevitable.
            </p>
            <p>
              An LLM-based pipeline paired with a premium voice model could address both challenges &mdash;
              smarter script conversion and better synthesis &mdash; but it would mean running the service at a cost.
              We&apos;d love to offer a bring-your-own-API-key option for this. If that&apos;s something you&apos;d
              use, drop us a line &mdash; the more interest we hear, the sooner it&apos;ll happen.
            </p>
            <p>
              In the meantime, the single best way to improve narration quality for a specific paper is
              to <strong>rate it</strong>. Use the dropdown menu on any paper&apos;s page to leave a star rating
              and optional comments. An autonomous agent regularly reviews low-rated narrations
              and works to improve the underlying code.
            </p>
          </div>
        </section>

        {/* Who + Contact side by side on desktop */}
        <div className="grid sm:grid-cols-2 gap-6">
          <section className="bg-surface rounded-2xl border border-stone-300 p-6">
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
              {" and Claude"}
            </p>
          </section>

          <section className="bg-surface rounded-2xl border border-stone-300 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400 mb-3">Get in touch</h2>
            <p className="text-sm text-stone-600">hello at this domain</p>
          </section>
        </div>

      </div>

      <p className="text-2xs text-stone-400 text-center mt-8 max-w-md mx-auto">
        arXiv is a registered trademark of Cornell University. unarXiv is not affiliated with, endorsed by, or sponsored by Cornell University or arXiv.
      </p>
    </div>
  );
}
