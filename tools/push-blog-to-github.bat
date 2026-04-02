@echo off
title Crown Media Group — Push Blog to GitHub
echo.
echo ========================================
echo  Pushing Auto-Blog System to GitHub
echo ========================================
echo.

set REPO=C:\Users\ldavi\Documents\AllGloryAgency
cd /d "%REPO%"

:: Step 1 — Kill the index lock if VS Code left one
if exist "%REPO%\.git\index.lock" (
    echo [1/5] Removing stale git lock...
    del /f "%REPO%\.git\index.lock"
    echo       Done.
) else (
    echo [1/5] No lock file. Good.
)

:: Step 2 — Reset the bad "test" commit (keep all files)
echo [2/5] Resetting bad test commit...
git reset HEAD~1
echo       Done.

:: Step 3 — Stage all blog system files
echo [3/5] Staging blog files...
git add landing-page/scripts/blog-researcher.js
git add landing-page/scripts/blog-writer.js
git add landing-page/scripts/blog-distributor.js
git add landing-page/scripts/blog-admin-server.js
git add landing-page/scripts/blog-scheduler.js
git add landing-page/scripts/blog-social-promoter.js
git add landing-page/package.json
git add landing-page/content/blog/topics-queue.json
git add landing-page/ai-tools.html
git add .github/workflows/auto-blog.yml
git add Agency/products/auto-blogger-service/
git add tools/start-all.bat
echo       Done.

:: Step 4 — Commit
echo [4/5] Committing...
git commit -m "feat: auto-blog engine — 4x daily AI content, researcher, distributor, AI Content Engine page"
echo       Done.

:: Step 5 — Push
echo [5/5] Pushing to GitHub...
git push
echo.

if %errorlevel%==0 (
    echo ========================================
    echo  SUCCESS — Auto-blog is now LIVE!
    echo  GitHub Actions will post 4x daily.
    echo  Website rebuild triggered via Netlify.
    echo ========================================
) else (
    echo ========================================
    echo  Push failed — check credentials above
    echo  Open VS Code terminal and run: git push
    echo ========================================
)

echo.
pause
