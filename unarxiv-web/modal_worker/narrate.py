"""
unarXiv Modal Worker — Narrates arXiv papers and uploads MP3s to R2.

Deploy: modal deploy narrate.py

Parser versions:
  - parser_v2 (default): Modular next-gen parser with better math, citation,
    and formatting handling. Always uses arXiv-scraped metadata.
  - tex_to_audio_legacy: Original monolithic parser, kept for A/B comparison.
    Set PARSER_VERSION=legacy to use it.
"""

import modal
import os
import tempfile
import tarfile
import time


def _safe_extractall(tf: tarfile.TarFile, path: str) -> None:
    """Extract tar archive with path traversal protection (zip slip fix).

    Validates every member path stays within the target directory before
    extraction, guarding against maliciously crafted arXiv source archives.
    """
    real_path = os.path.realpath(path)
    for member in tf.getmembers():
        member_path = os.path.realpath(os.path.join(real_path, member.name))
        if not member_path.startswith(real_path + os.sep) and member_path != real_path:
            raise RuntimeError(f"Blocked path traversal attempt in archive: {member.name!r}")
    tf.extractall(path)

app = modal.App("unarxiv-worker")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("edge-tts>=6.1.0", "mutagen>=1.47.0", "httpx>=0.27.0", "boto3>=1.34.0", "fastapi[standard]", "pymupdf>=1.24.0")
    .run_commands("python -c 'import edge_tts; print(edge_tts.__version__)'")  # verify edge-tts installed
    # Legacy parser (kept for A/B switching via PARSER_VERSION=legacy)
    .add_local_file("tex_to_audio_legacy.py", "/app/tex_to_audio_legacy.py", copy=True)
    # Active parser_v2 modules
    .add_local_file("tex_to_audio.py", "/app/tex_to_audio.py", copy=True)
    .add_local_dir("parser_v2", "/app/parser_v2", copy=True, ignore=["test_data/*", "__pycache__/*"])
)

# Premium image extends the base image with LLM and premium TTS packages.
# API keys are passed per-request and are never stored in the image or secrets.
premium_image = (
    image
    .pip_install(
        "anthropic>=0.34",
        "openai>=1.40",
        "google-generativeai>=0.8",
        "elevenlabs>=1.0",
    )
    .add_local_file("llm_scripting.py", "/app/llm_scripting.py", copy=True)
    .add_local_file("premium_tts.py", "/app/premium_tts.py", copy=True)
)

# Modal secret: "unarxiv-secrets" (legacy name — renaming requires recreating in Modal)
# Required keys:
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
#   CALLBACK_SECRET (shared with Worker's MODAL_WEBHOOK_SECRET)
# Optional:
#   PARSER_VERSION: "v2" (default) or "legacy"
#
# All services now use the "unarxiv" naming convention:
#   Modal secret: "unarxiv-secrets", R2 bucket: "unarxiv-audio",
#   Modal app: "unarxiv-worker", CF Worker: "unarxiv-api".


def send_status(callback_url: str, secret: str, arxiv_id: str, **kwargs):
    """POST a status update back to the Cloudflare Worker."""
    import httpx

    try:
        httpx.post(
            callback_url,
            json={"arxiv_id": arxiv_id, **kwargs},
            headers={"Authorization": f"Bearer {secret}"},
            timeout=10,
        )
    except Exception as e:
        print(f"Warning: callback failed: {e}")


def _make_r2_client():
    """Return a boto3 S3 client configured for Cloudflare R2."""
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def upload_to_r2(local_path: str, r2_key: str, content_type: str = "audio/mpeg") -> int:
    """Upload a file to Cloudflare R2 via S3 API. Returns file size in bytes."""
    s3 = _make_r2_client()
    file_size = os.path.getsize(local_path)
    s3.upload_file(
        local_path,
        os.environ["R2_BUCKET_NAME"],
        r2_key,
        ExtraArgs={"ContentType": content_type},
    )
    return file_size


def _download_from_r2(r2_key: str) -> str | None:
    """Download a text file from R2. Returns content or None if not found."""
    s3 = _make_r2_client()
    try:
        obj = s3.get_object(Bucket=os.environ["R2_BUCKET_NAME"], Key=r2_key)
        return obj["Body"].read().decode("utf-8")
    except Exception:
        return None


