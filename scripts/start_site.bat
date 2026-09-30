@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo  Plotailor 作家向けサイト ＆ 自動死活監視ランチャー
echo ======================================================
echo.
echo バックグラウンドで死活監視・自動再起動サービスを起動します...

wscript.exe "%~dp0PlotailorSiteStartup.vbs"

echo.
echo サーバーの起動を確認中...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$retry=0; while($retry -lt 20){ $c = New-Object System.Net.Sockets.TcpClient; try { $a = $c.BeginConnect('127.0.0.1', 8080, $null, $null); if($a.AsyncWaitHandle.WaitOne(300, $false)){ $c.EndConnect($a); $c.Close(); break } } catch{} try{$c.Close()}catch{}; Start-Sleep -Milliseconds 200; $retry++ }"

echo.
echo [起動完了]
echo Local:   http://localhost:8080/
echo.
echo ブラウザで開きます...
start http://localhost:8080/
ping 127.0.0.1 -n 3 > nul
exit
