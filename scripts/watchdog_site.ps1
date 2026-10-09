[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Port = 8080
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PSScriptRoot }
$PlotailorRoot = Split-Path -Parent $ScriptDir
$WorkspaceDir = Split-Path -Parent $PlotailorRoot
$SitePath = Join-Path $PlotailorRoot "dist"
$LogPath = Join-Path $ScriptDir "watchdog.log"
$CheckIntervalSec = 15

function Log-Message($msg) {
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    "$timestamp - $msg" | Out-File -FilePath $LogPath -Append -Encoding UTF8
}

function Stop-ExistingHttpServer {
    try {
        # ポート8080を直接リッスンしているプロセスを特定して強制終了
        $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($connections) {
            $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($p in $pids) {
                if ($p -and $p -ne $PID) {
                    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                }
            }
        }
        Start-Sleep -Milliseconds 500
    } catch {
        Log-Message "プロセス終了時の警告: $($_.Exception.Message)"
    }
}

function Start-Server {
    try {
        Stop-ExistingHttpServer
        $pnpm = (Get-Command pnpm.cmd -ErrorAction SilentlyContinue).Source
        if ($pnpm) {
            Log-Message "Plotailor 開発サーバー（Vite / ポート $Port）を起動します..."
            Start-Process -FilePath $pnpm -ArgumentList "--filter @worldcraft/editor dev" -WorkingDirectory $WorkspaceDir -WindowStyle Hidden
            Start-Sleep -Seconds 3
        } else {
            Log-Message "HTTPサーバー（ポート $Port）をPythonで起動します..."
            $python = "python.exe"
            Start-Process -FilePath $python -ArgumentList "-m http.server $Port --bind 0.0.0.0 -d `"$SitePath`"" -WorkingDirectory $PlotailorRoot -WindowStyle Hidden
            Start-Sleep -Seconds 2
        }
    } catch {
        Log-Message "【サーバー起動エラー】$($_.Exception.Message)"
    }
}

function Test-ServerAlive {
    $alive = $false
    try {
        $req = [System.Net.WebRequest]::Create("http://127.0.0.1:$Port/app.html")
        $req.Timeout = 2000
        $res = $req.GetResponse()
        if ($res) {
            $status = [int]$res.StatusCode
            $res.Close()
            if ($status -ge 200 -and $status -lt 400) {
                $alive = $true
            }
        }
    } catch {
        $alive = $false
    }
    return $alive
}

try {
    Log-Message "=== Plotailor サイト常時監視サービスを開始しました（HTTP死活監視有効） ==="

    while ($true) {
        try {
            $isAlive = Test-ServerAlive
            if (-not $isAlive) {
                Log-Message "【警告】サーバー停止またはサイレントハングを検知しました。再起動を実行します..."
                Start-Server
                Start-Sleep -Seconds 3
                if (Test-ServerAlive) {
                    Log-Message "【復元】サーバーの正常稼働（HTTP 200 OK）を確認しました。"
                } else {
                    Log-Message "【エラー】再起動直後のHTTP応答確認に失敗しました。次回ループで再試行します。"
                }
            }
        } catch {
            Log-Message "【監視ループ例外】$($_.Exception.Message)"
        }
        Start-Sleep -Seconds $CheckIntervalSec
    }
} catch {
    Log-Message "【致命的スクリプトエラー】$($_.Exception.ToString())"
}