def _use_legacy_parser() -> bool:
    """Check if the legacy parser should be used instead of parser_v2."""
    return os.environ.get("PARSER_VERSION", "v2").lower() == "legacy"


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("unarxiv-secrets")],
    timeout=3600,  # 1 hour max per paper
    retries=0,
)
def narrate_paper(arxiv_id: str, tex_source_url: str, callback_url: str, paper_title: str = "", paper_author: str = "", paper_date: str = "", mode: str = "full", source_priority: str = "latex"):
    """Download, process, and narrate an arXiv paper.

    mode: "full" (default) = regenerate script + audio
          "script_only"    = regenerate script only, keep existing audio
          "narration_only" = re-narrate from existing transcript in R2

    source_priority: "latex" (default) = try LaTeX source first, fall back to PDF
                     "pdf"             = try PDF first, fall back to LaTeX source
    """
    import sys
    sys.path.insert(0, "/app")

    # tex_to_audio is always loaded for TTS utilities (chunking, voice, tagging)
    import tex_to_audio
    import httpx

    use_legacy = _use_legacy_parser()
    parser_label = "legacy" if use_legacy else "v2"
    print(f"Using parser: {parser_label}")

    if use_legacy:
        import tex_to_audio_legacy as legacy_parser

    secret = os.environ.get("CALLBACK_SECRET", "")

    work_dir = tempfile.mkdtemp()
    tar_path = os.path.join(work_dir, f"{arxiv_id}.tar.gz")
    source_dir = os.path.join(work_dir, "source")
    output_path = os.path.join(work_dir, f"{arxiv_id}.mp3")

    try:
        speech = None

        if mode == "narration_only":
            # --- Download existing transcript from R2 ---
            send_status(callback_url, secret, arxiv_id, status="narrating",
                        progress_detail="Downloading existing transcript...")
            print(f"Downloading existing transcript for {arxiv_id}...")
            speech = _download_from_r2(f"transcripts/{arxiv_id}.txt")
            if not speech:
                raise RuntimeError(f"No transcript found in R2 for {arxiv_id}")
            print(f"Loaded transcript: {len(speech):,} chars")
        else:
            # --- Stage 1: Download, extract, process source ---
            send_status(callback_url, secret, arxiv_id, status="narrating")

            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"
            authors_list = [a.strip() for a in paper_author.split(",")] if paper_author else []

            def _download(url: str) -> httpx.Response:
                with httpx.Client(timeout=120, follow_redirects=True) as client:
                    r = client.get(url, headers={"User-Agent": "unarXiv/1.0"})
                    r.raise_for_status()
                    return r

            # ---------------------------------------------------------------
            # parser_v2 processing functions
            # ---------------------------------------------------------------

            def _save_source(data: bytes, filename: str) -> str:
                """Write source bytes to work_dir and return the path."""
                path = os.path.join(work_dir, filename)
                with open(path, "wb") as f:
                    f.write(data)
                return path

            def _process_v2(source_path: str, pdf_path: str | None = None) -> str:
                """Route to parser_v2 with arXiv metadata."""
                from parser_v2 import parse_paper
                return parse_paper(
                    source_path=source_path,
                    source_priority=source_priority,
                    fallback_title=paper_title,
                    fallback_authors=authors_list,
                    fallback_date=paper_date,
                    pdf_path=pdf_path,
                )

            # ---------------------------------------------------------------
            # Legacy parser processing functions (for A/B switching)
            # ---------------------------------------------------------------

            def _process_legacy_pdf(data: bytes) -> str:
                """Build speech text from PDF bytes using legacy parser."""
                pdf_path = _save_source(data, f"{arxiv_id}.pdf")
                return legacy_parser.build_speech_text_from_pdf(
                    pdf_path,
                    title=paper_title,
                    date=paper_date,
                    authors=authors_list,
                )

            def _process_legacy_latex(data: bytes, content_type: str) -> str:
                """Extract LaTeX from archive and build speech via legacy parser."""
                src_path = _save_source(data, f"{arxiv_id}.tar.gz")
                os.makedirs(source_dir, exist_ok=True)
                if "gzip" in content_type or "tar" in content_type or src_path.endswith(".gz"):
                    try:
                        with tarfile.open(src_path, "r:*") as tf:
                            _safe_extractall(tf, source_dir)
                    except tarfile.TarError:
                        import gzip
                        try:
                            with gzip.open(src_path, "rb") as gz:
                                decompressed = gz.read()
                            with open(os.path.join(source_dir, "main.tex"), "wb") as f:
                                f.write(decompressed)
                            print(f"Decompressed single gzip'd .tex file ({len(decompressed):,} bytes)")
                        except gzip.BadGzipFile:
                            os.rename(src_path, os.path.join(source_dir, "main.tex"))
                else:
                    os.rename(src_path, os.path.join(source_dir, "main.tex"))

                print("Processing LaTeX (legacy)...")
                latex = legacy_parser.read_latex_from_dir(source_dir)
                return legacy_parser.build_speech_text(
                    latex, source_stem=f"arXiv-{arxiv_id}",
                    fallback_title=paper_title,
                    fallback_authors=authors_list,
                )

            # ---------------------------------------------------------------
            # Source download and routing
            # ---------------------------------------------------------------

            if use_legacy:
                # ---- Legacy parser path ----
                if source_priority == "pdf":
                    print(f"Source priority: PDF. Downloading {pdf_url}...")
                    try:
                        resp = _download(pdf_url)
                        print(f"Downloaded PDF: {len(resp.content)} bytes")
                        speech = _process_legacy_pdf(resp.content)
                    except Exception as pdf_err:
                        print(f"PDF failed ({pdf_err}), falling back to LaTeX source...")
                        resp = _download(tex_source_url)
                        print(f"Downloaded LaTeX source: {len(resp.content)} bytes")
                        with open(tar_path, "wb") as f:
                            f.write(resp.content)
                        if tex_to_audio.is_pdf_file(tar_path):
                            speech = _process_legacy_pdf(resp.content)
                        else:
                            speech = _process_legacy_latex(resp.content, resp.headers.get("content-type", ""))
                else:
                    print(f"Source priority: LaTeX. Downloading {tex_source_url}...")
                    resp = _download(tex_source_url)
                    print(f"Downloaded {len(resp.content)} bytes")
                    with open(tar_path, "wb") as f:
                        f.write(resp.content)
                    if tex_to_audio.is_pdf_file(tar_path):
                        print("Source is a PDF (no LaTeX available). Using PDF pipeline...")
                        speech = _process_legacy_pdf(resp.content)
                    else:
                        speech = _process_legacy_latex(resp.content, resp.headers.get("content-type", ""))
            else:
                # ---- parser_v2 path (default) ----
                # Download both sources so parser_v2 can try priority then fallback
                latex_path = None
                pdf_local_path = None

                if source_priority == "pdf":
                    # Download PDF first
                    print(f"Source priority: PDF. Downloading {pdf_url}...")
                    try:
                        resp = _download(pdf_url)
                        print(f"Downloaded PDF: {len(resp.content)} bytes")
                        pdf_local_path = _save_source(resp.content, f"{arxiv_id}.pdf")
                    except Exception as e:
                        print(f"PDF download failed: {e}")

                    # Also try to get LaTeX as fallback
                    try:
                        resp = _download(tex_source_url)
                        latex_path = _save_source(resp.content, f"{arxiv_id}.tar.gz")
                        if tex_to_audio.is_pdf_file(latex_path):
                            # /src/ endpoint returned a PDF (no LaTeX available)
                            if not pdf_local_path:
                                pdf_local_path = latex_path
                            latex_path = None
                    except Exception:
                        pass

                    # Route to parser_v2
                    if pdf_local_path:
                        speech = _process_v2(
                            source_path=pdf_local_path,
                            pdf_path=pdf_local_path,
                        )
                    elif latex_path:
                        speech = _process_v2(source_path=latex_path)
                    else:
                        raise RuntimeError("Both PDF and LaTeX downloads failed")

                else:
                    # LaTeX-first (default)
                    print(f"Source priority: LaTeX. Downloading {tex_source_url}...")
                    resp = _download(tex_source_url)
                    print(f"Downloaded {len(resp.content)} bytes")
                    latex_path = _save_source(resp.content, f"{arxiv_id}.tar.gz")

                    is_pdf = tex_to_audio.is_pdf_file(latex_path)

                    if is_pdf:
                        print("Source is a PDF (no LaTeX available). Using PDF pipeline...")
                        pdf_local_path = latex_path
                        latex_path = None
                    else:
                        # Also try downloading PDF as fallback for parser_v2
                        try:
                            pdf_resp = _download(pdf_url)
                            pdf_local_path = _save_source(pdf_resp.content, f"{arxiv_id}.pdf")
                        except Exception:
                            pass  # PDF fallback is optional

                    speech = _process_v2(
                        source_path=latex_path or pdf_local_path,
                        pdf_path=pdf_local_path,
                    )

            print(f"Generated speech text ({parser_label}): {len(speech):,} chars")

            # Save transcript to R2
            transcript_path = os.path.join(work_dir, f"{arxiv_id}-transcript.txt")
            with open(transcript_path, "w") as f:
                f.write(speech)
            transcript_r2_key = f"transcripts/{arxiv_id}.txt"
            print(f"Uploading transcript to R2: {transcript_r2_key}")
            upload_to_r2(transcript_path, transcript_r2_key, content_type="text/plain; charset=utf-8")

        # --- Script-only mode: done after transcript ---
        if mode == "script_only":
            send_status(
                callback_url, secret, arxiv_id,
                status="narrated",
                progress_detail="Script regenerated",
            )
            print(f"Script-only done: {arxiv_id}")
            return

        # --- Generate audio (full + narration_only modes) ---
        # Strip the version tag before TTS — it's for the transcript only
        import re
        tts_text = re.sub(r"\n\n%%%+ .+ %%%+\s*$", "", speech)
        chunks = tex_to_audio._split_into_chunks(tts_text)
        total_chunks = len(chunks)
        print(f"Generating audio... ({total_chunks} chunks)")

        # Send initial status with estimated ETA (~5s per chunk for edge-tts)
        EST_SECS_PER_CHUNK = 5
        initial_eta = total_chunks * EST_SECS_PER_CHUNK
        send_status(
            callback_url, secret, arxiv_id,
            status="narrating",
            eta_seconds=initial_eta,
        )

        # Generate audio with progress tracking + ETA
        tmp_dir = tempfile.mkdtemp()
        chunk_paths = []
        audio_start_time = time.time()

        for i, chunk in enumerate(chunks):
            chunk_path = os.path.join(tmp_dir, f"chunk_{i:03d}.mp3")
            print(f"  chunk {i + 1}/{total_chunks}...")
            tex_to_audio._tts_chunk(chunk, chunk_path, tex_to_audio.DEFAULT_VOICE)
            chunk_paths.append(chunk_path)

            # Report progress after every chunk for responsive ETA updates
            done = i + 1
            remaining_chunks = total_chunks - done
            elapsed = time.time() - audio_start_time
            secs_per_chunk = elapsed / done
            remaining_secs = int(secs_per_chunk * remaining_chunks)
            send_status(
                callback_url, secret, arxiv_id,
                status="narrating",
                eta_seconds=remaining_secs,
            )

        # Concatenate chunks with ffmpeg
        # Note: paths are generated internally (not user-controlled)
        list_file = os.path.join(tmp_dir, "list.txt")
        with open(list_file, "w") as fh:
            fh.writelines(f"file '{p}'\n" for p in chunk_paths)

        import subprocess
        result = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
             "-i", list_file, "-acodec", "copy", output_path],
            capture_output=True,
        )

        # Cleanup temp chunks
        for p in chunk_paths:
            if os.path.exists(p):
                os.remove(p)

        if result.returncode != 0:
            raise RuntimeError("ffmpeg concatenation failed")

        # Tag the MP3 — always use arXiv-scraped metadata
        tag_title = paper_title or "Untitled"
        tag_author = paper_author or "Unknown"
        tex_to_audio.tag_mp3(output_path, title=tag_title, author=tag_author, arxiv_id=arxiv_id)

        # Get duration
        duration_seconds = None
        try:
            from mutagen.mp3 import MP3
            audio = MP3(output_path)
            duration_seconds = int(audio.info.length)
        except Exception:
            pass

        file_size = os.path.getsize(output_path)
        print(f"Audio generated: {file_size / (1024*1024):.1f} MB, {duration_seconds}s")

        # --- Upload to R2 ---
        r2_key = f"audio/{arxiv_id}.mp3"
        print(f"Uploading to R2: {r2_key}")
        upload_to_r2(output_path, r2_key)

        # --- Done ---
        send_status(
            callback_url, secret, arxiv_id,
            status="narrated",
            eta_seconds=0,
            audio_r2_key=r2_key,
            audio_size_bytes=file_size,
            duration_seconds=duration_seconds,
        )
        print(f"Done: {arxiv_id}")

    except Exception as e:
        print(f"Error processing {arxiv_id}: {e}")
        send_status(
            callback_url, secret, arxiv_id,
            status="failed",
            error_message=str(e)[:500],
        )
        raise


