$Port = 8080
$SitePath = "C:\Users\user\.gemini\antigravity\scratch\worldcraft-workspace\plotailor\public\site"
$LogPath = "C:\Users\user\.gemini\antigravity\scratch\worldcraft-workspace\plotailor\scripts\watchdog.log"
$CheckIntervalSec = 30

function Log-Message($msg) {
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    "$timestamp - $msg" | Out-File -FilePath $LogPath -Append -Encoding UTF8
    Write-Host "$timestamp - $msg"
}

function Start-Server {
    Log-Message "HTTPサーバー（ポート $Port）を起動します..."
    Start-Process -FilePath "python.exe" -ArgumentList "-m http.server $Port --bind 0.0.0.0" -WorkingDirectory $SitePath -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

function Test-ServerAlive {
    try {
        $res = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/index.html" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        return ($res.StatusCode -eq 200)
    } catch {
        return $false
    }
}

Log-Message "=== Plotailor サイト死活監視サービスを開始しました ==="

while ($true) {
    $isAlive = Test-ServerAlive
    if (-not $isAlive) {
        Log-Message "【警告】サーバー停止または無応答を検知しました。自動再起動を実行します..."
        # 既存の残存プロセスを強制クリーンアップ
        $procs = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($pidToKill in $procs) {
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        }
        Start-Server
        Start-Sleep -Seconds 3
        if (Test-ServerAlive) {
            Log-Message "【復帰】サーバーの正常起動を確認しました。"
        } else {
            Log-Message "【エラー】再起動に失敗しました。次回ループで再試行します。"
        }
    }
    Start-Sleep -Seconds $CheckIntervalSec
}
