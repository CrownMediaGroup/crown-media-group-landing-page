# /assets/music-samples/ — Public preview tracks for music.html

These 5 files are public 30-second previews that play on the `/music.html` "Hear the library" section. No login or subscription required.

## Expected files

Place these EXACT filenames in this directory:

| Filename | Genre / Mood | Source prompt (from `Agency/ops/music/100-track-seed-prompts.md`) |
|----------|-------------|-----------------------------------|
| `cinematic-throne-ascending.mp3` | Cinematic / Triumphant | Genre 01 #01 — instrumental cinematic orchestral score, slow build, soaring strings, taiko drums entering at 0:45, triumphant crescendo |
| `corporate-clean-stride.mp3` | Corporate / Optimistic | Genre 02 #01 — instrumental corporate background music, light acoustic guitar plucking, soft piano, simple percussion, optimistic |
| `worship-sunday-morning.mp3` | Worship / Hopeful | Genre 05 #01 — instrumental contemporary worship, warm piano, soft pad, gentle build, hopeful |
| `lofi-study-hour.mp3` | Lo-Fi / Mellow | Genre 07 #01 — instrumental lo-fi hip-hop, jazzy piano, warm bass, dusty drums, vinyl crackle |
| `hiphop-soul-sample.mp3` | Hip-Hop / Soulful | Genre 03 #05 — instrumental hip-hop, soulful sampled vocal chops (wordless), warm bass, classic Kanye-style production |

## File spec

- **Format:** MP3, 192 kbps (or 128 kbps if file size is a concern)
- **Length:** **30 seconds max** — these are previews. Subscribers get full tracks.
- **File size target:** ≤ 600 KB per file (browsers stream these, smaller = faster preview)
- **Sample rate:** 44.1 kHz, stereo

## How to create the samples (workflow)

1. Generate each track in Suno or Udio using the prompt from `100-track-seed-prompts.md`
2. Export the full track as MP3
3. Trim to a representative 30-second clip — pick the most "hooky" section (typically 0:30–1:00)
4. Save with the exact filename from the table above
5. Drop into this directory
6. Commit + push — Netlify will serve them at `https://crownmediagroup.co/assets/music-samples/<filename>.mp3`

## Why public + free preview?

The full library is gated behind subscription via the `/api/music-library` endpoint. These public previews exist solely to let visitors HEAR the quality before they pay. No CRM tracking, no subscription check — just a fast HTML5 audio player.

If a visitor likes what they hear, the "Subscribe" CTA on the page sends them to the pricing tiers.

## Replacing or updating samples

To swap one out: just overwrite the file with the same filename. Browsers may cache for ~1 hour — you can bust the cache by appending a `?v=2` querystring in the `<audio src="...">` if needed.

## Note for the player UX

The HTML5 `<audio>` element uses `preload="none"` so audio data only downloads when the user clicks play. This keeps page load fast even with 5 samples.
