@echo off
chcp 65001 > nul
echo Plotailor サイトサーバーおよび死活監視プロセスを停止中...

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process -Name powershell -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*watchdog_site.ps1*' } | Stop-Process -Force -ErrorAction SilentlyContinue; $p = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach($pidToKill in $p){ Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue }"

echo 停止しました。
timeout /t 2 > nul
exit
