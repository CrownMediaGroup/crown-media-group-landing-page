# Directive 16 — 2026-03-17T16:08:57.760Z

DIRECTIVE 016 | CC → CLAUDE CODE | 2026-03-17 | PRIORITY: CRITICAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MISSION: Make start-all.bat fully automatic on boot
with no flashing windows. Fix the git LF/CRLF warning.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK 1 — CONVERT start-all.bat TO WINDOWS TASK SCHEDULER
The registry Run key shows a CMD window on boot.
Replace it with a silent Windows Task Scheduler entry.

Run:
powershell -Command "
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c C:\Users\ldavi\Documents\AllGloryAgency\tools\start-all.bat' -WorkingDirectory 'C:\Users\ldavi\Documents\AllGloryAgency\tools'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -Hidden -ExecutionTimeLimit (New-TimeSpan -Minutes 0) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'CrownMediaGroup-Bridge' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host 'Task registered'
"

Then remove the old registry entry:
powershell -Command "Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'CrownMediaGroup' -ErrorAction SilentlyContinue; Write-Host 'Registry entry removed'"

Verify task exists:
powershell -Command "Get-ScheduledTask -TaskName 'CrownMediaGroup-Bridge' | Select-Object TaskName, State"

Report: Task Scheduler entry created Y/N

TASK 2 — UPDATE start-all.bat TO RUN SILENTLY
Rewrite tools/start-all.bat to start all services
in hidden windows with no visible CMD popups:

@echo off
start /b "" "C:\Users\ldavi\Documents\AllGloryAgency\tools\bridge\node_bridge_runner.vbs"
start /b "n8n" cmd /c "n8n > nul 2>&1"

Then create tools/bridge/node_bridge_runner.vbs:
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d C:\Users\ldavi\Documents\AllGloryAgency\tools\bridge && :loop && node bridge-server.js && goto loop", 0, False

This VBS script launches the bridge invisibly in the background.

Report: VBS created Y/N | start-all.bat updated Y/N

TASK 3 — FIX GIT LF/CRLF WARNINGS PERMANENTLY
Run:
cd C:\Users\ldavi\Documents\AllGloryAgency
git config core.autocrlf true
git config core.safecrlf false

Create .gitattributes at project root:
* text=auto eol=crlf
*.bat text eol=crlf
*.sh text eol=lf
*.js text eol=lf
*.json text eol=lf
*.md text eol=lf
*.html text eol=lf
*.sql text eol=lf
*.py text eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.pdf binary

This eliminates ALL LF/CRLF warnings permanently.

Run:
git add .gitattributes
git add --renormalize .

Report: .gitattributes created Y/N | warnings gone Y/N

TASK 4 — COMMIT AND PUSH
git add -A
bash tools/pre-commit-check.sh
git commit -m "Directive 016 — silent auto-startup + git LF fix"
git push origin master

TASK 5 — WRITE REPORT
Write to Agency/ops/notes/CC-LATEST-REPORT.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIRECTIVE 016 — STATUS REPORT
TASK 1 (Task Scheduler): [Y/N]
TASK 2 (Silent VBS + bat): [Y/N]
TASK 3 (LF/CRLF fix): [Y/N]
TASK 4 (Commit): [hash]
AWAITING: CC READ VIA BRIDGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