# Web endpoint for the Cloudflare Worker to call
@app.function(
    image=image,
    secrets=[modal.Secret.from_name("unarxiv-secrets")],
    timeout=60,
)
@modal.fastapi_endpoint(method="POST")
def trigger_narration(request: dict):
    """HTTP endpoint called by the Cloudflare Worker to start narration."""
    # fastapi is available on the Modal container (not locally), so import here.
    from fastapi import HTTPException

    # Verify shared secret passed in the request body.
    # The CF Worker sends _secret = MODAL_WEBHOOK_SECRET, which equals CALLBACK_SECRET here.
    callback_secret = os.environ.get("CALLBACK_SECRET", "")
    if not callback_secret or request.get("_secret") != callback_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")

    arxiv_id = request.get("arxiv_id")
    tex_source_url = request.get("tex_source_url")
    callback_url = request.get("callback_url")
    paper_title = request.get("paper_title", "")
    paper_author = request.get("paper_author", "")
    paper_date = request.get("paper_date", "")
    mode = request.get("mode", "full")
    source_priority = request.get("source_priority", "latex")
    if source_priority not in ("latex", "pdf"):
        source_priority = "latex"

    if not all([arxiv_id, callback_url]):
        return {"error": "arxiv_id and callback_url required"}
    if mode != "narration_only" and not tex_source_url:
        return {"error": "tex_source_url required for this mode"}

    # Allowlist callback_url to prevent SSRF / credential exfiltration.
    # The CF Worker always sends the production API URL; localhost is invalid
    # here since Modal runs remotely and can never reach localhost.
    if not callback_url.startswith("https://api.unarxiv.org/"):
        raise HTTPException(status_code=400, detail="Invalid callback_url")

    # Spawn the narration as an async job
    narrate_paper.spawn(arxiv_id, tex_source_url or "", callback_url, paper_title, paper_author, paper_date, mode, source_priority)

    return {"status": "dispatched", "arxiv_id": arxiv_id, "mode": mode, "source_priority": source_priority}


