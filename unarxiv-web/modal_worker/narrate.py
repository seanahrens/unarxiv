"""
unarXiv Modal Worker — Narrates arXiv papers and uploads MP3s to R2.

Deploy: modal deploy narrate.py

Scripter versions:
  - regex_scripter (default): Modular next-gen scripter with better math, citation,
    and formatting handling. Always uses arXiv-scraped metadata.
  - legacy_regex_scripter: Original monolithic scripter, kept for A/B comparison.
    Set SCRIPTER_VERSION=legacy to use it.
"""

import modal
import os
import tempfile
import tarfile
import time
import uuid


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
    # Legacy scripter (kept for A/B switching via SCRIPTER_VERSION=legacy)
    .add_local_file("legacy_regex_scripter.py", "/app/legacy_regex_scripter.py", copy=True)
    # Active regex_scripter modules
    .add_local_file("tts_utils.py", "/app/tts_utils.py", copy=True)
    .add_local_file("source_download.py", "/app/source_download.py", copy=True)
    .add_local_file("r2paths.py", "/app/r2paths.py", copy=True)
    .add_local_dir("regex_scripter", "/app/regex_scripter", copy=True, ignore=["test_data/*", "__pycache__/*"])
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
        "Pillow>=10.0",
    )
    .add_local_file("llm_scripter.py", "/app/llm_scripter.py", copy=True)
    .add_local_file("llm_providers.py", "/app/llm_providers.py", copy=True)
    .add_local_file("figure_utils.py", "/app/figure_utils.py", copy=True)
    .add_local_file("latex_post_process.py", "/app/latex_post_process.py", copy=True)
    .add_local_file("premium_tts.py", "/app/premium_tts.py", copy=True)
    .add_local_dir("hybrid_scripter", "/app/hybrid_scripter", copy=True, ignore=["__pycache__/*"])
)

# Modal secret: "unarxiv-secrets" (legacy name — renaming requires recreating in Modal)
# Required keys:
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
#   CALLBACK_SECRET (shared with Worker's MODAL_WEBHOOK_SECRET)
# Optional:
#   SCRIPTER_VERSION: "v2" (default) or "legacy"
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
    """Check if the legacy scripter should be used instead of regex_scripter."""
    return os.environ.get("SCRIPTER_VERSION", "v2").lower() == "legacy"


