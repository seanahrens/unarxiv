import type { Metadata } from "next";
import SiteName from "@/components/SiteName";
import ContactEmail from "@/components/ContactEmail";

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
            we&apos;ll generate a free narrated audiobook from the paper&apos;s LaTeX source.
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
              <p>We parse the LaTeX source and convert it to natural-sounding speech.</p>
            </div>
            <div className="flex-1 flex gap-3">
              <span className="text-lg font-bold text-stone-300">3</span>
              <p>Stream or download the MP3 — add it to your playlist and listen on the go.</p>
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
            <ContactEmail />
          </section>
        </div>

        {/* Legal */}
        <p className="text-xs text-stone-400 text-center pt-2">
          arXiv is a registered trademark of Cornell University. <SiteName /> is not
          affiliated with, endorsed by, or sponsored by Cornell University or arXiv.
        </p>
      </div>

    </div>
  );
}
