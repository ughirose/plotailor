@echo off
chcp 65001 > nul
set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PlotailorSiteStartup.vbs"
set "SRC=C:\Users\user\.gemini\antigravity\scratch\worldcraft-workspace\plotailor\scripts\PlotailorSiteStartup.vbs"

echo PC起動時（ログイン時）の自動起動を登録中...
copy /y "%SRC%" "%TARGET%" > nul
echo.
echo [登録完了]
echo 次回PC起動時から、自動的・完全にバックグラウンドでサイトと死活監視が立ち上がります。
timeout /t 3 > nul
exit
