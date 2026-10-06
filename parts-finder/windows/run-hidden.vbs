' Starts Parts Finder in the background with no visible window.
' Used by the Startup shortcut so the app runs automatically on login.
Dim fso, sh, appFolder
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

' This script lives in parts-finder\windows\ ; the app folder is its parent.
appFolder = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = appFolder

' 0 = hidden window, False = don't wait. Node must be installed (in PATH).
sh.Run "cmd /c node src\server.js", 0, False
