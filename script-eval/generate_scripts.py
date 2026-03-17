#!/usr/bin/env python3
"""
Test harness: generates scripts from both papers via both LaTeX and PDF paths.
Run from script-eval/ directory:
    python generate_scripts.py
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'unarxiv-web', 'modal_worker'))

from tex_to_audio import (
    build_speech_text,
    build_speech_text_from_pdf,
    read_latex_from_tar,
)

PAPERS = {
    "paperA": {
        "arxiv_id": "1706.03762",
        "title": "Attention Is All You Need",
        "date": "June 2017",
        "authors": ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit",
                    "Llion Jones", "Aidan N. Gomez", "Łukasz Kaiser", "Illia Polosukhin"],
        "tar": "paperA.tar",
        "pdf": "paperA.pdf",
    },
    "paperB": {
        "arxiv_id": "1803.09010",
        "title": "Datasheets for Datasets",
        "date": "March 2018",
        "authors": ["Timnit Gebru", "Jamie Morgenstern", "Briana Vecchione",
                    "Jennifer Wortman Vaughan", "Hanna Wallach", "Hal Daumé III", "Kate Crawford"],
        "tar": "paperB.tar",
        "pdf": "paperB.pdf",
    },
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def run():
    for name, info in PAPERS.items():
        tar_path = os.path.join(SCRIPT_DIR, info["tar"])
        pdf_path = os.path.join(SCRIPT_DIR, info["pdf"])

        # --- LaTeX path ---
        print(f"\n=== {name}: LaTeX path ===")
        try:
            latex = read_latex_from_tar(tar_path)
            speech = build_speech_text(
                latex,
                source_stem=info["arxiv_id"],
                fallback_title=info["title"],
                fallback_authors=info["authors"],
            )
            out = os.path.join(SCRIPT_DIR, f"{name}_latex.txt")
            with open(out, "w", encoding="utf-8") as f:
                f.write(speech)
            print(f"  Written {len(speech):,} chars → {os.path.basename(out)}")
        except Exception as e:
            print(f"  ERROR: {e}")

        # --- PDF path ---
        print(f"\n=== {name}: PDF path ===")
        try:
            speech = build_speech_text_from_pdf(
                pdf_path,
                title=info["title"],
                date=info["date"],
                authors=info["authors"],
            )
            out = os.path.join(SCRIPT_DIR, f"{name}_pdf.txt")
            with open(out, "w", encoding="utf-8") as f:
                f.write(speech)
            print(f"  Written {len(speech):,} chars → {os.path.basename(out)}")
        except Exception as e:
            print(f"  ERROR: {e}")

if __name__ == "__main__":
    run()
