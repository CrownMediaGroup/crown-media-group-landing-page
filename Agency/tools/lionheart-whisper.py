#!/usr/bin/env python3
"""
lionheart-whisper.py
Downloads audio for every video in failed.txt and transcribes with Whisper AI.
Saves to Agency/personal/lionheart/raw/{id}.txt — same format as lionheart-transcribe.py

Run AFTER lionheart-transcribe.py (handles the no-caption videos)
"""

import json
import os
import sys
import subprocess
import time
import tempfile
import shutil

try:
    import whisper
except ImportError:
    print("ERROR: openai-whisper not installed.")
    print("Run: pip install openai-whisper")
    sys.exit(1)

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "personal", "lionheart")
VIDEO_LIST = os.path.join(BASE_DIR, "video-list.json")
FAILED_LOG = os.path.join(BASE_DIR, "failed.txt")
RAW_DIR = os.path.join(BASE_DIR, "raw")
WHISPER_LOG = os.path.join(BASE_DIR, "whisper-failed.txt")

# Model: "medium" is best balance of speed + accuracy for sermons
# Options: tiny, base, small, medium, large (larger = slower but better)
MODEL_NAME = "medium"


def get_failed_ids():
    """Parse failed.txt to get list of video IDs to process."""
    if not os.path.exists(FAILED_LOG):
        print(f"ERROR: failed.txt not found at {FAILED_LOG}")
        print("Run lionheart-transcribe.py first.")
        sys.exit(1)

    with open(FAILED_LOG, "r", encoding="utf-8") as f:
        content = f.read()

    ids = []
    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("[") and "]" in line:
            vid_id = line[1:line.index("]")]
            if vid_id and len(vid_id) == 11:
                ids.append(vid_id)
    return ids


def get_video_info(video_list, vid_id):
    """Look up title and URL from video-list.json."""
    for v in video_list:
        if v["id"] == vid_id:
            return v["title"], v["url"]
    return vid_id, f"https://youtu.be/{vid_id}"


def download_audio(vid_id, url, audio_dir):
    """Download audio as mp3 using yt-dlp. Returns path to mp3 file."""
    out_template = os.path.join(audio_dir, f"{vid_id}.%(ext)s")

    result = subprocess.run(
        [
            "yt-dlp",
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--no-warnings",
            "--quiet",
            "-o", out_template,
            url,
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )

    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp failed: {result.stderr[:200]}")

    mp3_path = os.path.join(audio_dir, f"{vid_id}.mp3")
    if not os.path.exists(mp3_path):
        # Sometimes yt-dlp outputs a different extension first
        for f in os.listdir(audio_dir):
            if f.startswith(vid_id):
                mp3_path = os.path.join(audio_dir, f)
                break

    if not os.path.exists(mp3_path):
        raise RuntimeError("Audio file not found after yt-dlp download.")

    return mp3_path


def transcribe_audio(model, audio_path):
    """Transcribe audio file using Whisper. Returns list of segment dicts."""
    result = model.transcribe(audio_path, language="en", verbose=False, fp16=False)
    return result["segments"]


def segments_to_paragraphs(segments):
    """Convert Whisper segments into readable paragraphs."""
    paragraphs = []
    buffer = []
    char_count = 0

    for seg in segments:
        text = seg.get("text", "").strip()
        if not text:
            continue
        buffer.append(text)
        char_count += len(text)

        if char_count >= 500:
            paragraphs.append(" ".join(buffer))
            buffer = []
            char_count = 0

    if buffer:
        paragraphs.append(" ".join(buffer))

    return "\n\n".join(paragraphs)


def main():
    # Check yt-dlp
    if not shutil.which("yt-dlp"):
        print("ERROR: yt-dlp not found in PATH.")
        sys.exit(1)

    failed_ids = get_failed_ids()
    if not failed_ids:
        print("No failed videos found in failed.txt. Nothing to do.")
        sys.exit(0)

    # Load video metadata
    with open(VIDEO_LIST, "r", encoding="utf-8") as f:
        video_list = json.load(f)

    # Filter: skip already transcribed
    todo = []
    for vid_id in failed_ids:
        out_file = os.path.join(RAW_DIR, f"{vid_id}.txt")
        if os.path.exists(out_file) and os.path.getsize(out_file) > 100:
            print(f"  SKIP (already done): {vid_id}")
        else:
            todo.append(vid_id)

    if not todo:
        print("All failed videos already transcribed. Nothing to do.")
        sys.exit(0)

    total = len(todo)
    print(f"Loading Whisper model: {MODEL_NAME} from local cache...")
    model = whisper.load_model(MODEL_NAME)
    print(f"Model loaded.\n")
    print(f"Transcribing {total} videos with Whisper...\n")

    os.makedirs(RAW_DIR, exist_ok=True)

    done = 0
    whisper_failed = []

    # Use a temp dir for audio files (cleaned up per video to save disk)
    with tempfile.TemporaryDirectory() as audio_dir:
        for i, vid_id in enumerate(todo, 1):
            title, url = get_video_info(video_list, vid_id)
            out_file = os.path.join(RAW_DIR, f"{vid_id}.txt")

            print(f"[{i}/{total}] {title[:70]}...")
            print(f"  Downloading audio...")

            try:
                mp3_path = download_audio(vid_id, url, audio_dir)
                size_mb = os.path.getsize(mp3_path) / 1024 / 1024
                print(f"  Audio: {size_mb:.1f} MB — transcribing...")

                segments = transcribe_audio(model, mp3_path)
                text = segments_to_paragraphs(segments)

                with open(out_file, "w", encoding="utf-8") as f:
                    f.write(f"TITLE: {title}\n")
                    f.write(f"VIDEO ID: {vid_id}\n")
                    f.write(f"URL: {url}\n")
                    f.write(f"TRANSCRIBED BY: Whisper {MODEL_NAME}\n")
                    f.write("=" * 60 + "\n\n")
                    f.write(text)

                # Clean up audio immediately to save disk
                try:
                    os.remove(mp3_path)
                except Exception:
                    pass

                print(f"  Done ({len(segments)} segments)")
                done += 1

            except Exception as e:
                print(f"  ERROR: {e}")
                whisper_failed.append({"id": vid_id, "title": title, "url": url, "error": str(e)[:120]})
                # Clean up any partial audio
                try:
                    for f in os.listdir(audio_dir):
                        if f.startswith(vid_id):
                            os.remove(os.path.join(audio_dir, f))
                except Exception:
                    pass

    print(f"\nDone.")
    print(f"  Transcribed: {done}")
    print(f"  Failed:      {len(whisper_failed)}")

    if whisper_failed:
        with open(WHISPER_LOG, "w", encoding="utf-8") as f:
            f.write(f"WHISPER FAILURES — {len(whisper_failed)} total\n\n")
            for v in whisper_failed:
                f.write(f"[{v['id']}] {v['title']}\n  URL: {v['url']}\n  Error: {v['error']}\n\n")
        print(f"  Failed log:  {WHISPER_LOG}")

    total_raw = len([x for x in os.listdir(RAW_DIR) if x.endswith(".txt")])
    print(f"\nTotal transcripts in raw/: {total_raw}/62")
    if total_raw == 62:
        print("All 62 videos transcribed. Run: npm run lionheart-clean")
    else:
        print(f"Run npm run lionheart-clean when ready (works with partial set too).")


if __name__ == "__main__":
    main()
