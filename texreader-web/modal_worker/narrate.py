"""
TexReader Modal Worker — Narrates arXiv papers and uploads MP3s to R2.

Deploy: modal deploy narrate.py
"""

import modal
import os
import tempfile
import tarfile

app = modal.App("texreader-worker")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("edge-tts>=6.1.0", "mutagen>=1.47.0", "httpx>=0.27.0", "boto3>=1.34.0", "fastapi[standard]")
    .run_commands("python -c 'import edge_tts; print(edge_tts.__version__)'")  # verify edge-tts installed
    .add_local_file("tex_to_audio.py", "/app/tex_to_audio.py")
)

# Secrets: set via `modal secret create texreader-secrets ...`
# Required keys:
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
#   CALLBACK_SECRET (shared with Worker's MODAL_WEBHOOK_SECRET)


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


def upload_to_r2(local_path: str, r2_key: str, content_type: str = "audio/mpeg") -> int:
    """Upload a file to Cloudflare R2 via S3 API. Returns file size in bytes."""
    import boto3

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )

    file_size = os.path.getsize(local_path)
    s3.upload_file(
        local_path,
        os.environ["R2_BUCKET_NAME"],
        r2_key,
        ExtraArgs={"ContentType": content_type},
    )
    return file_size


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("texreader-secrets")],
    timeout=3600,  # 1 hour max per paper
    retries=0,
)
def narrate_paper(arxiv_id: str, tex_source_url: str, callback_url: str, paper_title: str = "", paper_author: str = ""):
    """Download, process, and narrate an arXiv paper."""
    import sys
    sys.path.insert(0, "/app")
    import tex_to_audio
    import httpx

    secret = os.environ.get("CALLBACK_SECRET", "")

    work_dir = tempfile.mkdtemp()
    tar_path = os.path.join(work_dir, f"{arxiv_id}.tar.gz")
    source_dir = os.path.join(work_dir, "source")
    output_path = os.path.join(work_dir, f"{arxiv_id}.mp3")

    try:
        # --- Stage 1: Download, extract, process TeX ---
        send_status(callback_url, secret, arxiv_id, status="preparing")
        print(f"Downloading {tex_source_url}...")

        with httpx.Client(timeout=120, follow_redirects=True) as client:
            resp = client.get(
                tex_source_url,
                headers={"User-Agent": "TexReader/1.0"},
            )
            resp.raise_for_status()

        with open(tar_path, "wb") as f:
            f.write(resp.content)

        print(f"Downloaded {len(resp.content)} bytes")

        # --- Extract ---
        print("Extracting...")

        os.makedirs(source_dir, exist_ok=True)

        # Handle tar.gz archives, gzip'd single .tex files, and plain .tex files
        content_type = resp.headers.get("content-type", "")
        if "gzip" in content_type or "tar" in content_type or tar_path.endswith(".gz"):
            try:
                with tarfile.open(tar_path, "r:*") as tf:
                    tf.extractall(source_dir)
            except tarfile.TarError:
                # Not a tar archive — might be a single gzip'd .tex file
                import gzip
                try:
                    with gzip.open(tar_path, "rb") as gz:
                        decompressed = gz.read()
                    with open(os.path.join(source_dir, "main.tex"), "wb") as f:
                        f.write(decompressed)
                    print(f"Decompressed single gzip'd .tex file ({len(decompressed):,} bytes)")
                except gzip.BadGzipFile:
                    # Truly a plain .tex file, not compressed at all
                    os.rename(tar_path, os.path.join(source_dir, "main.tex"))
        else:
            # Likely a single .tex file
            os.rename(tar_path, os.path.join(source_dir, "main.tex"))

        # --- Process TeX ---
        print("Processing LaTeX...")

        latex = tex_to_audio.read_latex_from_dir(source_dir)
        speech = tex_to_audio.build_speech_text(latex, source_stem=f"arXiv-{arxiv_id}")

        print(f"Generated speech text: {len(speech):,} chars")

        # Save transcript to R2
        transcript_path = os.path.join(work_dir, f"{arxiv_id}-transcript.txt")
        with open(transcript_path, "w") as f:
            f.write(speech)
        transcript_r2_key = f"transcripts/{arxiv_id}.txt"
        print(f"Uploading transcript to R2: {transcript_r2_key}")
        upload_to_r2(transcript_path, transcript_r2_key, content_type="text/plain; charset=utf-8")

        # --- Stage 4: Generate audio ---
        send_status(
            callback_url, secret, arxiv_id,
            status="generating_audio",
            progress_detail="0%",
        )
        print("Generating audio...")

        chunks = tex_to_audio._split_into_chunks(speech)
        total_chunks = len(chunks)
        print(f"Split into {total_chunks} chunks")

        # Generate audio with progress tracking
        tmp_dir = tempfile.mkdtemp()
        chunk_paths = []

        for i, chunk in enumerate(chunks):
            chunk_path = os.path.join(tmp_dir, f"chunk_{i:03d}.mp3")
            print(f"  chunk {i + 1}/{total_chunks}...")
            tex_to_audio._tts_chunk(chunk, chunk_path, tex_to_audio.DEFAULT_VOICE)
            chunk_paths.append(chunk_path)

            # Report progress every 3 chunks or on last chunk
            if (i + 1) % 3 == 0 or i == total_chunks - 1:
                send_status(
                    callback_url, secret, arxiv_id,
                    status="generating_audio",
                    progress_detail=f"{round((i + 1) / total_chunks * 100)}%",
                )

        # Concatenate chunks
        list_file = os.path.join(tmp_dir, "list.txt")
        with open(list_file, "w") as fh:
            fh.writelines(f"file '{p}'\n" for p in chunk_paths)

        ret = os.system(
            f'ffmpeg -y -f concat -safe 0 -i "{list_file}" '
            f'-acodec copy "{output_path}" 2>/dev/null'
        )

        # Cleanup temp chunks
        for p in chunk_paths:
            if os.path.exists(p):
                os.remove(p)

        if ret != 0:
            raise RuntimeError("ffmpeg concatenation failed")

        # Tag the MP3 — prefer pre-scraped metadata over LaTeX extraction
        if paper_title and paper_author:
            tag_title = paper_title
            tag_author = paper_author
        else:
            meta = tex_to_audio.extract_full_metadata(latex, f"arXiv-{arxiv_id}")
            tag_title = meta["title"] or "Untitled"
            tag_author = meta["authors"][0] if meta["authors"] else "Unknown"
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

        # --- Stage 5: Upload to R2 ---
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
    secrets=[modal.Secret.from_name("texreader-secrets")],
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

    if not all([arxiv_id, tex_source_url, callback_url]):
        return {"error": "arxiv_id, tex_source_url, and callback_url required"}

    # Spawn the narration as an async job
    narrate_paper.spawn(arxiv_id, tex_source_url, callback_url, paper_title, paper_author)

    return {"status": "dispatched", "arxiv_id": arxiv_id}
