# Kingdom Sound — 100-Track Seed Prompt Sheet
Built 2026-05-13 · For: King, to blast through library seeding in 3-4 hours
Platforms: Suno Pro / Udio Pro / AIVA Pro

## Workflow (per track)

1. Paste the prompt below into Suno or Udio (whichever's UI you prefer)
2. Generate. If first generation is weak, regenerate 1-2x — pick the best take
3. Download MP3 + WAV (Suno gives both at Pro tier)
4. Rename file to the suggested filename (e.g. `cinematic-01-throne-ascending.mp3`)
5. Upload BOTH formats to Supabase Storage → bucket `kingdom-sound` → path `tracks/<filename>`
6. Insert row into `music_tracks` table — SQL template at bottom of this file

**Suggested rhythm:** Bang through 10 tracks in one genre per session. 10 sessions × 30 min = ~5 hours total. Faster if you batch generate.

---

## GENRE 01 — CINEMATIC (10 tracks · tier: starter-3, pro-5, studio-2)

| # | Title | Prompt | BPM | Length | Tier | Filename |
|---|-------|--------|-----|--------|------|----------|
| 01 | Throne Ascending | instrumental cinematic orchestral score, slow build, soaring strings, taiko drums entering at 0:45, triumphant crescendo, no vocals | 90 | 2:30 | starter | `cinematic-01-throne-ascending` |
| 02 | The Quiet Before | instrumental cinematic, sparse piano, low cello drone, gentle build, contemplative, no vocals | 70 | 2:15 | starter | `cinematic-02-quiet-before` |
| 03 | Lion's Pace | instrumental cinematic action, driving percussion, brass stabs, urgent strings, no vocals | 130 | 1:45 | starter | `cinematic-03-lions-pace` |
| 04 | Glory March | instrumental cinematic orchestral, regal brass, marching snare, choir pad, anthemic, no vocals | 110 | 2:00 | pro | `cinematic-04-glory-march` |
| 05 | Heaven's Edge | instrumental cinematic ambient, ethereal pad, female choir vowels, soft piano motif, no lyrics | 80 | 3:00 | pro | `cinematic-05-heavens-edge` |
| 06 | First Light | instrumental cinematic, warm strings build, solo violin, hopeful resolve, no vocals | 95 | 2:30 | pro | `cinematic-06-first-light` |
| 07 | Battle Standard | instrumental cinematic epic battle, war drums, brass, urgent strings, climactic, no vocals | 140 | 2:15 | pro | `cinematic-07-battle-standard` |
| 08 | Coronation | instrumental cinematic orchestral, ceremonial brass fanfare, choir, resolving to majestic theme | 100 | 2:45 | pro | `cinematic-08-coronation` |
| 09 | The Inheritance | instrumental cinematic emotional, full orchestra, tear-jerking melody, slow build, no vocals | 75 | 3:30 | studio | `cinematic-09-inheritance` |
| 10 | Sons of Thunder | instrumental cinematic epic, hybrid orchestra + synth, massive build, modern trailer score, no vocals | 120 | 2:30 | studio | `cinematic-10-sons-of-thunder` |

## GENRE 02 — CORPORATE / EXPLAINER (10 tracks · tier: starter-5, pro-4, studio-1)

| # | Title | Prompt | BPM | Length | Tier | Filename |
|---|-------|--------|-----|--------|------|----------|
| 01 | Clean Stride | instrumental corporate background music, light acoustic guitar plucking, soft piano, simple percussion, optimistic, no vocals | 100 | 2:00 | starter | `corporate-01-clean-stride` |
| 02 | Morning Office | instrumental corporate ambient, light marimba, soft synth pad, gentle hi-hat, calm productivity vibe, no vocals | 95 | 2:15 | starter | `corporate-02-morning-office` |
| 03 | Slide Deck | instrumental corporate, minimal piano motif, soft strings underneath, neutral and professional, no vocals | 90 | 1:45 | starter | `corporate-03-slide-deck` |
| 04 | Forward | instrumental corporate uplifting, acoustic guitar, light kick drum, hand claps, optimistic resolution, no vocals | 110 | 2:00 | starter | `corporate-04-forward` |
| 05 | The Pitch | instrumental corporate, light piano arpeggios, building synth, modern startup vibe, no vocals | 105 | 2:00 | starter | `corporate-05-the-pitch` |
| 06 | Open Plan | instrumental corporate, soft electric piano, bossa nova brush drums, warm bass, friendly vibe, no vocals | 115 | 2:15 | pro | `corporate-06-open-plan` |
| 07 | Quiet Confidence | instrumental corporate background, gentle acoustic guitar, soft piano, sparse percussion, trustworthy tone, no vocals | 85 | 2:30 | pro | `corporate-07-quiet-confidence` |
| 08 | Big Picture | instrumental corporate inspiring, piano melody, swelling strings, light percussion, motivational build, no vocals | 100 | 2:45 | pro | `corporate-08-big-picture` |
| 09 | The Launch | instrumental corporate uplifting, acoustic guitar strums, claps, gang vocals (no words), driving rhythm, no lyrics | 120 | 2:15 | pro | `corporate-09-the-launch` |
| 10 | Mission Critical | instrumental corporate cinematic-hybrid, modern synths, orchestral strings, motivational build, no vocals | 110 | 3:00 | studio | `corporate-10-mission-critical` |

## GENRE 03 — HIP-HOP / TRAP (10 tracks · tier: starter-3, pro-5, studio-2)

| # | Title | Prompt | BPM | Length | Tier | Filename |
|---|-------|--------|-----|--------|------|----------|
| 01 | Lowrider Sunday | instrumental hip-hop chill, lo-fi drums, jazzy piano sample, smooth bass, no vocals | 85 | 2:00 | starter | `hiphop-01-lowrider-sunday` |
| 02 | Cypher Block | instrumental boom-bap hip-hop, vinyl crackle, jazzy piano sample, hard kick + snare, no vocals | 90 | 2:15 | starter | `hiphop-02-cypher-block` |
| 03 | Underground | instrumental hip-hop dark, minor piano, deep 808s, hi-hat rolls, gritty atmosphere, no vocals | 140 | 2:00 | starter | `hiphop-03-underground` |
| 04 | Trap Throne | instrumental trap, hard 808 bass, hi-hat rolls, dark minor synth, modern Atlanta vibe, no vocals | 145 | 2:00 | pro | `hiphop-04-trap-throne` |
| 05 | Soul Sample | instrumental hip-hop, soulful sampled vocal chops (wordless), warm bass, classic Kanye-style production, no lyrics | 92 | 2:30 | pro | `hiphop-05-soul-sample` |
| 06 | Pull Up | instrumental hip-hop trap, melodic synth lead, 808 bass, hi-hat rolls, confident vibe, no vocals | 130 | 2:00 | pro | `hiphop-06-pull-up` |
| 07 | Velvet Brown | instrumental hip-hop jazzy, smooth electric piano, walking bass, light snare, sophisticated vibe, no vocals | 95 | 2:30 | pro | `hiphop-07-velvet-brown` |
| 08 | Throne Room | instrumental hip-hop hybrid orchestral, choir pad, hard 808s, cinematic trap (Kanye + Hans Zimmer), no vocals | 100 | 2:45 | pro | `hiphop-08-throne-room` |
| 09 | Reflection | instrumental hip-hop emotional, soft piano, warm bass, sparse drums, introspective mood, no vocals | 80 | 3:00 | studio | `hiphop-09-reflection` |
| 10 | Crown Cypher | instrumental hip-hop boom-bap, jazz horn sample, hard kick, dusty snare, classic golden-era production, no vocals | 88 | 2:30 | studio | `hiphop-10-crown-cypher` |

## GENRE 04 — AMBIENT / DRONE (10 tracks · tier: starter-4, pro-4, studio-2)

| # | Title | Prompt | BPM | Length | Tier | Filename |
|---|-------|--------|-----|--------|------|----------|
| 01 | Stillness | instrumental ambient, soft synth pad, distant piano notes, no percussion, meditative, no vocals | n/a | 3:00 | starter | `ambient-01-stillness` |
| 02 | Quiet Hour | instrumental ambient, warm analog synth, gentle drone, no rhythm, peaceful, no vocals | n/a | 3:30 | starter | `ambient-02-quiet-hour` |
| 03 | Slow Dawn | instrumental ambient, evolving synth pad, distant choir vowels, gentle motion, no lyrics | n/a | 3:00 | starter | `ambient-03-slow-dawn` |
| 04 | Underwater Light | instrumental ambient, watery synth textures, soft bell tones, no percussion, dreamy, no vocals | n/a | 3:00 | starter | `ambient-04-underwater-light` |
| 05 | Sanctuary | instrumental ambient sacred, organ pad, soft choir, reflective, contemplative space, no lyrics | n/a | 3:30 | pro | `ambient-05-sanctuary` |
| 06 | Long Memory | instrumental ambient cinematic, slow evolving textures, gentle piano notes, emotional depth, no vocals | n/a | 4:00 | pro | `ambient-06-long-memory` |
| 07 | Glass Garden | instrumental ambient, crystalline bell tones, soft synth pad, no rhythm, ethereal, no vocals | n/a | 3:30 | pro | `ambient-07-glass-garden` |
| 08 | Inner Room | instrumental ambient, deep low drone, distant cello, slow evolution, meditative space, no vocals | n/a | 4:00 | pro | `ambient-08-inner-room` |
| 09 | Holy Ground | instrumental ambient sacred cinematic, choir, organ, slow piano notes, deeply reverent, no lyrics | n/a | 4:30 | studio | `ambient-09-holy-ground` |
| 10 | Eternal Now | instrumental ambient, evolving textures, subtle bell motif, contemplative, expansive, no vocals | n/a | 5:00 | studio | `ambient-10-eternal-now` |

## GENRE 05 — WORSHIP / GOSPEL (10 tracks · tier: starter-3, pro-5, studio-2)

| # | Title | Prompt | BPM | Length | Tier | Filename |
|---|-------|--------|-----|--------|------|----------|
| 01 | Sunday Morning | instrumental contemporary worship, warm piano, soft pad, gentle build, hopeful, no vocals | 75 | 2:30 | starter | `worship-01-sunday-morning` |
| 02 | Open Hands | instrumental worship ballad, piano arpeggios, swelling strings, devotional mood, no vocals | 70 | 3:00 | starter | `worship-02-open-hands` |
| 03 | The Call | instrumental gospel uplifting, organ, light drums, soulful piano, joyful build, no vocals | 95 | 2:30 | starter | `worship-03-the-call` |
| 04 | Sanctuary Light | instrumental contemporary worship, piano + acoustic guitar, ambient pad, reflective, no vocals | 72 | 3:00 | pro | `worship-04-sanctuary-light` |
| 05 | Resurrection | instrumental worship anthem, piano build, soaring strings, anthemic crescendo, no vocals | 80 | 3:30 | pro | `worship-05-resurrection` |
| 06 | Throne Room Worship | instrumental contemporary worship cinematic, piano + strings + choir pad, declarative build, no vocals | 78 | 3:00 | pro | `worship-06-throne-room-worship` |
| 07 | Quiet Surrender | instrumental worship intimate, solo piano, gentle strings, deeply tender, no vocals | 65 | 3:00 | pro | `worship-07-quiet-surrender` |
| 08 | Lion of Judah | instrumental worship cinematic anthem, orchestral build, choir pad, triumphant, no vocals | 90 | 3:00 | pro | `worship-08-lion-of-judah` |
| 09 | Family of God | instrumental gospel celebration, organ, full band, joyful, hand-clap rhythm, no vocals | 105 | 2:30 | studio | `worship-09-family-of-god` |
| 10 | Eternal Praise | instrumental worship anthem epic, full orchestra, choir pad, soaring melody, deeply reverent build, no vocals | 75 | 4:00 | studio | `worship-10-eternal-praise` |

## GENRE 06 — UPBEAT / ENERGETIC (10 tracks · tier: starter-4, pro-4, studio-2)

| # | Title | Prompt | BPM | Length | Tier | Filename |
|---|-------|--------|-----|--------|------|----------|
| 01 | Friday Energy | instrumental upbeat indie-pop, acoustic guitar strum, hand claps, light synth, summer vibe, no vocals | 125 | 2:00 | starter | `upbeat-01-friday-energy` |
| 02 | Open Road | instrumental upbeat folk-pop, acoustic guitar, ukulele, hand claps, road-trip vibe, no vocals | 120 | 2:15 | starter | `upbeat-02-open-road` |
| 03 | First Day | instrumental upbeat indie pop, gentle build, acoustic strums, modern pop production, no vocals | 115 | 2:00 | starter | `upbeat-03-first-day` |
| 04 | Sunlight | instrumental upbeat acoustic, bright guitar, warm bass, light percussion, optimistic, no vocals | 110 | 2:30 | starter | `upbeat-04-sunlight` |
| 05 | Yes Day | instrumental upbeat pop, acoustic guitar, claps, whistle melody, feel-good vibe, no vocals | 118 | 2:00 | pro | `upbeat-05-yes-day` |
| 06 | Going Higher | instrumental upbeat indie folk, banjo + acoustic guitar, hand claps, foot stomps, anthemic, no vocals | 130 | 2:15 | pro | `upbeat-06-going-higher` |
| 07 | The Wave | instrumental upbeat modern pop, light synth + acoustic blend, four-on-the-floor kick, summer feel, no vocals | 122 | 2:00 | pro | `upbeat-07-the-wave` |
| 08 | Fresh Start | instrumental upbeat folk-pop, acoustic strum, ukulele, building energy, ad-friendly, no vocals | 125 | 2:00 | pro | `upbeat-08-fresh-start` |
| 09 | Bright Side | instrumental upbeat indie folk-pop, acoustic + claps + whistle, feel-good drive, anthemic chorus, no vocals | 130 | 2:30 | studio | `upbeat-09-bright-side` |
| 10 | Carolina Sun | instrumental upbeat acoustic Southern feel, banjo, acoustic guitar, stomp + clap, joyful momentum, no vocals | 128 | 2:30 | studio | `upbeat-10-carolina-sun` |

## GENRE 07 — LO-FI (10 tracks · tier: starter-5, pro-4, studio-1)

| # | Title | Prompt | BPM | Length | Tier | Filename |
|---|-------|--------|-----|--------|------|----------|
| 01 | Study Hour | instrumental lo-fi hip-hop, jazzy piano, warm bass, dusty drums, vinyl crackle, no vocals | 80 | 2:30 | starter | `lofi-01-study-hour` |
| 02 | Tape Loop | instrumental lo-fi chillhop, soft electric piano, gentle bass, brush drums, mellow, no vocals | 75 | 2:30 | starter | `lofi-02-tape-loop` |
| 03 | After Hours | instrumental lo-fi jazzy, smooth saxophone sample, warm Rhodes, light drums, vintage feel, no vocals | 78 | 3:00 | starter | `lofi-03-after-hours` |
| 04 | Slow Sundown | instrumental lo-fi, dreamy synth pad, soft piano, dusty drums, relaxed groove, no vocals | 82 | 3:00 | starter | `lofi-04-slow-sundown` |
| 05 | Rain Window | instrumental lo-fi, warm piano, soft bass, vinyl noise + light rain sound, peaceful, no vocals | 75 | 3:00 | starter | `lofi-05-rain-window` |
| 06 | Coffee Shop | instrumental lo-fi jazz, smooth Rhodes electric piano, walking bass, brush drums, café feel, no vocals | 90 | 2:45 | pro | `lofi-06-coffee-shop` |
| 07 | Late Train | instrumental lo-fi hip-hop, melancholic piano, warm bass, soft brush drums, contemplative, no vocals | 78 | 3:00 | pro | `lofi-07-late-train` |
| 08 | Soft Static | instrumental lo-fi ambient, dreamy synth pad, sparse piano notes, brush drum, vinyl crackle, no vocals | 70 | 3:30 | pro | `lofi-08-soft-static` |
| 09 | Reading Light | instrumental lo-fi jazzy chillhop, warm Rhodes, light percussion, mellow vibe, ideal for study, no vocals | 80 | 3:00 | pro | `lofi-09-reading-light` |
| 10 | Sunset Drive | instrumental lo-fi chillhop, soft synth lead, warm bass, dusty drums, golden-hour mood, no vocals | 85 | 3:30 | studio | `lofi-10-sunset-drive` |

## GENRE 08 — ROCK (10 tracks · tier: starter-3, pro-5, studio-2)

| # | Title | Prompt | BPM | Length | Tier | Filename |
|---|-------|--------|-----|--------|------|----------|
| 01 | Open Highway | instrumental indie rock, driving acoustic + electric guitar, steady drums, anthemic feel, no vocals | 130 | 2:15 | starter | `rock-01-open-highway` |
| 02 | Cold Engine | instrumental garage rock, fuzzy electric guitar, driving bass + drums, no vocals | 140 | 2:00 | starter | `rock-02-cold-engine` |
| 03 | Foot Down | instrumental rock energetic, distorted guitar riff, driving rhythm section, urgent, no vocals | 145 | 2:00 | starter | `rock-03-foot-down` |
| 04 | The Long Drive | instrumental Americana rock, slide guitar, warm bass, brush drums, road-trip feel, no vocals | 110 | 2:45 | pro | `rock-04-long-drive` |
| 05 | Empire | instrumental epic rock, anthemic guitar build, big drums, soaring climax, no vocals | 120 | 3:00 | pro | `rock-05-empire` |
| 06 | Last Stand | instrumental cinematic rock, distorted guitar + orchestral strings, building energy, no vocals | 125 | 2:30 | pro | `rock-06-last-stand` |
| 07 | Sons of Carolina | instrumental Southern rock, slide guitar, harmonica, driving rhythm, prideful anthem, no vocals | 115 | 2:45 | pro | `rock-07-sons-of-carolina` |
| 08 | Storm Front | instrumental cinematic rock, urgent guitar riff, war drums, building tension, no vocals | 135 | 2:30 | pro | `rock-08-storm-front` |
| 09 | Iron Crown | instrumental epic rock anthem, distorted guitar, hard drums, anthemic build, no vocals | 130 | 3:00 | studio | `rock-09-iron-crown` |
| 10 | Open Sky | instrumental Americana rock cinematic, slide guitar + strings, soaring melody, no vocals | 118 | 3:30 | studio | `rock-10-open-sky` |

## GENRE 09 — ELECTRONIC (10 tracks · tier: starter-3, pro-5, studio-2)

| # | Title | Prompt | BPM | Length | Tier | Filename |
|---|-------|--------|-----|--------|------|----------|
| 01 | Pulse | instrumental electronic, driving synth bass, four-on-the-floor kick, hi-hat groove, modern, no vocals | 124 | 2:15 | starter | `electronic-01-pulse` |
| 02 | Neon Streets | instrumental synthwave, retro analog synth lead, driving drum machine, 80s vibe, no vocals | 110 | 2:30 | starter | `electronic-02-neon-streets` |
| 03 | Liftoff | instrumental electronic dance, building synth, kick + clap drive, energetic, no vocals | 128 | 2:00 | starter | `electronic-03-liftoff` |
| 04 | Cold Wave | instrumental electronic, dark moody synth, slow build, modern production, no vocals | 100 | 2:30 | pro | `electronic-04-cold-wave` |
| 05 | The Drop | instrumental electronic future bass, melodic synth lead, big bass drop, festival energy, no vocals | 140 | 2:30 | pro | `electronic-05-the-drop` |
| 06 | Glass City | instrumental electronic chill, ambient synth pad, soft electronic drums, contemplative, no vocals | 90 | 2:45 | pro | `electronic-06-glass-city` |
| 07 | Velocity | instrumental electronic, driving synth + drum machine, building intensity, action-oriented, no vocals | 132 | 2:15 | pro | `electronic-07-velocity` |
| 08 | Frequency | instrumental electronic ambient, evolving synth pad, sparse beat, modern minimal, no vocals | 110 | 3:00 | pro | `electronic-08-frequency` |
| 09 | Vector | instrumental electronic cinematic, hybrid synth + orchestral, modern trailer score, no vocals | 120 | 2:45 | studio | `electronic-09-vector` |
| 10 | Quantum | instrumental electronic future bass cinematic, big melodic build, modern festival production, no vocals | 128 | 3:00 | studio | `electronic-10-quantum` |

## GENRE 10 — R&B / SOUL (10 tracks · tier: starter-3, pro-5, studio-2)

| # | Title | Prompt | BPM | Length | Tier | Filename |
|---|-------|--------|-----|--------|------|----------|
| 01 | Smooth Move | instrumental R&B, smooth electric piano, warm bass, soft drums, neo-soul vibe, no vocals | 85 | 2:30 | starter | `rnb-01-smooth-move` |
| 02 | Slow Burn | instrumental R&B ballad, lush piano, warm strings, soft drums, intimate, no vocals | 75 | 3:00 | starter | `rnb-02-slow-burn` |
| 03 | Late Light | instrumental R&B, Rhodes electric piano, deep bass, brush drums, mellow, no vocals | 80 | 2:30 | starter | `rnb-03-late-light` |
| 04 | Velvet Hour | instrumental neo-soul, jazzy chords, warm bass, swing drums, sophisticated, no vocals | 90 | 2:45 | pro | `rnb-04-velvet-hour` |
| 05 | Honey | instrumental R&B, warm Rhodes, smooth bass, light drums, romantic but tasteful, no vocals | 78 | 2:30 | pro | `rnb-05-honey` |
| 06 | Quiet Storm | instrumental R&B classic, smooth saxophone, warm electric piano, late-night vibe, no vocals | 80 | 3:00 | pro | `rnb-06-quiet-storm` |
| 07 | Brown Sugar | instrumental neo-soul, jazz chords, warm bass, swing feel, sophisticated, no vocals | 88 | 2:30 | pro | `rnb-07-brown-sugar` |
| 08 | Slow Drive | instrumental R&B, smooth electric piano, deep bass, light drums, cruising vibe, no vocals | 85 | 2:45 | pro | `rnb-08-slow-drive` |
| 09 | Sundress | instrumental R&B summer, warm electric piano, bossa nova drums, light vibe, no vocals | 95 | 2:30 | studio | `rnb-09-sundress` |
| 10 | The Other Side | instrumental R&B ballad cinematic, full strings + piano + soft drums, emotional, no vocals | 70 | 3:30 | studio | `rnb-10-other-side` |

---

## SQL INSERT template (paste per track after upload)

```sql
insert into music_tracks (title, genre, mood, bpm, duration_sec, storage_path, wav_path, tier_required, source_platform, public, description)
values (
  'Throne Ascending',          -- title
  'cinematic',                 -- genre
  'triumphant',                -- mood
  90,                          -- bpm
  150,                         -- duration_sec (2:30)
  'tracks/cinematic-01-throne-ascending.mp3',
  'tracks/cinematic-01-throne-ascending.wav',
  'starter',                   -- tier_required
  'suno',                      -- source_platform
  true,                        -- public
  'Slow orchestral build with soaring strings and triumphant brass crescendo. Cinematic background score.'
);
```

Or batch-insert all 100 at once via a single SQL statement once the bucket uploads complete. CSV-import via Supabase Table Editor also works.

---

## Tier distribution summary

- **Starter tier visible:** ~33 tracks (across all genres) — entry tier sees curated cross-genre catalog
- **Pro tier visible:** ~47 tracks — Pro sees Starter + Pro
- **Studio tier visible:** all 100 tracks (and studio-exclusive 20)

## Genre breakdown (for SEO/library page filters)

| Genre | Track count | Library page filter value |
|-------|-------------|---------------------------|
| Cinematic | 10 | `cinematic` |
| Corporate | 10 | `corporate` |
| Hip-Hop | 10 | `hip-hop` |
| Ambient | 10 | `ambient` |
| Worship | 10 | `worship` |
| Upbeat | 10 | `upbeat` |
| Lo-Fi | 10 | `lo-fi` |
| Rock | 10 | `rock` |
| Electronic | 10 | `electronic` |
| R&B | 10 | `r&b` |

## Once seeded — test the funnel end-to-end

1. Subscribe to Starter via `/music.html` (Stripe test mode)
2. Open library — confirm you see ~33 starter-tier tracks
3. Download 1 → verify license JSON returns
4. Download 5 more → 6th should hit `quota_exceeded`
5. Subscribe to Studio → confirm you see all 100 tracks
