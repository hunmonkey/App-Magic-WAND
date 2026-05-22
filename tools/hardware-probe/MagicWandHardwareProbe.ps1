$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$dllPath = Join-Path $PSScriptRoot 'LibreHardwareMonitorLib.dll'
if (-not (Test-Path -LiteralPath $dllPath)) {
  throw "LibreHardwareMonitorLib.dll 파일을 찾지 못했습니다."
}

[System.AppDomain]::CurrentDomain.add_AssemblyResolve({
  param($sender, $eventArgs)

  $assemblyName = [System.Reflection.AssemblyName]::new($eventArgs.Name)
  $localPath = Join-Path $PSScriptRoot "$($assemblyName.Name).dll"
  if (Test-Path -LiteralPath $localPath) {
    return [System.Reflection.Assembly]::LoadFrom($localPath)
  }

  return $null
})

Add-Type -Path $dllPath

$computer = [LibreHardwareMonitor.Hardware.Computer]::new()
$computer.IsCpuEnabled = $true
$computer.IsGpuEnabled = $true
$computer.IsMemoryEnabled = $true
$computer.IsMotherboardEnabled = $true
$computer.IsControllerEnabled = $true
$computer.IsNetworkEnabled = $false
$computer.IsStorageEnabled = $false
$computer.Open()

$script:sensors = @()

function Read-HardwareSensors($hardware) {
  if ($null -eq $hardware) {
    return
  }

  $hardware.Update()

  foreach ($sensor in $hardware.Sensors) {
    if ($null -eq $sensor.Value) {
      continue
    }

    $script:sensors += [pscustomobject]@{
      hardwareName = [string]$hardware.Name
      hardwareType = [string]$hardware.HardwareType
      name = [string]$sensor.Name
      type = [string]$sensor.SensorType
      value = [double]$sensor.Value
    }
  }

  foreach ($subHardware in $hardware.SubHardware) {
    Read-HardwareSensors $subHardware
  }
}

try {
  foreach ($hardware in $computer.Hardware) {
    Read-HardwareSensors $hardware
  }

  [pscustomobject]@{
    sensors = $script:sensors
  } | ConvertTo-Json -Depth 5
} finally {
  $computer.Close()
}
