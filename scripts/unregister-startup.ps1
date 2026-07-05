$ErrorActionPreference = "Stop"

$TaskName = "FootballPredictionPlatform"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Unregistered scheduled task: $TaskName"
} else {
  Write-Host "Scheduled task does not exist: $TaskName"
}
