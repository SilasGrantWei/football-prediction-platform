param(
  [ValidateSet("all", "api", "web")]
  [string]$Service = "all",
  [switch]$OpenBrowser,
  [switch]$KeepAlive,
  [int]$StartupDelaySeconds = 0
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $ProjectRoot "logs"
$StartupLog = Join-Path $LogDir "startup.log"
$ApiPort = 4000
$WebPort = 3000
$RequiredApiFeatureVersion = "2026-07-07-beijing-day-real-bracket-v3"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-StartupLog {
  param([string]$Message)
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -LiteralPath $StartupLog -Value $line -Encoding UTF8
  Write-Host $Message
}

function Test-ListeningPort {
  param([int]$Port)
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  return [bool]$connection
}

function Wait-ListeningPort {
  param(
    [int]$Port,
    [int]$Seconds = 45
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-ListeningPort -Port $Port) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Wait-HttpReady {
  param(
    [string]$Url,
    [int]$Seconds = 90
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    $statusCode = Get-HttpStatusCode -Url $Url -TimeoutMilliseconds 3000
    if ($statusCode -and $statusCode -ge 200 -and $statusCode -lt 500) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Wait-WebReady {
  param([int]$Seconds = 90)

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-WebReady) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Test-HttpReady {
  param([string]$Url)

  $statusCode = Get-HttpStatusCode -Url $Url -TimeoutMilliseconds 3000
  return $statusCode -and $statusCode -ge 200 -and $statusCode -lt 500
}

function Test-WebReady {
  $html = Get-Text -Url "http://127.0.0.1:$WebPort/dashboard" -TimeoutMilliseconds 5000
  if (-not $html) {
    return $false
  }

  $cssMatches = [Regex]::Matches($html, "_next/static/[^`"'<>\s]+\.css")
  if ($cssMatches.Count -eq 0) {
    return $false
  }

  foreach ($match in $cssMatches) {
    $assetUrl = "http://127.0.0.1:$WebPort/$($match.Value)"
    $statusCode = Get-HttpStatusCode -Url $assetUrl -TimeoutMilliseconds 5000
    if (-not $statusCode -or $statusCode -lt 200 -or $statusCode -ge 400) {
      return $false
    }
  }

  $detailHtml = Get-Text -Url "http://127.0.0.1:$WebPort/match/r16-094" -TimeoutMilliseconds 10000
  if (-not $detailHtml -or $detailHtml -notmatch "1-4") {
    return $false
  }

  return $true
}

function Test-ApiFeatureReady {
  $health = Get-Json -Url "http://127.0.0.1:$ApiPort/health" -TimeoutMilliseconds 3000
  if (-not $health -or -not $health.features) {
    return $false
  }

  return $health.features.lineupValidationRefresh -eq $true -and $health.features.apiFeatureVersion -eq $RequiredApiFeatureVersion
}

function Get-Json {
  param(
    [string]$Url,
    [int]$TimeoutMilliseconds = 3000
  )

  try {
    $request = [System.Net.WebRequest]::Create($Url)
    $request.Method = "GET"
    $request.Timeout = $TimeoutMilliseconds
    $request.ReadWriteTimeout = $TimeoutMilliseconds
    $response = $request.GetResponse()
    try {
      $stream = $response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
      try {
        $text = $reader.ReadToEnd()
        return $text | ConvertFrom-Json
      } finally {
        $reader.Close()
      }
    } finally {
      $response.Close()
    }
  } catch {
    return $null
  }
}

function Get-Text {
  param(
    [string]$Url,
    [int]$TimeoutMilliseconds = 3000
  )

  try {
    $request = [System.Net.WebRequest]::Create($Url)
    $request.Method = "GET"
    $request.Timeout = $TimeoutMilliseconds
    $request.ReadWriteTimeout = $TimeoutMilliseconds
    $response = $request.GetResponse()
    try {
      $stream = $response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
      try {
        return $reader.ReadToEnd()
      } finally {
        $reader.Close()
      }
    } finally {
      $response.Close()
    }
  } catch {
    return $null
  }
}

function Get-HttpStatusCode {
  param(
    [string]$Url,
    [int]$TimeoutMilliseconds = 3000
  )

  try {
    $request = [System.Net.WebRequest]::Create($Url)
    $request.Method = "GET"
    $request.Timeout = $TimeoutMilliseconds
    $request.ReadWriteTimeout = $TimeoutMilliseconds
    $response = $request.GetResponse()
    try {
      return [int]$response.StatusCode
    } finally {
      $response.Close()
    }
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) {
      $response = $_.Exception.Response
      try {
        return [int]$response.StatusCode
      } finally {
        $response.Close()
      }
    }
    return $null
  } catch {
    return $null
  }
}

function Stop-ListenerOnPort {
  param([int]$Port)

  $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($owner in $owners) {
    if ($owner -and $owner -ne $PID) {
      Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
    }
  }
}

function Stop-DuplicateKeepAliveSupervisors {
  $escapedRoot = [Regex]::Escape($ProjectRoot)
  $escapedScript = [Regex]::Escape($PSCommandPath)
  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -and
      $_.CommandLine -match "start-local\.ps1" -and
      $_.CommandLine -match "-KeepAlive" -and
      (
        $_.CommandLine -match $escapedRoot -or
        $_.CommandLine -match $escapedScript -or
        $_.CommandLine -match "scripts[/\\]start-local\.ps1"
      )
    }

  foreach ($process in $processes) {
    Write-StartupLog "Stopping duplicate keep-alive supervisor $($process.ProcessId)."
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-StaleApiProcesses {
  $escapedRoot = [Regex]::Escape($ProjectRoot)
  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -and
      $_.CommandLine -match $escapedRoot -and
      (
        $_.CommandLine -match "start-local\.ps1.+-Service api" -or
        $_.CommandLine -match "DEMO_MODE=true API_PORT=4000" -or
        $_.CommandLine -match "services[/\\]api" -or
        $_.CommandLine -match "src[/\\]index\.ts" -or
        $_.CommandLine -match "tsx(.+watch)? .+src[/\\]index\.ts"
      )
    }

  foreach ($process in $processes) {
    Write-StartupLog "Stopping stale API process $($process.ProcessId)."
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-StaleWebProcesses {
  $escapedRoot = [Regex]::Escape($ProjectRoot)
  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -and
      $_.CommandLine -match $escapedRoot -and
      (
        $_.CommandLine -match "start-local\.ps1.+-Service web" -or
        $_.CommandLine -match 'next[\\/\\]dist[\\/\\]bin[\\/\\]next"? (dev|start)' -or
        $_.CommandLine -match 'next[\\/\\]dist[\\/\\]server[\\/\\]lib[\\/\\]start-server\.js'
      )
    }

  foreach ($process in $processes) {
    Write-StartupLog "Stopping stale web process $($process.ProcessId)."
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Test-WebProductionBuild {
  return Test-Path (Join-Path $ProjectRoot "apps\web\.next\BUILD_ID")
}

function Ensure-WebProductionBuild {
  if (Test-WebProductionBuild) {
    return $true
  }

  Write-StartupLog "Web production build is missing. Building web app once."
  Push-Location $ProjectRoot
  try {
    npm run build -w apps/web *> (Join-Path $LogDir "web-build.log")
    return ($LASTEXITCODE -eq 0) -and (Test-WebProductionBuild)
  } finally {
    Pop-Location
  }
}

function Assert-NodeRuntime {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is not available in PATH. Install Node.js or open a shell where npm works."
  }
}

function Ensure-Dependencies {
  if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
    Push-Location $ProjectRoot
    try {
      npm install
    } finally {
      Pop-Location
    }
  }
}

function Invoke-Api {
  Push-Location $ProjectRoot
  try {
    $env:DEMO_MODE = "true"
    $env:API_PORT = "$ApiPort"
    $env:CORS_ORIGIN = "http://localhost:$WebPort,http://127.0.0.1:$WebPort"
    npm run serve:local -w services/api *> (Join-Path $LogDir "api.log")
  } finally {
    Pop-Location
  }
}

function Invoke-Web {
  Push-Location $ProjectRoot
  try {
    $env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:$ApiPort"
    $env:NEXT_PUBLIC_WS_URL = "ws://127.0.0.1:$ApiPort/ws/live"
    $env:API_BASE_URL = "http://127.0.0.1:$ApiPort"
    if (Ensure-WebProductionBuild) {
      npm run start -w apps/web *> (Join-Path $LogDir "web.log")
    } else {
      Write-StartupLog "Web production build failed. Falling back to Next.js development server."
      npm run dev -w apps/web *> (Join-Path $LogDir "web.log")
    }
  } finally {
    Pop-Location
  }
}

function Start-ApiIfNeeded {
  if ((Test-HttpReady -Url "http://127.0.0.1:$ApiPort/health") -and (Test-ApiFeatureReady)) {
    return
  }

  if (Test-ListeningPort -Port $ApiPort) {
    Write-StartupLog "API port $ApiPort is occupied but the health or feature check failed. Restarting listener."
    Stop-ListenerOnPort -Port $ApiPort
    Start-Sleep -Seconds 2
  }

  Stop-StaleApiProcesses
  Write-StartupLog "Starting API service on port $ApiPort."
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-Service", "api") `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden
}

function Start-WebIfNeeded {
  if (Test-WebReady) {
    return
  }

  if (Test-ListeningPort -Port $WebPort) {
    Write-StartupLog "Web port $WebPort is occupied but dashboard or CSS asset check failed. Restarting listener."
    Stop-ListenerOnPort -Port $WebPort
    Start-Sleep -Seconds 2
  }

  Stop-StaleWebProcesses
  Write-StartupLog "Starting web service on port $WebPort."
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-Service", "web") `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden
}

if ($Service -eq "api") {
  Invoke-Api
  exit
}

if ($Service -eq "web") {
  Invoke-Web
  exit
}

Assert-NodeRuntime
Ensure-Dependencies

if ($StartupDelaySeconds -gt 0) {
  Write-StartupLog "Startup delay: $StartupDelaySeconds seconds."
  Start-Sleep -Seconds $StartupDelaySeconds
}

if ($KeepAlive) {
  Stop-DuplicateKeepAliveSupervisors
}

Start-ApiIfNeeded
$apiReady = Wait-HttpReady -Url "http://127.0.0.1:$ApiPort/health" -Seconds 90
Start-WebIfNeeded

$webReady = Wait-WebReady -Seconds 90
$apiStatus = if ($apiReady) { "ready" } else { "not ready" }
$webStatus = if ($webReady) { "ready" } else { "not ready" }

Write-StartupLog "Football prediction platform startup status:"
Write-StartupLog "  API  http://localhost:$ApiPort/health  $apiStatus"
Write-StartupLog "  Web  http://localhost:$WebPort/dashboard  $webStatus"
Write-StartupLog "  Logs $LogDir"

if ($OpenBrowser -and $webReady) {
  Start-Process "http://localhost:$WebPort/dashboard"
}

if (-not ($apiReady -and $webReady)) {
  exit 1
}

if ($KeepAlive) {
  Write-StartupLog "Keep-alive supervisor is running."
  while ($true) {
    try {
      Start-ApiIfNeeded
      Wait-HttpReady -Url "http://127.0.0.1:$ApiPort/health" -Seconds 20 | Out-Null
      Start-WebIfNeeded
      Wait-WebReady -Seconds 20 | Out-Null
    } catch {
      Write-StartupLog "Keep-alive check failed: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 30
  }
}
