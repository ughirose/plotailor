@echo off
chcp 65001 > nul
set "TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PlotailorSiteStartup.vbs"

echo PC起動時の自動起動設定を解除中...
if exist "%TARGET%" del /f /q "%TARGET%"
echo.
echo [解除完了] 自動起動をオフにしました。
timeout /t 3 > nul
exit
