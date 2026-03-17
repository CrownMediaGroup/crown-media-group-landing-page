@echo off
REM compress-video.bat
REM Compresses a video for Instagram/Reels upload
REM Usage: drag a video file onto this script OR run: compress-video.bat input.mp4

set INPUT=%1
if "%INPUT%"=="" (
    echo Drag a video file onto this script or pass it as an argument.
    pause
    exit
)

set OUTPUT=%~n1-compressed.mp4

echo Compressing %INPUT% to %OUTPUT%...
ffmpeg -i "%INPUT%" -vcodec libx264 -crf 23 -preset fast -acodec aac -b:a 128k "%OUTPUT%"

echo Done: %OUTPUT%
pause
