import type { Metadata } from "next";
import Link from "next/link";
import SiteName from "@/components/SiteName";
import ContactEmail from "@/components/ContactEmail";

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
          Paste any arXiv URL or paper ID and we&apos;ll generate a free audio
          narration. Papers are processed through LaTeX parsing and
          text-to-speech to produce natural-sounding MP3 audiobooks.
        </p>

        <h2 className="text-lg font-semibold text-stone-800 pt-4">Made by</h2>
        <p>
          <SiteName /> was created by{" "}
          <a href="https://inventsean.com" className="text-stone-800 font-medium underline hover:text-stone-600" target="_blank" rel="noopener noreferrer">Sean Ahrens</a>.
        </p>

        <h2 className="text-lg font-semibold text-stone-800 pt-4">Contact</h2>
        <p>
          Questions, feedback, or issues? Complete the verification below to reveal our email address.
        </p>
        <ContactEmail />

        <h2 className="text-lg font-semibold text-stone-800 pt-4">Legal</h2>
        <p>
          arXiv is a registered trademark of Cornell University. unarXiv is not
          affiliated with, endorsed by, or sponsored by Cornell University or
          arXiv.
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
