"""
screen-capture.py — Desktop screenshot → tools/screen/screen-latest.png
Run on demand: python tools/screen-capture.py
Install deps:  pip install pyautogui pillow
"""

import sys
import os
import time

try:
    import pyautogui
    from PIL import Image
except ImportError:
    print("Missing deps. Run: pip install pyautogui pillow")
    sys.exit(1)

SCREEN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screen')
OUTPUT = os.path.join(SCREEN_DIR, 'screen-latest.png')
ARCHIVE = os.path.join(SCREEN_DIR, f'screen-{int(time.time())}.png')

os.makedirs(SCREEN_DIR, exist_ok=True)

screenshot = pyautogui.screenshot()
screenshot.save(OUTPUT)
screenshot.save(ARCHIVE)

size = os.path.getsize(OUTPUT)
print(f"Saved: {OUTPUT} ({size:,} bytes)")
print(f"Archived: {ARCHIVE}")

# If --watch flag: loop every 30s
if '--watch' in sys.argv:
    print("Watch mode: capturing every 30s. Ctrl+C to stop.")
    try:
        while True:
            time.sleep(30)
            screenshot = pyautogui.screenshot()
            screenshot.save(OUTPUT)
            print(f"Updated: {time.strftime('%H:%M:%S')}")
    except KeyboardInterrupt:
        print("Stopped.")
