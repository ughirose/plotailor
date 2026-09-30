@echo off
setlocal
cd /d "%~dp0"

echo Plotailor サイトサーバーおよび死活監視プロセスを停止中...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*watchdog_site.ps1*' -or $_.CommandLine -like '*http.server*8080*' }; foreach($p in $procs){ Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }"

echo 停止しました。
ping 127.0.0.1 -n 3 > nul
exit