# ---------------------------------------------------------------------------
# Premium narration pipeline
# ---------------------------------------------------------------------------

@app.function(
    image=premium_image,
    secrets=[modal.Secret.from_name("unarxiv-secrets")],
    timeout=7200,  # 2 hours max (LLM + premium TTS can both be slow)
    retries=0,
)
def narrate_paper_premium(
    arxiv_id: str,
    tex_source_url: str,
    callback_url: str,
    paper_title: str = "",
    paper_author: str = "",
    paper_date: str = "",
    source_priority: str = "latex",
    llm_provider: str = "anthropic",
    llm_api_key: str = "",
    tts_provider: str = "elevenlabs",
    tts_api_key: str = "",
    version_id: str = "",
):
    """Premium narration pipeline: source → LLM script improvement → premium TTS → R2.

    Pipeline:
      1. Download arXiv source (LaTeX-first or PDF-first per source_priority)
      2. Parse with parser_v2 to produce the free-tier script
      3. LLM rewrite for audio (describe figures, humanise equations, smooth transitions)
      4. Premium TTS synthesis (or free edge-tts when tts_provider="free")
      5. Upload versioned audio + transcript to R2
      6. Callback to Worker with version metadata and cost breakdown

    Partial-success handling: if LLM succeeds but TTS fails, the improved script
    is already saved to R2 and the callback reports status="script_ready" so the
    Worker can persist it even without audio.

    Security: api keys are used only within this function call and are never
    logged, stored, or forwarded anywhere.
    """
    import sys
    import uuid
    sys.path.insert(0, "/app")

    import tex_to_audio
    import httpx
    from llm_scripting import get_llm_provider
    from premium_tts import get_tts_provider

    secret = os.environ.get("CALLBACK_SECRET", "")

    if not version_id:
        version_id = uuid.uuid4().hex[:12]

    work_dir = tempfile.mkdtemp()
    tar_path = os.path.join(work_dir, f"{arxiv_id}.tar.gz")

    # Versioned R2 keys
    audio_r2_key = f"audio/{arxiv_id}/v{version_id}.mp3"
    transcript_r2_key = f"transcripts/{arxiv_id}/v{version_id}.txt"

    # Quality rank: 1–5 where 5 = LLM-improved + premium TTS
    _premium_tts = tts_provider not in ("free",)
    _has_llm = bool(llm_api_key)
    quality_rank = (3 if _premium_tts else 1) + (2 if _has_llm else 0)
    quality_rank = min(quality_rank, 5)

    def _download(url: str) -> httpx.Response:
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            r = client.get(url, headers={"User-Agent": "unarXiv/1.0"})
            r.raise_for_status()
            return r

    def _save_source(data: bytes, filename: str) -> str:
        path = os.path.join(work_dir, filename)
        with open(path, "wb") as f:
            f.write(data)
        return path

    authors_list = [a.strip() for a in paper_author.split(",")] if paper_author else []

    try:
        # ---------------------------------------------------------------
        # Stage 1: Send initial status
        # ---------------------------------------------------------------
        send_status(callback_url, secret, arxiv_id,
                    status="narrating",
                    progress_detail="Downloading source...",
                    version_id=version_id)

        # ---------------------------------------------------------------
        # Stage 2: Download + parse source with parser_v2
        # ---------------------------------------------------------------
        pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"
        latex_path: str | None = None
        pdf_local_path: str | None = None
        raw_source_text: str | None = None  # passed to LLM for context

        if source_priority == "pdf":
            try:
                resp = _download(pdf_url)
                pdf_local_path = _save_source(resp.content, f"{arxiv_id}.pdf")
                print(f"Downloaded PDF: {len(resp.content):,} bytes")
            except Exception as e:
                print(f"PDF download failed ({e}), trying LaTeX fallback...")

            try:
                resp = _download(tex_source_url)
                lp = _save_source(resp.content, f"{arxiv_id}.tar.gz")
                if tex_to_audio.is_pdf_file(lp):
                    if not pdf_local_path:
                        pdf_local_path = lp
                else:
                    latex_path = lp
            except Exception as e:
                print(f"LaTeX download failed ({e})")

            source_path = pdf_local_path or latex_path
            if source_path is None:
                raise RuntimeError("Both PDF and LaTeX downloads failed")
        else:
            # LaTeX-first (default)
            resp = _download(tex_source_url)
            print(f"Downloaded source: {len(resp.content):,} bytes")
            lp = _save_source(resp.content, f"{arxiv_id}.tar.gz")
            if tex_to_audio.is_pdf_file(lp):
                pdf_local_path = lp
            else:
                latex_path = lp
                # Also grab PDF as fallback for parser_v2
                try:
                    pdf_resp = _download(pdf_url)
                    pdf_local_path = _save_source(pdf_resp.content, f"{arxiv_id}.pdf")
                except Exception:
                    pass
            source_path = latex_path or pdf_local_path

        # If we have a LaTeX source, read it for the LLM context pass
        if latex_path:
            try:
                import tarfile as _tarfile
                extract_dir = os.path.join(work_dir, "src")
                os.makedirs(extract_dir, exist_ok=True)
                with _tarfile.open(latex_path, "r:*") as tf:
                    _safe_extractall(tf, extract_dir)
                # Collect all .tex files (up to 200 KB total to keep prompt sane)
                tex_parts: list[str] = []
                total = 0
                for root, _, files in os.walk(extract_dir):
                    for fname in sorted(files):
                        if fname.endswith(".tex"):
                            fpath = os.path.join(root, fname)
                            try:
                                with open(fpath, encoding="utf-8", errors="replace") as fh:
                                    content = fh.read(200_000 - total)
                                    tex_parts.append(content)
                                    total += len(content)
                                    if total >= 200_000:
                                        break
                            except Exception:
                                pass
                    if total >= 200_000:
                        break
                raw_source_text = "\n\n".join(tex_parts) if tex_parts else None
            except Exception as e:
                print(f"Warning: could not extract LaTeX for LLM context: {e}")

        # Parse with parser_v2
        send_status(callback_url, secret, arxiv_id,
                    status="narrating",
                    progress_detail="Parsing source...",
                    version_id=version_id)
        from parser_v2 import parse_paper  # noqa: PLC0415
        import re
        speech = parse_paper(
            source_path=source_path,
            source_priority=source_priority,
            fallback_title=paper_title,
            fallback_authors=authors_list,
            fallback_date=paper_date,
            pdf_path=pdf_local_path,
        )
        print(f"Free-tier script: {len(speech):,} chars")

        # Strip version tag before passing to LLM / TTS
        tts_text = re.sub(r"\n\n%%%+ .+ %%%+\s*$", "", speech)

        # ---------------------------------------------------------------
        # Stage 3: LLM script improvement
        # ---------------------------------------------------------------
        llm_result = None
        if llm_api_key:
            send_status(callback_url, secret, arxiv_id,
                        status="narrating",
                        progress_detail="Improving script with LLM...",
                        eta_seconds=120,  # rough: 30s LLM + rest for TTS
                        version_id=version_id)
            has_latex = raw_source_text and ("\\section" in raw_source_text or "\\begin{document}" in raw_source_text)
            print(f"Running LLM script generation ({llm_provider}, {'from LaTeX' if has_latex else 'from free-tier script'})...")
            provider = get_llm_provider(llm_provider, llm_api_key)
            llm_result = provider.improve_script(tts_text, raw_source=raw_source_text)
            tts_text = llm_result.improved_script
            print(
                f"LLM done: {llm_result.input_tokens} in / {llm_result.output_tokens} out "
                f"tokens, ${llm_result.cost_usd:.4f}"
            )
        else:
            print("No LLM api_key provided — skipping LLM improvement")

        # Save improved (or base) script to R2 immediately so partial success
        # can preserve it even if TTS subsequently fails.
        transcript_local = os.path.join(work_dir, f"{arxiv_id}-v{version_id}-transcript.txt")
        with open(transcript_local, "w") as f:
            f.write(tts_text)
        print(f"Uploading improved transcript to R2: {transcript_r2_key}")
        upload_to_r2(transcript_local, transcript_r2_key, content_type="text/plain; charset=utf-8")

        # ---------------------------------------------------------------
        # Stage 4: Premium TTS synthesis
        # ---------------------------------------------------------------
        chunks_count = len(tex_to_audio._split_into_chunks(tts_text))
        EST_SECS_PER_CHUNK = 3 if tts_provider != "free" else 5
        tts_eta = chunks_count * EST_SECS_PER_CHUNK
        send_status(callback_url, secret, arxiv_id,
                    status="narrating",
                    progress_detail=f"Synthesising audio ({tts_provider})...",
                    eta_seconds=tts_eta,
                    version_id=version_id)

        try:
            print(f"Running TTS ({tts_provider})...")
            tts_provider_obj = get_tts_provider(tts_provider, api_key=tts_api_key or None)
            tts_result = tts_provider_obj.synthesize(tts_text)
            print(
                f"TTS done: {tts_result.char_count:,} chars, "
                f"{tts_result.duration_seconds:.0f}s audio, ${tts_result.cost_usd:.4f}"
            )
        except Exception as tts_err:
            # Partial success: script is saved, audio failed
            print(f"TTS failed ({tts_err}) — reporting partial success (script saved)")
            llm_cost = llm_result.cost_usd if llm_result else 0.0
            send_status(
                callback_url, secret, arxiv_id,
                status="script_ready",
                version_id=version_id,
                script_r2_key=transcript_r2_key,
                error_message=f"TTS failed: {str(tts_err)[:300]}",
                costs={
                    "llm_input_tokens": llm_result.input_tokens if llm_result else 0,
                    "llm_output_tokens": llm_result.output_tokens if llm_result else 0,
                    "llm_cost_usd": llm_cost,
                    "tts_cost_usd": 0.0,
                    "total_cost_usd": llm_cost,
                },
                providers={
                    "llm": llm_provider if llm_result else None,
                    "llm_model": llm_result.model if llm_result else None,
                    "tts": tts_provider,
                },
                quality_rank=max(quality_rank - 2, 1),  # penalise for missing audio
            )
            return

        # ---------------------------------------------------------------
        # Stage 5: Upload audio to R2
        # ---------------------------------------------------------------
        audio_local = os.path.join(work_dir, f"{arxiv_id}-v{version_id}.mp3")
        with open(audio_local, "wb") as f:
            f.write(tts_result.audio_bytes)

        # Tag the MP3
        tex_to_audio.tag_mp3(
            audio_local,
            title=paper_title or "Untitled",
            author=paper_author or "Unknown",
            arxiv_id=arxiv_id,
        )

        file_size = os.path.getsize(audio_local)
        print(f"Uploading audio to R2: {audio_r2_key} ({file_size / (1024*1024):.1f} MB)")
        upload_to_r2(audio_local, audio_r2_key)

        # ---------------------------------------------------------------
        # Stage 6: Done — report with full cost + version metadata
        # ---------------------------------------------------------------
        llm_cost = llm_result.cost_usd if llm_result else 0.0
        total_cost = llm_cost + tts_result.cost_usd
        send_status(
            callback_url, secret, arxiv_id,
            status="narrated",
            eta_seconds=0,
            version_id=version_id,
            audio_r2_key=audio_r2_key,
            script_r2_key=transcript_r2_key,
            audio_size_bytes=file_size,
            duration_seconds=int(tts_result.duration_seconds),
            quality_rank=quality_rank,
            providers={
                "llm": llm_provider if llm_result else None,
                "llm_model": llm_result.model if llm_result else None,
                "tts": tts_result.provider,
                "tts_voice": tts_result.voice,
            },
            costs={
                "llm_input_tokens": llm_result.input_tokens if llm_result else 0,
                "llm_output_tokens": llm_result.output_tokens if llm_result else 0,
                "llm_cost_usd": llm_cost,
                "tts_char_count": tts_result.char_count,
                "tts_cost_usd": tts_result.cost_usd,
                "total_cost_usd": round(total_cost, 6),
            },
        )
        print(f"Premium narration done: {arxiv_id} (v{version_id}), total cost ${total_cost:.4f}")

    except Exception as e:
        print(f"Error in premium narration for {arxiv_id}: {e}")
        send_status(
            callback_url, secret, arxiv_id,
            status="failed",
            version_id=version_id,
            error_message=str(e)[:500],
        )
        raise


