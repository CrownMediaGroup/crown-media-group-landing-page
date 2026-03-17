@echo off
echo Starting ALL Crown Media Group services...
start "CC Bridge" cmd /k "cd /d C:\Users\ldavi\Documents\AllGloryAgency\tools\bridge && node bridge-server.js"
start "Directive Watcher" cmd /k "cd /d C:\Users\ldavi\Documents\AllGloryAgency\tools\bridge && node directive-watcher.js"
start "n8n" cmd /k "n8n"
start "Redis" cmd /k "docker start redis 2>nul || docker run -d -p 6379:6379 --name redis redis:alpine"
echo.
echo All systems started:
echo CC Bridge:  http://localhost:4000
echo n8n:        http://localhost:5678
echo Redis:      localhost:6379
echo.
echo CC can now send directives directly to Claude Code.
