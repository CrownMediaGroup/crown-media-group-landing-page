@echo off
echo [CROWN MEDIA] Starting call system...
start "Cloudflare Tunnel" /min cmd /k "cloudflared tunnel --url http://localhost:4001"
timeout /t 6 /nobreak >nul
echo.
echo [CROWN MEDIA] Tunnel started. Check the Cloudflare Tunnel window for your URL.
echo [CROWN MEDIA] Copy the https://*.trycloudflare.com URL and update .env WEBHOOK_BASE_URL
echo.
echo Ready. Run:
echo   node tools/calls/call-agent.js +19088481436   (test - King)
echo   node tools/calls/call-agent.js +18038650233   (Anointed Cuts)
echo.
pause
