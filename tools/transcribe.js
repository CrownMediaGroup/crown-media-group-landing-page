// transcribe.js
// Extracts audio from video then transcribes it using Whisper
// Usage: node tools/transcribe.js path/to/video.mp4
// Requires: ffmpeg and whisper installed

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const input = process.argv[2];

if (!input) {
  console.log('Usage: node tools/transcribe.js path/to/video.mp4');
  process.exit(1);
}

const audioFile = input.replace(/\.[^.]+$/, '') + '-audio.mp3';

console.log('Extracting audio...');
execSync(`ffmpeg -i "${input}" -q:a 0 -map a "${audioFile}" -y`);

console.log('Transcribing with Whisper (small model)...');
execSync(`whisper "${audioFile}" --model small --language English --output_format txt`, { stdio: 'inherit' });

console.log('Done. Check the .txt file in the same folder.');

// Cleanup audio file
fs.unlinkSync(audioFile);
