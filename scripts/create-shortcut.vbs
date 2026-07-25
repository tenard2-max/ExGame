' Create ExGame shortcut with custom icon.
' Usage:
'   cscript //nologo create-shortcut.vbs
'   cscript //nologo create-shortcut.vbs desktop

Option Explicit

Dim fso, shell, scriptDir, projectPath, targetBat, iconPath, shortcutPath, link, arg

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectPath = fso.GetParentFolderName(scriptDir)
targetBat = projectPath & "\auto-run.bat"
iconPath = projectPath & "\branding\exgame.ico"

If Not fso.FileExists(targetBat) Then
  WScript.Echo "실행 파일이 없습니다: " & targetBat
  WScript.Quit 1
End If
If Not fso.FileExists(iconPath) Then
  WScript.Echo "아이콘이 없습니다: " & iconPath
  WScript.Quit 1
End If

shortcutPath = projectPath & "\ExGame.lnk"
If WScript.Arguments.Count >= 1 Then
  arg = LCase(WScript.Arguments(0))
  If arg = "desktop" Then
    shortcutPath = shell.SpecialFolders("Desktop") & "\ExGame.lnk"
  Else
    shortcutPath = WScript.Arguments(0)
  End If
End If

Set link = shell.CreateShortcut(shortcutPath)
link.TargetPath = targetBat
link.WorkingDirectory = projectPath
link.IconLocation = iconPath & ",0"
link.Description = "ExGame 오프라인 실행 (서버 기동 + 브라우저)"
link.WindowStyle = 1
link.Save

WScript.Echo "바로가기 생성: " & shortcutPath
