@echo off
cd /d C:\Users\ldavi\Documents\AllGloryAgency\tools\crm
start cmd /k node server.js
timeout /t 2 /nobreak
start chrome http://localhost:3001
