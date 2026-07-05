param(
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$rootItem = Get-Item -LiteralPath $root

if (-not $OutputPath) {
  $OutputPath = Join-Path $rootItem.Parent.FullName "$($rootItem.Name)-oss.zip"
}

$excludedSegments = @(
  ".git",
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".venv",
  "__pycache__",
  ".pytest_cache",
  ".ruff_cache",
  "logs",
  ".codex-logs"
)

$excludedFiles = @(
  ".env",
  ".env.local"
)

function Test-IncludedPath {
  param([System.IO.FileInfo]$File)

  $relative = Get-RelativePath -BasePath $root -TargetPath $File.FullName
  $segments = $relative -split "[\\/]"

  foreach ($segment in $segments) {
    if ($excludedSegments -contains $segment) {
      return $false
    }
  }

  if ($excludedFiles -contains $File.Name) {
    return $false
  }

  if ($File.Name -like ".env.*" -and $File.Name -ne ".env.example") {
    return $false
  }

  if ($File.Name -like "*.pyc" -or $File.Name -like "*.log" -or $File.Name -like "*.zip") {
    return $false
  }

  return $true
}

function Get-RelativePath {
  param(
    [string]$BasePath,
    [string]$TargetPath
  )

  $baseFullPath = [System.IO.Path]::GetFullPath($BasePath)
  if (-not $baseFullPath.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $baseFullPath += [System.IO.Path]::DirectorySeparatorChar
  }

  $baseUri = [System.Uri]$baseFullPath
  $targetUri = [System.Uri]([System.IO.Path]::GetFullPath($TargetPath))
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace("/", [System.IO.Path]::DirectorySeparatorChar)
}

$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("football-prediction-platform-oss-" + [guid]::NewGuid().ToString("N"))
$stagingProject = Join-Path $stagingRoot $rootItem.Name

New-Item -ItemType Directory -Force -Path $stagingProject | Out-Null

try {
  $files = Get-ChildItem -LiteralPath $root -Recurse -File -Force | Where-Object { Test-IncludedPath $_ }

  foreach ($file in $files) {
    $relative = Get-RelativePath -BasePath $root -TargetPath $file.FullName
    $target = Join-Path $stagingProject $relative
    $targetDir = Split-Path -Parent $target
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target
  }

  if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
  }

  Compress-Archive -Path (Join-Path $stagingRoot $rootItem.Name) -DestinationPath $OutputPath -Force
  Write-Host "Created OSS package: $OutputPath"
  Write-Host "Included files: $($files.Count)"
} finally {
  if ($stagingRoot -and (Test-Path -LiteralPath $stagingRoot)) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
  }
}
