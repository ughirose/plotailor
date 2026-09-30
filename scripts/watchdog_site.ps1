[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Port = 8080
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PSScriptRoot }
$PlotailorRoot = Split-Path -Parent $ScriptDir
$SitePath = Join-Path $PlotailorRoot "dist"
$LogPath = Join-Path $ScriptDir "watchdog.log"
$CheckIntervalSec = 30

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
        $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*@worldcraft/editor*" -or $_.CommandLine -like "*vite*" -or $_.CommandLine -like "*http.server*$Port*" }
        foreach ($p in $procs) {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        }
        $tcp = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($pidToKill in $tcp) {
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

function Start-Server {
    try {
        $pnpm = (Get-Command pnpm.cmd -ErrorAction SilentlyContinue).Source
        if ($pnpm) {
            Log-Message "Plotailor 開発サーバー（Vite / ポート $Port）を起動します..."
            $plotailorDir = Split-Path -Parent $ScriptDir
            $workspaceDir = Split-Path -Parent $plotailorDir
            Start-Process -FilePath $pnpm -ArgumentList "--filter @worldcraft/editor dev" -WorkingDirectory $workspaceDir -WindowStyle Hidden
            Start-Sleep -Milliseconds 1500
        } else {
            Log-Message "HTTPサーバー（ポート $Port）を起動します... [Python: $PythonPath, 配信: $SitePath]"
            $arg = "-m http.server $Port --bind 0.0.0.0 -d `"$SitePath`""
            Start-Process -FilePath $PythonPath -ArgumentList $arg -WindowStyle Hidden
            Start-Sleep -Milliseconds 800
        }
    } catch {
        Log-Message "【サーバー起動エラー】$($_.Exception.Message)"
    }
}

function Test-ServerAlive {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $asyncResult = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $wait = $asyncResult.AsyncWaitHandle.WaitOne(600, $false)
        if (-not $wait) {
            $client.Close()
            return $false
        }
        $client.EndConnect($asyncResult)
        $client.Close()
        return $true
    } catch {
        try { $client.Close() } catch {}
        return $false
    }
}

try {
    Log-Message "=== Plotailor サイト死活監視サービスを開始しました ==="

    while ($true) {
        try {
            $isAlive = Test-ServerAlive
            if (-not $isAlive) {
                Log-Message "【警告】サーバー停止または無応答を検知しました。自動再起動を実行します..."
                Stop-ExistingHttpServer
                Start-Server
                Start-Sleep -Seconds 1
                if (Test-ServerAlive) {
                    Log-Message "【復帰】サーバーの正常起動を確認しました。"
                } else {
                    Log-Message "【エラー】再起動に失敗しました。次回ループで再試行します。"
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
