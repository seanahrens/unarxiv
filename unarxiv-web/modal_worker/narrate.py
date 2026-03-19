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
    .add_local_file("tex_to_audio_legacy.py", "/app/tex_to_audio_legacy.py")
    # Active parser_v2 modules
    .add_local_file("tex_to_audio.py", "/app/tex_to_audio.py")
    .add_local_dir("parser_v2", "/app/parser_v2", ignore=["test_data/*", "__pycache__/*"])
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
def narrate_paper(arxiv_id: str, tex_source_url: str, callback_url: str, paper_title: str = "", paper_author: str = "", mode: str = "full", source_priority: str = "latex"):
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
            send_status(callback_url, secret, arxiv_id, status="preparing",
                        progress_detail="Downloading existing transcript...")
            print(f"Downloading existing transcript for {arxiv_id}...")
            speech = _download_from_r2(f"transcripts/{arxiv_id}.txt")
            if not speech:
                raise RuntimeError(f"No transcript found in R2 for {arxiv_id}")
            print(f"Loaded transcript: {len(speech):,} chars")
        else:
            # --- Stage 1: Download, extract, process source ---
            send_status(callback_url, secret, arxiv_id, status="preparing")

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
                    fallback_date="",  # arXiv date inserted by worker at query time
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
                    date="",
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
                status="complete",
                progress_detail="Script regenerated",
            )
            print(f"Script-only done: {arxiv_id}")
            return

        # --- Generate audio (full + narration_only modes) ---
        # Strip the version tag before TTS — it's for the transcript only
        import re
        tts_text = re.sub(r"\n\n%%%%%% .+ %%%%%%\s*$", "", speech)
        chunks = tex_to_audio._split_into_chunks(tts_text)
        total_chunks = len(chunks)
        print(f"Generating audio... ({total_chunks} chunks)")

        # Send initial status with estimated ETA (~5s per chunk for edge-tts)
        EST_SECS_PER_CHUNK = 5
        initial_eta = total_chunks * EST_SECS_PER_CHUNK
        send_status(
            callback_url, secret, arxiv_id,
            status="generating_audio",
            progress_detail=f"eta:{initial_eta}",
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
                status="generating_audio",
                progress_detail=f"eta:{remaining_secs}",
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
            status="complete",
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
    arxiv_id = request.get("arxiv_id")
    tex_source_url = request.get("tex_source_url")
    callback_url = request.get("callback_url")
    paper_title = request.get("paper_title", "")
    paper_author = request.get("paper_author", "")
    mode = request.get("mode", "full")
    source_priority = request.get("source_priority", "latex")
    if source_priority not in ("latex", "pdf"):
        source_priority = "latex"

    if not all([arxiv_id, callback_url]):
        return {"error": "arxiv_id and callback_url required"}
    if mode != "narration_only" and not tex_source_url:
        return {"error": "tex_source_url required for this mode"}

    # Spawn the narration as an async job
    narrate_paper.spawn(arxiv_id, tex_source_url or "", callback_url, paper_title, paper_author, mode, source_priority)

    return {"status": "dispatched", "arxiv_id": arxiv_id, "mode": mode, "source_priority": source_priority}
