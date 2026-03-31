#!/usr/bin/env node
/**
 * lionheart-clean.js
 * Reads raw/ transcripts, cleans each one via Claude API (haiku — cost efficient),
 * saves organized study notes to cleaned/{id}.md
 * Then auto-categorizes and copies to series/ subfolder.
 *
 * Run AFTER lionheart-transcribe.py
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

const BASE_DIR = path.resolve(__dirname, "../personal/lionheart");
const RAW_DIR = path.join(BASE_DIR, "raw");
const CLEANED_DIR = path.join(BASE_DIR, "cleaned");
const SERIES_DIR = path.join(BASE_DIR, "series");
const VIDEO_LIST = path.join(BASE_DIR, "video-list.json");

const SERIES_FOLDERS = {
  "school-of-eternity": [
    "eternity", "mind of christ", "protecting the mind", "who am i",
    "leftovers", "school of eternity", "eternal mind", "renewing",
  ],
  "prayer": [
    "prayer", "tongues", "intercession", "pray", "supplication",
    "warfare", "spiritual warfare", "petitions", "apostolic prayer",
  ],
  "prosperity": [
    "prosperity", "finance", "financial", "stewardship", "money",
    "wealth", "provision", "tithe", "offering", "abundance",
  ],
  "spiritual-growth": [
    "growth", "discipleship", "maturity", "walk", "sanctif",
    "transformation", "discipline", "character", "fruit of the spirit",
  ],
  "eternal-rewards": [
    "eternal reward", "crown", "judgment seat", "bema", "eternal perspective",
    "heavenly", "reward", "crowns of",
  ],
  "summoning-presence": [
    "presence", "summon", "worship", "tabernacle", "glory",
    "manifest", "holy spirit", "atmosphere", "anointing",
  ],
  "supernatural-healing": [
    "healing", "miracle", "supernatural", "deliverance", "gift",
    "signs and wonders", "power", "authority", "cast out",
  ],
  "identity-in-christ": [
    "identity", "sonship", "who you are", "who am i", "new creation",
    "in christ", "righteousness", "authority of the believer", "position",
  ],
  "relationships": [
    "marriage", "relationship", "family", "covenant", "husband",
    "wife", "love", "community", "fellowship",
  ],
};

function detectSeries(title, content) {
  const combined = (title + " " + content.slice(0, 500)).toLowerCase();

  for (const [series, keywords] of Object.entries(SERIES_FOLDERS)) {
    for (const kw of keywords) {
      if (combined.includes(kw.toLowerCase())) {
        return series;
      }
    }
  }
  return "standalone";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanTranscript(client, rawText, title) {
  const prompt = `You are organizing sermon notes from Lionheart Church (Pastor Otha Turnbough).

Clean and organize the following auto-generated transcript into structured study notes.

INSTRUCTIONS:
1. Fix grammar, remove filler words ("um", "uh", "you know", "like"), add proper punctuation
2. Break into logical paragraphs
3. Extract ALL Bible scripture references mentioned (with book, chapter, verse)
4. Identify the main teaching points (numbered list)
5. Pull out 3-5 key quotes from Pastor Otha (exact or near-exact phrasing)
6. Write 2-3 personal application points

OUTPUT FORMAT (use this exact structure):
---
# [Sermon Title]

## Key Scriptures
- Scripture 1 (Book Chapter:Verse)
- Scripture 2 ...

## Teaching Points
1. First main point
2. Second main point
...

## Pastor Otha — Key Quotes
> "Quote here"
> "Another quote"

## Personal Application
1. Application point
2. ...

## Full Notes
[Clean, organized version of the full sermon content]
---

SERMON TITLE: ${title}

TRANSCRIPT:
${rawText.slice(0, 12000)}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].text;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not found in .env");
    process.exit(1);
  }

  const client = new Anthropic();

  if (!fs.existsSync(RAW_DIR)) {
    console.error(`ERROR: raw/ directory not found at ${RAW_DIR}`);
    console.error("Run lionheart-transcribe.py first.");
    process.exit(1);
  }

  fs.mkdirSync(CLEANED_DIR, { recursive: true });

  // Load video list for title lookup
  let videoMap = {};
  if (fs.existsSync(VIDEO_LIST)) {
    const videos = JSON.parse(fs.readFileSync(VIDEO_LIST, "utf-8"));
    for (const v of videos) {
      videoMap[v.id] = v.title;
    }
  }

  const rawFiles = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".txt"));
  const total = rawFiles.length;

  if (total === 0) {
    console.log("No raw transcripts found. Run lionheart-transcribe.py first.");
    process.exit(0);
  }

  console.log(`Cleaning ${total} sermon transcripts via Claude haiku...\n`);

  let done = 0;
  let skipped = 0;
  let failed = [];

  for (let i = 0; i < rawFiles.length; i++) {
    const filename = rawFiles[i];
    const vidId = filename.replace(".txt", "");
    const outFile = path.join(CLEANED_DIR, `${vidId}.md`);

    // Resume: skip already cleaned
    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 200) {
      skipped++;
      continue;
    }

    const rawPath = path.join(RAW_DIR, filename);
    const rawText = fs.readFileSync(rawPath, "utf-8");

    // Extract title from file header
    const titleMatch = rawText.match(/^TITLE: (.+)/m);
    const title = titleMatch ? titleMatch[1] : (videoMap[vidId] || vidId);

    console.log(`[${i + 1}/${total}] ${title.slice(0, 70)}...`);

    try {
      const cleaned = await cleanTranscript(client, rawText, title);

      // Write cleaned notes
      fs.writeFileSync(outFile, cleaned, "utf-8");

      // Categorize and copy to series folder
      const series = detectSeries(title, cleaned);
      const seriesDir = path.join(SERIES_DIR, series);
      fs.mkdirSync(seriesDir, { recursive: true });

      const seriesFile = path.join(seriesDir, `${vidId}.md`);
      fs.copyFileSync(outFile, seriesFile);

      console.log(`  → ${series}`);
      done++;

      await sleep(1200); // ~50 requests/min stay safe
    } catch (err) {
      console.error(`  ERROR: ${vidId} — ${err.message}`);
      failed.push({ id: vidId, title, error: err.message });
      await sleep(2000);
    }
  }

  console.log(`\nDone.`);
  console.log(`  Cleaned:  ${done}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed.length}`);

  if (failed.length > 0) {
    const failedLog = path.join(BASE_DIR, "clean-failed.txt");
    const lines = failed.map((f) => `[${f.id}] ${f.title}\n  Error: ${f.error}`).join("\n\n");
    fs.writeFileSync(failedLog, lines, "utf-8");
    console.log(`  Failed log: ${failedLog}`);
  }

  // Build series index
  buildSeriesIndex();
}

function buildSeriesIndex() {
  const indexPath = path.join(BASE_DIR, "series-index.json");
  const index = {};

  for (const seriesName of Object.keys(SERIES_FOLDERS).concat(["standalone"])) {
    const seriesDir = path.join(SERIES_DIR, seriesName);
    if (!fs.existsSync(seriesDir)) continue;

    const files = fs.readdirSync(seriesDir).filter((f) => f.endsWith(".md"));
    index[seriesName] = files.map((f) => {
      const content = fs.readFileSync(path.join(seriesDir, f), "utf-8");
      const titleMatch = content.match(/^# (.+)/m);
      return {
        id: f.replace(".md", ""),
        title: titleMatch ? titleMatch[1] : f,
        file: `series/${seriesName}/${f}`,
      };
    });
  }

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");
  console.log(`\nSeries index saved: ${indexPath}`);

  // Print summary
  console.log("\nSeries breakdown:");
  for (const [series, items] of Object.entries(index)) {
    if (items.length > 0) {
      console.log(`  ${series}: ${items.length} sermons`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
