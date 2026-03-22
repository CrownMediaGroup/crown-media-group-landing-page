@echo off
start /b "" "C:\Users\ldavi\Documents\AllGloryAgency\tools\bridge\node_bridge_runner.vbs"
start /b "n8n" cmd /c "n8n > nul 2>&1"
start /b "session-open" cmd /c "node C:\Users\ldavi\Documents\AllGloryAgency\tools\bridge\session-open.js > nul 2>&1"
