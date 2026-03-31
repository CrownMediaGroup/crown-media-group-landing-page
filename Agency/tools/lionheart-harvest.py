#!/usr/bin/env python3
"""
lionheart-harvest.py
Pulls every video ID + title from @LionheartChurch YouTube channel
and saves to Agency/personal/lionheart/video-list.json
"""

import subprocess
import json
import os
import sys

CHANNEL_URL = "https://www.youtube.com/@LionheartChurch/videos"
BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "personal", "lionheart")
OUTPUT_FILE = os.path.join(BASE_DIR, "video-list.json")


def harvest():
    print("Harvesting Lionheart Church video list...")
    print(f"Channel: {CHANNEL_URL}\n")

    try:
        result = subprocess.run(
            [
                "yt-dlp",
                "--flat-playlist",
                "--print", "%(id)s\t%(title)s",
                "--no-warnings",
                CHANNEL_URL,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        print("ERROR: yt-dlp timed out after 120 seconds.")
        sys.exit(1)
    except FileNotFoundError:
        print("ERROR: yt-dlp not found. Install with: pip install yt-dlp")
        sys.exit(1)

    if result.returncode != 0:
        print(f"ERROR: yt-dlp failed:\n{result.stderr}")
        sys.exit(1)

    lines = [line.strip() for line in result.stdout.strip().split("\n") if "\t" in line]

    videos = []
    for line in lines:
        parts = line.split("\t", 1)
        if len(parts) == 2:
            vid_id, title = parts
            videos.append({
                "id": vid_id.strip(),
                "title": title.strip(),
                "url": f"https://youtu.be/{vid_id.strip()}",
            })

    if not videos:
        print("WARNING: No videos found. Check channel URL or network connection.")
        sys.exit(1)

    os.makedirs(BASE_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(videos, f, indent=2, ensure_ascii=False)

    print(f"Found {len(videos)} videos.")
    print(f"Saved to: {OUTPUT_FILE}")
    print("\nSample (first 5):")
    for v in videos[:5]:
        print(f"  [{v['id']}] {v['title']}")

    return videos


if __name__ == "__main__":
    harvest()
