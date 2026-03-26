"""figure_utils.py — Shared figure handling for LLM-based scripting pipelines.

Provides utilities for:
  - Building a mapping of figure reference names to file paths
  - Loading and encoding images for multimodal LLM calls
  - Extracting figure references from LaTeX chunks
"""

from __future__ import annotations

import base64
import os
import re

# Image types we can send directly to vision LLMs
IMAGE_MEDIA_TYPES: dict[str, str] = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}
# Types we can convert to PNG via pymupdf before sending
CONVERTIBLE_EXTENSIONS = {".pdf", ".eps"}

# Canonical values live in config.py
from config import MAX_IMAGE_BYTES, MAX_IMAGES_PER_CHUNK, MAX_IMAGE_PIXELS


def build_figure_map(figures_dir: str) -> dict[str, str]:
    """Scan an extracted LaTeX source directory and return a mapping of
    figure reference names -> absolute file paths.

    Maps both the bare stem (e.g. "fig1") and relative paths without
    extension (e.g. "figures/fig1") so that \\includegraphics{figures/fig1}
    and \\includegraphics{fig1} both resolve correctly.
    """
    figure_map: dict[str, str] = {}
    all_exts = set(IMAGE_MEDIA_TYPES) | CONVERTIBLE_EXTENSIONS
    for root, _, files in os.walk(figures_dir):
        for fname in files:
            stem, ext = os.path.splitext(fname)
            if ext.lower() not in all_exts:
                continue
            full_path = os.path.join(root, fname)
            # Map by bare stem
            figure_map[stem] = full_path
            # Map by relative path without extension (e.g. "figures/fig1")
            rel_no_ext = os.path.splitext(os.path.relpath(full_path, figures_dir))[0]
            figure_map[rel_no_ext] = full_path
    return figure_map


def find_figure_refs(chunk: str) -> list[str]:
    """Extract figure filename references from \\includegraphics commands in a LaTeX chunk.

    Handles both \\includegraphics{name} and \\includegraphics[opts]{name}.
    Returns candidate lookup keys (with and without extension).
    """
    pattern = re.compile(r'\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}')
    refs: list[str] = []
    seen: set[str] = set()
    for m in pattern.finditer(chunk):
        ref = m.group(1).strip()
        for key in (ref, os.path.splitext(ref)[0]):
            if key not in seen:
                refs.append(key)
                seen.add(key)
    return refs


def _downscale_if_needed(data: bytes, ext: str) -> tuple[bytes, str]:
    """Downscale image if any dimension exceeds MAX_IMAGE_PIXELS.

    Returns (possibly_modified_bytes, media_type). Converts to PNG if resized.
    Claude internally tiles images at ~1568px, so anything larger just burns
    extra tokens with no quality gain.
    """
    from PIL import Image
    import io

    img = Image.open(io.BytesIO(data))
    w, h = img.size
    if w <= MAX_IMAGE_PIXELS and h <= MAX_IMAGE_PIXELS:
        return data, IMAGE_MEDIA_TYPES[ext]

    # Scale down proportionally so the largest dimension = MAX_IMAGE_PIXELS
    scale = MAX_IMAGE_PIXELS / max(w, h)
    new_w, new_h = int(w * scale), int(h * scale)
    print(f"[figure_utils] Downscaling image from {w}x{h} to {new_w}x{new_h}")
    img = img.resize((new_w, new_h), Image.LANCZOS)

    buf = io.BytesIO()
    # Save as PNG for lossless quality after resize
    img.save(buf, format="PNG")
    return buf.getvalue(), "image/png"


def load_image(path: str) -> tuple[str, str] | None:
    """Load an image file and return (media_type, base64_data), or None on failure.

    Directly encodes PNG/JPG/GIF/WEBP. Converts single-page PDF/EPS to PNG
    via pymupdf if available. Skips files exceeding MAX_IMAGE_BYTES.
    Downscales images exceeding MAX_IMAGE_PIXELS in any dimension.
    """
    ext = os.path.splitext(path)[1].lower()

    if ext in IMAGE_MEDIA_TYPES:
        try:
            with open(path, "rb") as f:
                data = f.read()
            if len(data) > MAX_IMAGE_BYTES:
                print(f"[figure_utils] Skipping oversized image ({len(data):,} bytes): {path}")
                return None
            data, media_type = _downscale_if_needed(data, ext)
            if len(data) > MAX_IMAGE_BYTES:
                print(f"[figure_utils] Skipping image after downscale ({len(data):,} bytes): {path}")
                return None
            return media_type, base64.b64encode(data).decode()
        except Exception as e:
            print(f"[figure_utils] Could not load image {path}: {e}")
            return None

    if ext in CONVERTIBLE_EXTENSIONS:
        try:
            import fitz  # pymupdf
            doc = fitz.open(path)
            if not doc:
                return None
            page = doc[0]
            # 150 DPI — good quality / size balance for LLM vision
            pix = page.get_pixmap(matrix=fitz.Matrix(150 / 72, 150 / 72))
            png_bytes = pix.tobytes("png")
            doc.close()
            if len(png_bytes) > MAX_IMAGE_BYTES:
                print(f"[figure_utils] Skipping oversized converted image ({len(png_bytes):,} bytes): {path}")
                return None
            return "image/png", base64.b64encode(png_bytes).decode()
        except Exception as e:
            print(f"[figure_utils] Could not convert {path} to PNG: {e}")
            return None

    return None


def images_for_chunk(chunk: str, figure_map: dict[str, str]) -> list[tuple[str, str]]:
    """Return (media_type, base64_data) pairs for figures referenced in a LaTeX chunk."""
    images: list[tuple[str, str]] = []
    seen_paths: set[str] = set()
    for ref in find_figure_refs(chunk):
        path = figure_map.get(ref)
        if not path or path in seen_paths:
            continue
        seen_paths.add(path)
        img = load_image(path)
        if img:
            images.append(img)
            if len(images) >= MAX_IMAGES_PER_CHUNK:
                break
    return images