def _categorize_error(exc: Exception, stage: str = "unknown") -> str:
    """Map an exception to a structured error category.

    Categories: source_download, parsing, llm, rate_limit, image_processing,
    tts, upload, timeout, unknown.
    """
    msg = str(exc).lower()

    # Rate limit errors from LLM/TTS providers
    if "429" in msg or "rate limit" in msg or "rate_limit" in msg or "too many requests" in msg:
        return "rate_limit"

    # Image processing errors (e.g. PIL dimension issues)
    if "image" in msg and ("decompression" in msg or "dimension" in msg or "pixel" in msg or "exceed" in msg):
        return "image_processing"

    # Timeout
    if isinstance(exc, TimeoutError) or "timeout" in msg or "timed out" in msg:
        return "timeout"

    # Fall back to the stage if known
    return stage


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

    # tts_utils is always loaded for TTS utilities (chunking, voice, tagging)
    import tts_utils
    import httpx

    use_legacy = _use_legacy_parser()
    parser_label = "legacy" if use_legacy else "v2"
    print(f"Using parser: {parser_label}")

    if use_legacy:
        import legacy_regex_scripter as legacy_parser

    secret = os.environ.get("CALLBACK_SECRET", "")

    work_dir = tempfile.mkdtemp()
    tar_path = os.path.join(work_dir, f"{arxiv_id}.tar.gz")
    source_dir = os.path.join(work_dir, "source")
    output_path = os.path.join(work_dir, f"{arxiv_id}.mp3")

    try:
        speech = None
        _source_stats: dict = {}  # populated below when using regex_scripter
        _stage = "source_download"  # track current pipeline stage for error categorization

        if mode == "narration_only":
            # --- Download existing transcript from R2 ---
            send_status(callback_url, secret, arxiv_id, status="narrating",
                        progress_detail="Downloading existing transcript...")
            print(f"Downloading existing transcript for {arxiv_id}...")
            from r2paths import legacy_base_transcript_key
            speech = _download_from_r2(legacy_base_transcript_key(arxiv_id))
            if not speech:
                raise RuntimeError(f"No transcript found in R2 for {arxiv_id}")
            print(f"Loaded transcript: {len(speech):,} chars")
        else:
            # --- Stage 1: Download, extract, process source ---
            from r2paths import versioned_audio_key, versioned_transcript_key
            version_id = uuid.uuid4().hex[:12]
            send_status(callback_url, secret, arxiv_id, status="narrating")

            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"
            authors_list = [a.strip() for a in paper_author.split(",")] if paper_author else []

            def _download(url: str) -> httpx.Response:
                with httpx.Client(timeout=120, follow_redirects=True) as client:
                    r = client.get(url, headers={"User-Agent": "unarXiv/1.0"})
                    r.raise_for_status()
                    return r

            # ---------------------------------------------------------------
            # regex_scripter processing functions
            # ---------------------------------------------------------------

            def _save_source(data: bytes, filename: str) -> str:
                """Write source bytes to work_dir and return the path."""
                path = os.path.join(work_dir, filename)
                with open(path, "wb") as f:
                    f.write(data)
                return path

            def _process_v2(source_path: str, pdf_path: str | None = None) -> str:
                """Route to regex_scripter with arXiv metadata."""
                from regex_scripter import generate_script
                return generate_script(
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
                        if tts_utils.is_pdf_file(tar_path):
                            speech = _process_legacy_pdf(resp.content)
                        else:
                            speech = _process_legacy_latex(resp.content, resp.headers.get("content-type", ""))
                else:
                    print(f"Source priority: LaTeX. Downloading {tex_source_url}...")
                    resp = _download(tex_source_url)
                    print(f"Downloaded {len(resp.content)} bytes")
                    with open(tar_path, "wb") as f:
                        f.write(resp.content)
                    if tts_utils.is_pdf_file(tar_path):
                        print("Source is a PDF (no LaTeX available). Using PDF pipeline...")
                        speech = _process_legacy_pdf(resp.content)
                    else:
                        speech = _process_legacy_latex(resp.content, resp.headers.get("content-type", ""))
            else:
                # ---- regex_scripter path (default) ----
                from source_download import download_and_parse
                parsed = download_and_parse(
                    arxiv_id=arxiv_id,
                    tex_source_url=tex_source_url,
                    paper_title=paper_title,
                    paper_author=paper_author,
                    paper_date=paper_date,
                    source_priority=source_priority,
                )
                speech = parsed.speech_text
                _source_stats = dict(
                    tar_bytes=parsed.tar_bytes,
                    latex_char_count=parsed.latex_char_count,
                    figure_count=parsed.figure_count,
                )

            _stage = "parsing"
            print(f"Generated speech text ({parser_label}): {len(speech):,} chars")

            # Save transcript to R2
            transcript_path = os.path.join(work_dir, f"{arxiv_id}-transcript.txt")
            with open(transcript_path, "w") as f:
                f.write(speech)
            transcript_r2_key = versioned_transcript_key(arxiv_id, version_id)
            print(f"Uploading transcript to R2: {transcript_r2_key}")
            upload_to_r2(transcript_path, transcript_r2_key, content_type="text/plain; charset=utf-8")

        # --- Script-only mode: done after transcript ---
        if mode == "script_only":
            send_status(
                callback_url, secret, arxiv_id,
                status="narrated",
                progress_detail="Script regenerated",
                narration_tier="base",
                transcript_r2_key=transcript_r2_key,
                version_id=version_id,
            )
            print(f"Script-only done: {arxiv_id}")
            return

        # --- Generate audio (full + narration_only modes) ---
        _stage = "tts"
        # Strip the version tag before TTS — it's for the transcript only
        import re
        tts_text = re.sub(r"\n\n%%%+ .+ %%%+\s*$", "", speech)
        chunks = tts_utils._split_into_chunks(tts_text)
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
            tts_utils._tts_chunk(chunk, chunk_path, tts_utils.DEFAULT_VOICE)
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
        tts_utils.tag_mp3(output_path, title=tag_title, author=tag_author, arxiv_id=arxiv_id)

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
        _stage = "upload"
        r2_key = versioned_audio_key(arxiv_id, version_id)
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
            narration_tier="base",
            transcript_r2_key=transcript_r2_key,
            version_id=version_id,
            script_char_count=len(tts_text),
            **_source_stats,
        )
        print(f"Done: {arxiv_id}")

    except Exception as e:
        error_category = _categorize_error(e, _stage)
        print(f"Error processing {arxiv_id} (stage={_stage}, category={error_category}): {e}")
        send_status(
            callback_url, secret, arxiv_id,
            status="failed",
            error_message=str(e)[:500],
            error_category=error_category,
            narration_tier="base",
        )
        raise
    finally:
        import shutil
        shutil.rmtree(work_dir, ignore_errors=True)


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
    max_containers=4,  # max simultaneous LLM narrations; extras queue automatically
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
    llm_model: str = "",
    tts_provider: str = "elevenlabs",
    tts_api_key: str = "",
    version_id: str = "",
    existing_script: str = "",
    scripter_mode: str = "llm",
):
    """Premium narration pipeline: source → LLM script improvement → premium TTS → R2.

    scripter_mode: "llm" (default) = full LLM rewrite of all content
                   "hybrid"        = regex for prose + targeted LLM for figures/math/tables

    Pipeline:
      1. Download arXiv source (LaTeX-first or PDF-first per source_priority)
      2. Parse with regex_scripter to produce the free-tier script
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

    import tts_utils
    from llm_providers import get_provider
    from llm_scripter import generate_script as llm_generate_script
    from premium_tts import get_tts_provider, PROVIDER_CONFIGS
    from regex_scripter.script_builder import _build_header, _build_footer, _format_date
    from source_download import download_and_parse
    import re

    secret = os.environ.get("CALLBACK_SECRET", "")

    if not version_id:
        version_id = uuid.uuid4().hex[:12]

    # Resolve the narration tier from the TTS provider
    _PROVIDER_TO_TIER = {"elevenlabs": "plus3", "openai": "plus2"}
    narration_tier = _PROVIDER_TO_TIER.get(tts_provider, "plus1")

    # Versioned R2 keys
    audio_r2_key = f"audio/{arxiv_id}/v{version_id}.mp3"
    transcript_r2_key = f"transcripts/{arxiv_id}/v{version_id}.txt"

    parsed = None  # initialised here so the finally block can always reference it
    _stage = "source_download"  # track current pipeline stage for error categorization
    try:
        # ---------------------------------------------------------------
        # Stage 1: Send initial status
        # ---------------------------------------------------------------
        send_status(callback_url, secret, arxiv_id,
                    status="narrating",
                    progress_detail="Downloading source...",
                    version_id=version_id)

        # ---------------------------------------------------------------
        # Stage 2: Download + parse source with regex_scripter
        # ---------------------------------------------------------------
        _stage = "parsing"
        send_status(callback_url, secret, arxiv_id,
                    status="narrating",
                    progress_detail="Parsing source...",
                    version_id=version_id)

        parsed = download_and_parse(
            arxiv_id=arxiv_id,
            tex_source_url=tex_source_url,
            paper_title=paper_title,
            paper_author=paper_author,
            paper_date=paper_date,
            source_priority=source_priority,
            extract_raw_source=True,  # needed for LLM context
        )
        speech = parsed.speech_text
        raw_source_text = parsed.raw_source_text
        work_dir = parsed.work_dir

        # Use parser-extracted title as fallback when caller didn't pass one
        if not paper_title and parsed.extracted_title:
            paper_title = parsed.extracted_title
            print(f"Using parser-extracted title: {paper_title}")
        print(f"Free-tier script: {len(speech):,} chars")

        # Strip version tag before passing to LLM / TTS
        tts_text = re.sub(r"\n\n%%%+ .+ %%%+\s*$", "", speech)

        # ---------------------------------------------------------------
        # Stage 3: LLM script improvement (skipped if existing_script provided)
        # ---------------------------------------------------------------
        _stage = "llm"
        # Estimate total remaining time: LLM + TTS
        # Use the provider's chunk config for accurate estimates
        provider_cfg = PROVIDER_CONFIGS.get(tts_provider, PROVIDER_CONFIGS["free"])
        tts_secs_per_chunk = provider_cfg.secs_per_chunk
        chunks_est = len(tts_utils._split_into_chunks(tts_text))
        tts_time_est = chunks_est * tts_secs_per_chunk

        llm_result = None
        if existing_script:
            print(f"Reusing existing LLM script ({len(existing_script):,} chars) — skipping LLM generation")
            tts_text = existing_script
            # Send ETA for TTS-only since LLM is skipped
            send_status(callback_url, secret, arxiv_id,
                        status="narrating",
                        progress_detail="Script ready, synthesising audio...",
                        eta_seconds=tts_time_est,
                        version_id=version_id)
        else:
            # Resolve API key: caller-supplied key takes priority; fall back to
            # provider-specific env var stored in the Modal "unarxiv-secrets" secret.
            resolved_llm_key = llm_api_key or os.environ.get(
                f"{llm_provider.upper()}_API_KEY", ""
            )
            if resolved_llm_key:
                # Model resolution: explicit param from caller → provider class default
                resolved_model = llm_model or None
                provider = get_provider(llm_provider, resolved_llm_key, model=resolved_model)

                if scripter_mode == "hybrid":
                    # Hybrid mode: regex for prose + targeted LLM for figures/math/tables
                    # Much faster and cheaper than full LLM rewrite
                    llm_time_est = max(10, int(len(tts_text) / 4 / 60 * 0.2))  # ~20% of full LLM time
                    total_est = llm_time_est + tts_time_est
                    send_status(callback_url, secret, arxiv_id,
                                status="narrating",
                                progress_detail="Hybrid scripting (regex + targeted LLM)...",
                                eta_seconds=total_est,
                                version_id=version_id)
                    print(f"Running hybrid script generation ({llm_provider}/{resolved_model or 'default'})...")
                    from hybrid_scripter import generate_script as hybrid_generate_script
                    llm_result = hybrid_generate_script(
                        provider=provider,
                        source_path=parsed.source_path or "",
                        fallback_title=paper_title,
                        fallback_authors=[a.strip() for a in paper_author.split(",") if a.strip()] if paper_author else [],
                        fallback_date=paper_date,
                        figures_dir=parsed.figures_dir,
                        raw_source=raw_source_text,
                    )
                    tts_text = llm_result.improved_script
                else:
                    # Full LLM mode: send entire paper through LLM
                    has_latex = raw_source_text and ("\\section" in raw_source_text or "\\begin{document}" in raw_source_text)
                    llm_output_tokens_est = len(tts_text) / 4
                    llm_time_est = max(20, int(llm_output_tokens_est / 60))
                    total_est = llm_time_est + tts_time_est
                    send_status(callback_url, secret, arxiv_id,
                                status="narrating",
                                progress_detail="Improving script with LLM...",
                                eta_seconds=total_est,
                                version_id=version_id)
                    print(f"Running LLM script generation ({llm_provider}/{resolved_model or 'default'}, {'from LaTeX' if has_latex else 'from free-tier script'})...")
                    llm_result = llm_generate_script(provider, raw_source_text, fallback_script=tts_text, figures_dir=parsed.figures_dir)
                    tts_text = llm_result.improved_script

                print(
                    f"{'Hybrid' if scripter_mode == 'hybrid' else 'LLM'} done: "
                    f"{llm_result.input_tokens} in / {llm_result.output_tokens} out "
                    f"tokens, ${llm_result.cost_usd:.4f}"
                )
            else:
                print(f"No API key for {llm_provider} (checked llm_api_key and {llm_provider.upper()}_API_KEY env var) — skipping LLM improvement")

        # Wrap with standard header/footer only when the LLM ran and produced
        # body-only output.  The free-tier programmatic script (parsed.speech_text)
        # and any existing_script transcript already contain header+footer, so
        # re-wrapping them would produce double titles and double sign-offs.
        authors_list_parsed = [a.strip() for a in paper_author.split(",") if a.strip()] if paper_author else []
        formatted_date = _format_date(paper_date)
        header = _build_header(paper_title or "Untitled", formatted_date, authors_list_parsed)
        footer = _build_footer(paper_title or "Untitled", formatted_date, authors_list_parsed)
        if llm_result is not None and scripter_mode != "hybrid":
            # LLM generated fresh body-only content — wrap it now.
            # Hybrid scripter already includes header/footer via build_script.
            # Defensively strip footer in case the fallback-script path let it through.
            body = tts_text.strip()
            if body.endswith(footer.strip()):
                body = body[: -len(footer.strip())].strip()
            tts_text = header + "\n" + body + footer
        # else: tts_text already has header+footer (free-tier script or existing_script)

        # Save improved (or base) script to R2 immediately so partial success
        # can preserve it even if TTS subsequently fails.
        transcript_local = os.path.join(work_dir, f"{arxiv_id}-v{version_id}-transcript.txt")
        with open(transcript_local, "w") as f:
            f.write(tts_text)
        print(f"Uploading improved transcript to R2: {transcript_r2_key}")
        upload_to_r2(transcript_local, transcript_r2_key, content_type="text/plain; charset=utf-8")

        # Notify Worker that the script is ready — creates a partial
        # narration_version so the frontend can show the script tab
        # while TTS is still running.
        send_status(callback_url, secret, arxiv_id,
                    status="script_ready",
                    narration_tier=narration_tier,
                    version_id=version_id,
                    transcript_r2_key=transcript_r2_key,
                    script_char_count=len(tts_text),
                    tts_provider=tts_provider,
                    llm_provider=llm_provider if llm_result else None,
                    llm_model=llm_result.model if llm_result else None,
                    llm_cost=llm_result.cost_usd if llm_result else 0.0,
                    # Track 1: source stats
                    tar_bytes=parsed.tar_bytes,
                    latex_char_count=parsed.latex_char_count,
                    figure_count=parsed.figure_count,
                    # Track 2: actual LLM token usage
                    actual_input_tokens=llm_result.input_tokens if llm_result else 0,
                    actual_output_tokens=llm_result.output_tokens if llm_result else 0,
                    provider_model=f"{llm_result.provider}:{llm_result.model}" if llm_result else None)

        # ---------------------------------------------------------------
        # Stage 4: Premium TTS synthesis
        # ---------------------------------------------------------------
        _stage = "tts"
        final_chunks_count = len(tts_utils._split_into_chunks(tts_text))
        final_tts_eta = final_chunks_count * tts_secs_per_chunk
        send_status(callback_url, secret, arxiv_id,
                    status="narrating",
                    progress_detail=f"Synthesising audio ({tts_provider})...",
                    eta_seconds=final_tts_eta,
                    version_id=version_id)

        def _on_tts_chunk(done: int, total: int, elapsed: float) -> None:
            """Report per-chunk ETA updates during TTS synthesis."""
            remaining = total - done
            if done > 0 and remaining > 0:
                secs_per_chunk = elapsed / done
                eta = int(secs_per_chunk * remaining)
                send_status(callback_url, secret, arxiv_id,
                            status="narrating",
                            eta_seconds=eta,
                            version_id=version_id)

        try:
            print(f"Running TTS ({tts_provider})...")
            tts_provider_obj = get_tts_provider(tts_provider, api_key=tts_api_key or None)
            tts_result = tts_provider_obj.synthesize(tts_text, on_chunk_done=_on_tts_chunk)
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
                narration_tier=narration_tier,
                version_id=version_id,
                transcript_r2_key=transcript_r2_key,
                error_message=f"TTS failed: {str(tts_err)[:300]}",
                # Flat provider metadata
                tts_provider=tts_provider,
                llm_provider=llm_provider if llm_result else None,
                llm_model=llm_result.model if llm_result else None,
                # Flat cost breakdown
                actual_cost=llm_cost,
                llm_cost=llm_cost,
                tts_cost=0.0,
                # Track 1+2
                tar_bytes=parsed.tar_bytes,
                latex_char_count=parsed.latex_char_count,
                figure_count=parsed.figure_count,
                actual_input_tokens=llm_result.input_tokens if llm_result else 0,
                actual_output_tokens=llm_result.output_tokens if llm_result else 0,
                provider_model=f"{llm_result.provider}:{llm_result.model}" if llm_result else None,
            )
            return

        # ---------------------------------------------------------------
        # Stage 5: Upload audio to R2
        # ---------------------------------------------------------------
        _stage = "upload"
        audio_local = os.path.join(work_dir, f"{arxiv_id}-v{version_id}.mp3")
        with open(audio_local, "wb") as f:
            f.write(tts_result.audio_bytes)

        # Tag the MP3
        tts_utils.tag_mp3(
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
            narration_tier=narration_tier,
            version_id=version_id,
            audio_r2_key=audio_r2_key,
            transcript_r2_key=transcript_r2_key,
            audio_size_bytes=file_size,
            duration_seconds=int(tts_result.duration_seconds),
            # Flat provider metadata (Worker computes quality_rank from these)
            tts_provider=tts_result.provider,
            tts_model=tts_result.voice,
            llm_provider=llm_provider if llm_result else None,
            llm_model=llm_result.model if llm_result else None,
            # Flat cost breakdown
            actual_cost=round(total_cost, 6),
            llm_cost=llm_cost,
            tts_cost=tts_result.cost_usd,
            tts_char_count=tts_result.char_count,
            script_char_count=len(tts_text),
            # Track 1: source stats for cost estimation
            tar_bytes=parsed.tar_bytes,
            latex_char_count=parsed.latex_char_count,
            figure_count=parsed.figure_count,
            # Track 2: actual LLM token usage for ML model training
            actual_input_tokens=llm_result.input_tokens if llm_result else 0,
            actual_output_tokens=llm_result.output_tokens if llm_result else 0,
            provider_model=f"{llm_result.provider}:{llm_result.model}" if llm_result else None,
        )
        print(f"Premium narration done: {arxiv_id} (v{version_id}), total cost ${total_cost:.4f}")

    except Exception as e:
        error_category = _categorize_error(e, _stage)
        print(f"Error in premium narration for {arxiv_id} (stage={_stage}, category={error_category}): {e}")
        send_status(
            callback_url, secret, arxiv_id,
            status="failed",
            narration_tier=narration_tier,
            version_id=version_id,
            error_message=str(e)[:500],
            error_category=error_category,
        )
        raise
    finally:
        import shutil
        if parsed is not None:
            shutil.rmtree(parsed.work_dir, ignore_errors=True)


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
    llm_model = request.get("llm_model", "")
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

    scripter_mode = request.get("scripter_mode", "llm")
    if scripter_mode not in ("llm", "hybrid"):
        scripter_mode = "llm"

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
        llm_model=llm_model,
        tts_provider=tts_provider,
        tts_api_key=tts_api_key,
        version_id=version_id,
        existing_script=request.get("existing_script", ""),
        scripter_mode=scripter_mode,
    )

    return {
        "status": "dispatched",
        "arxiv_id": arxiv_id,
        "llm_provider": llm_provider,
        "tts_provider": tts_provider,
        "source_priority": source_priority,
        "version_id": version_id or "(auto)",
    }


# ---------------------------------------------------------------------------
# Cost model training — runs weekly on Modal
# ---------------------------------------------------------------------------

# The training image only needs scikit-learn + numpy (no TTS/LLM deps needed)
_training_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("scikit-learn>=1.4", "numpy>=1.26")
    # Include the training script so it can be imported/run directly
    .add_local_file(
        os.path.join(os.path.dirname(__file__), "../../evals/cost_model/train.py"),
        "/app/train.py",
        copy=True,
    )
)


@app.function(
    image=_training_image,
    secrets=[modal.Secret.from_name("unarxiv-secrets")],
    schedule=modal.Cron("0 9 * * 1"),  # Every Monday at 9am UTC
    timeout=300,
    retries=2,
)
def train_cost_model():
    """Weekly cost model training: fetches narration data from D1, trains
    per-provider linear regression models, and deploys coefficients to the
    Worker API if they beat the current proxy formula.

    Requires UNARXIV_ADMIN_PASSWORD in the unarxiv-secrets Modal secret.
    """
    import subprocess
    import sys

    admin_password = os.environ.get("UNARXIV_ADMIN_PASSWORD", "")
    if not admin_password:
        print("WARNING: UNARXIV_ADMIN_PASSWORD not set in unarxiv-secrets — skipping training")
        return

    result = subprocess.run(
        [sys.executable, "/app/train.py", "--deploy"],
        capture_output=False,  # let stdout/stderr flow to Modal logs
        env={**os.environ, "UNARXIV_ADMIN_PASSWORD": admin_password},
    )
    if result.returncode != 0:
        raise RuntimeError(f"train.py exited with code {result.returncode}")
