#!/usr/bin/env python3
"""
lionheart-transcribe.py
Reads video-list.json and extracts English transcripts for every video
using youtube-transcript-api. Saves to Agency/personal/lionheart/raw/{id}.txt

Run AFTER lionheart-harvest.py
"""

import json
import os
import sys
import time

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound, CouldNotRetrieveTranscript
except ImportError:
    print("ERROR: youtube-transcript-api not installed.")
    print("Run: pip install youtube-transcript-api")
    sys.exit(1)

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "personal", "lionheart")
VIDEO_LIST = os.path.join(BASE_DIR, "video-list.json")
RAW_DIR = os.path.join(BASE_DIR, "raw")
FAILED_LOG = os.path.join(BASE_DIR, "failed.txt")


def clean_transcript_text(entries):
    """Join transcript entries into clean paragraphs."""
    texts = []
    buffer = []
    char_count = 0

    for entry in entries:
        text = entry.get("text", "").strip()
        if not text or text in ("[Music]", "[Applause]", "[Laughter]"):
            continue
        buffer.append(text)
        char_count += len(text)

        # Break into paragraph every ~500 chars
        if char_count >= 500:
            texts.append(" ".join(buffer))
            buffer = []
            char_count = 0

    if buffer:
        texts.append(" ".join(buffer))

    return "\n\n".join(texts)


def extract_transcripts():
    if not os.path.exists(VIDEO_LIST):
        print(f"ERROR: video-list.json not found at {VIDEO_LIST}")
        print("Run lionheart-harvest.py first.")
        sys.exit(1)

    with open(VIDEO_LIST, "r", encoding="utf-8") as f:
        videos = json.load(f)

    os.makedirs(RAW_DIR, exist_ok=True)

    total = len(videos)
    done = 0
    skipped = 0
    failed = []

    print(f"Extracting transcripts for {total} videos...")
    print(f"Output: {RAW_DIR}\n")

    api = YouTubeTranscriptApi()

    for i, video in enumerate(videos, 1):
        vid_id = video["id"]
        title = video["title"]
        out_file = os.path.join(RAW_DIR, f"{vid_id}.txt")

        # Resume: skip already downloaded
        if os.path.exists(out_file) and os.path.getsize(out_file) > 100:
            skipped += 1
            continue

        print(f"[{i}/{total}] {title[:70]}...")

        try:
            transcript_list = api.list(vid_id)

            fetched = None
            # Prefer manual English
            try:
                fetched = transcript_list.find_manually_created_transcript(["en"]).fetch()
            except Exception:
                pass

            # Fall back to auto-generated English
            if fetched is None:
                try:
                    fetched = transcript_list.find_generated_transcript(["en"]).fetch()
                except Exception:
                    pass

            # Fall back to any transcript translated to English
            if fetched is None:
                try:
                    fetched = transcript_list.find_transcript(["en"]).fetch()
                except Exception:
                    pass

            if fetched is None:
                raise NoTranscriptFound(vid_id, ["en"], {})

            # Convert FetchedTranscriptSnippet objects to dicts
            entries = [{"text": e.text, "start": e.start} for e in fetched]
            text = clean_transcript_text(entries)

            # Write header + body
            with open(out_file, "w", encoding="utf-8") as f:
                f.write(f"TITLE: {title}\n")
                f.write(f"VIDEO ID: {vid_id}\n")
                f.write(f"URL: {video['url']}\n")
                f.write("=" * 60 + "\n\n")
                f.write(text)

            done += 1
            time.sleep(0.5)  # Rate limiting

        except Exception as e:
            err_str = str(e)
            if "no captions" in err_str.lower() or "NoTranscriptFound" in type(e).__name__ or "TranscriptsDisabled" in type(e).__name__:
                print(f"  FAILED (no captions): {vid_id}")
            else:
                print(f"  ERROR: {vid_id} — {e}")
            failed.append({"id": vid_id, "title": title, "url": video["url"], "reason": err_str[:120]})
            time.sleep(0.5)

    # Write failed log
    if failed:
        with open(FAILED_LOG, "w", encoding="utf-8") as f:
            f.write(f"VIDEOS WITHOUT TRANSCRIPTS — {len(failed)} total\n")
            f.write("Use Whisper AI for these: whisper audio.mp3 --model medium --language en\n\n")
            for v in failed:
                f.write(f"[{v['id']}] {v['title']}\n")
                f.write(f"  URL: {v['url']}\n")
                f.write(f"  Reason: {v['reason']}\n\n")

    print(f"\nDone.")
    print(f"  Transcribed: {done}")
    print(f"  Skipped (already done): {skipped}")
    print(f"  Failed (no captions): {len(failed)}")
    if failed:
        print(f"  Failed list: {FAILED_LOG}")


if __name__ == "__main__":
    extract_transcripts()
