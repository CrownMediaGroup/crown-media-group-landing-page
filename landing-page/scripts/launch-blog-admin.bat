@echo off
title Crown Media Blog Admin
echo [Blog Admin] Starting...
cd /d "%~dp0\.."
node scripts/blog-admin-server.js
pause
