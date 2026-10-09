[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Port = 8080
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PSScriptRoot }
$PlotailorRoot = Split-Path -Parent $ScriptDir
$SitePath = Join-Path $PlotailorRoot "dist"
$LogPath = Join-Path $ScriptDir "watchdog.log"
$CheckIntervalSec = 15

$PythonPath = "python.exe"
try {
    $found = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
    if ($found) { $PythonPath = $found }
} catch {}
if (-not (Test-Path $PythonPath) -and (Test-Path "C:\Python314\python.exe")) {
    $PythonPath = "C:\Python314\python.exe"
}

function Log-Message($msg) {
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    "$timestamp - $msg" | Out-File -FilePath $LogPath -Append -Encoding UTF8
}

function Stop-ExistingHttpServer {
    try {
        # 1. 関連プロセス（Vite, Node, Python http.server）を検出して強制終了
        $procs = Get-CimInstance Win32_Process | Where-Object { 
            ($_.CommandLine -like "*@worldcraft/editor*" -or 
             $_.CommandLine -like "*vite*" -or 
             $_.CommandLine -like "*http.server*$Port*") -and 
            $_.ProcessId -ne $PID
        }
        foreach ($p in $procs) {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
        # 2. ポート8080を直接掴んでいるプロセスを特定して強制終了
        $tcp = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($pidToKill in $tcp) {
            if ($pidToKill -ne $PID) {
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
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
            $plotailorDir = Split-Path -Parent $ScriptDir
            $workspaceDir = Split-Path -Parent $plotailorDir
            Start-Process -FilePath $pnpm -ArgumentList "--filter @worldcraft/editor dev" -WorkingDirectory $workspaceDir -WindowStyle Hidden
            Start-Sleep -Seconds 2
        } else {
            Log-Message "HTTPサーバー（ポート $Port）を起動します... [Python: $PythonPath, 配信: $SitePath]"
            $arg = "-m http.server $Port --bind 0.0.0.0 -d `"$SitePath`""
            Start-Process -FilePath $PythonPath -ArgumentList $arg -WindowStyle Hidden
            Start-Sleep -Seconds 1
        }
    } catch {
        Log-Message "【サーバー起動エラー】$($_.Exception.Message)"
    }
}

# HTTP レスポンス（200 OK）による高精度死活監視（サイレントハング対策）
function Test-ServerAlive {
    try {
        $req = [System.Net.WebRequest]::Create("http://127.0.0.1:$Port/app.html")
        $req.Timeout = 2500
        $req.Method = "HEAD"
        $res = $req.GetResponse()
        $status = [int]$res.StatusCode
        $res.Close()
        return ($status -ge 200 -and $status -lt 400)
    } catch {
        # HEAD 非対応等の場合は GET にフォールバック
        try {
            $req2 = [System.Net.WebRequest]::Create("http://127.0.0.1:$Port/app.html")
            $req2.Timeout = 2500
            $req2.Method = "GET"
            $res2 = $req2.GetResponse()
            $status2 = [int]$res2.StatusCode
            $res2.Close()
            return ($status2 -ge 200 -and $status2 -lt 400)
        } catch {
            return $false
        }
    }
}

try {
    Log-Message "=== Plotailor サイト常時監視サービスを開始しました（HTTP死活監視有効） ==="

    while ($true) {
        try {
            $isAlive = Test-ServerAlive
            if (-not $isAlive) {
                Log-Message "【警告】サーバー停止またはサイレントハングを検知しました。強制クリーンアップ＆再起動を実行します..."
                Start-Server
                Start-Sleep -Seconds 2
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
