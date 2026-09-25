@echo off
chcp 65001 > nul
set "SCRIPTPATH=C:\Users\user\.gemini\antigravity\scratch\worldcraft-workspace\plotailor\scripts\watchdog_site.ps1"

echo ======================================================
echo  Plotailor 作家向けサイト ＆ 自動死活監視ランチャー
echo ======================================================
echo.
echo バックグラウンドで死活監視・自動再起動サービスを起動します...

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SCRIPTPATH%"

echo.
echo [起動完了]
echo LAN URL: http://192.168.1.200:8080/
echo Local:   http://localhost:8080/
echo.
echo ブラウザで開きます...
start http://localhost:8080/
exit
