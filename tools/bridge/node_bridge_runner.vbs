Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d C:\Users\ldavi\Documents\AllGloryAgency\tools\bridge && node bridge-server.js", 0, False
WshShell.Run "cmd /c cd /d C:\Users\ldavi\Documents\AllGloryAgency\tools\bridge && node directive-executor.js", 0, False