@app.function(
    image=premium_image,
    secrets=[modal.Secret.from_name("unarxiv-secrets")],
    timeout=60,
)
@modal.fastapi_endpoint(method="POST")
def trigger_premium_narration(request: dict):
    """HTTP endpoint called by the Cloudflare Worker to start a premium narration.

    The request body must contain:
      - _secret        : shared secret (equals CALLBACK_SECRET / MODAL_WEBHOOK_SECRET)
      - arxiv_id       : arXiv paper ID
      - callback_url   : Worker webhook URL (must be https://api.unarxiv.org/*)
      - tex_source_url : URL of the arXiv LaTeX/source archive
      - llm_provider   : "anthropic" | "openai" | "gemini"
      - llm_api_key    : API key for the LLM provider (never logged)
      - tts_provider   : "elevenlabs" | "openai" | "google" | "polly" | "azure" | "free"
      - tts_api_key    : API key / credential for the TTS provider (not required for "free")

    Optional:
      - paper_title, paper_author, paper_date : metadata passed to the parser
      - source_priority : "latex" (default) | "pdf"
      - version_id      : caller-generated version identifier; auto-generated if omitted
    """
    from fastapi import HTTPException  # noqa: PLC0415

    callback_secret = os.environ.get("CALLBACK_SECRET", "")
    if not callback_secret or request.get("_secret") != callback_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")

    arxiv_id = request.get("arxiv_id")
    tex_source_url = request.get("tex_source_url")
    callback_url = request.get("callback_url")

    if not all([arxiv_id, callback_url, tex_source_url]):
        return {"error": "arxiv_id, tex_source_url, and callback_url are required"}

    # Allowlist callback_url to prevent SSRF / credential exfiltration.
    if not callback_url.startswith("https://api.unarxiv.org/"):
        raise HTTPException(status_code=400, detail="Invalid callback_url")

    llm_provider = request.get("llm_provider", "anthropic")
    llm_api_key = request.get("llm_api_key", "")
    tts_provider = request.get("tts_provider", "elevenlabs")
    tts_api_key = request.get("tts_api_key", "")

    if llm_provider not in ("anthropic", "openai", "gemini"):
        return {"error": f"Unknown llm_provider: {llm_provider!r}"}
    if tts_provider not in ("elevenlabs", "openai", "google", "polly", "azure", "free"):
        return {"error": f"Unknown tts_provider: {tts_provider!r}"}
    if tts_provider != "free" and not tts_api_key:
        return {"error": f"tts_api_key is required for tts_provider={tts_provider!r}"}

    source_priority = request.get("source_priority", "latex")
    if source_priority not in ("latex", "pdf"):
        source_priority = "latex"

    version_id = request.get("version_id", "")

    narrate_paper_premium.spawn(
        arxiv_id=arxiv_id,
        tex_source_url=tex_source_url,
        callback_url=callback_url,
        paper_title=request.get("paper_title", ""),
        paper_author=request.get("paper_author", ""),
        paper_date=request.get("paper_date", ""),
        source_priority=source_priority,
        llm_provider=llm_provider,
        llm_api_key=llm_api_key,
        tts_provider=tts_provider,
        tts_api_key=tts_api_key,
        version_id=version_id,
    )

    return {
        "status": "dispatched",
        "arxiv_id": arxiv_id,
        "llm_provider": llm_provider,
        "tts_provider": tts_provider,
        "source_priority": source_priority,
        "version_id": version_id or "(auto)",
    }
