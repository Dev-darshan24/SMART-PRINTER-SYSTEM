Set WshShell = CreateObject("WScript.Shell")
' Replace the path below with the actual path to your QR-Print folder
strPath = "c:\Users\BeatsVibe\Downloads\IdeaLab_Projects\QR-Print"

WshShell.Run "cmd.exe /c cd /d """ & strPath & """ && node client.js", 0, False 
