@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo  Plotailor 執筆サイト 起動＆自動監視ランチャー
echo ======================================================
echo.

echo 1. ポート8080の既存ゾンビプロセスを事前クリーンアップ中...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$procs = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach($p in $procs){ Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }"

echo 2. バックグラウンド常時監視・自動復旧サービスを起動中...
wscript.exe "%~dp0PlotailorSiteStartup.vbs"

echo.
echo 3. サーバーの起動と HTTP 200 OK 応答を確認中...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$retry=0; $success=$false; while($retry -lt 30){ try { $req=[System.Net.WebRequest]::Create('http://127.0.0.1:8080/app.html'); $req.Timeout=1000; $res=$req.GetResponse(); if([int]$res.StatusCode -eq 200){ $res.Close(); $success=$true; break } $res.Close() } catch{} Start-Sleep -Milliseconds 400; $retry++ }; if(-not $success){ exit 1 }"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 【警告】サーバーの起動応答がタイムアウトしました。
    echo watchdog.log を確認してください。
    pause
    exit /b 1
)

echo.
echo [起動成功]
echo Local:   http://localhost:8080/app.html
echo.
echo ブラウザで開きます...
start http://localhost:8080/app.html
timeout /t 2 > nul
exit
