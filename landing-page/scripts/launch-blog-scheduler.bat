@echo off
title Crown Media Blog Scheduler (4 posts/day)
echo [Blog Scheduler] Starting — 6am, 10am, 2pm, 6pm daily. Saturday skipped.
cd /d "%~dp0\.."
node scripts/blog-scheduler.js
pause
