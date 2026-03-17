@echo off
REM download-video.bat
REM Downloads any YouTube, Instagram, TikTok, Facebook video
REM Usage: drag this file, run it, paste URL when prompted

set /p URL="Paste video URL: "
echo Downloading...
yt-dlp "%URL%"
echo Done. Check this folder.
pause
