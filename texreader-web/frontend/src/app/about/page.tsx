import type { Metadata } from "next";
import Link from "next/link";
import SiteName from "@/components/SiteName";

export const metadata: Metadata = {
  title: "About — unarXiv",
  description: "About unarXiv — free audio narrations of arXiv research papers.",
};

export default function AboutPage() {
  return (
    <div className="max-w-xl mx-auto py-8">
      <h1 className="text-2xl font-bold text-stone-900 mb-6">About <SiteName /></h1>

      <div className="space-y-4 text-sm text-stone-600 leading-relaxed">
        <p>
          unarXiv converts arXiv research papers into narrated audio, so you can
          listen to papers while commuting, exercising, or doing chores.
        </p>

        <p>
          Paste any arXiv URL or paper ID and we'll generate a free audio
          narration. Papers are processed through LaTeX parsing and
          text-to-speech to produce natural-sounding MP3 audiobooks.
        </p>

        <h2 className="text-lg font-semibold text-stone-800 pt-4">Contact</h2>
        <p>
          Questions, feedback, or issues? Reach us at{" "}
          <span
            className="text-stone-800 font-medium select-all"
            style={{ direction: "rtl", unicodeBidi: "bidi-override", display: "inline-block" }}
            aria-label="hello at unarXiv dot org"
          >
            {"gro.viXranu@olleh"}
          </span>
        </p>
      </div>

      <div className="mt-10">
        <Link
          href="/"
          className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
        >
          &larr; Back to papers
        </Link>
      </div>
    </div>
  );
}
