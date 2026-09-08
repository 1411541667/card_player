$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$unityProject = Join-Path $root 'unity'
$version = (Get-Content -Raw (Join-Path $root 'package.json') | ConvertFrom-Json).version
$stage = Join-Path $root "release\unity-stage-$version"
$unityCandidates = @(
  'D:\unity\2022.3.62f3c1\Editor\Unity.exe',
  'C:\Program Files\Unity\Hub\Editor\2022.3.62f3c1\Editor\Unity.exe'
)
$unity = $unityCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $unity) { throw 'Unity 2022.3.62f3c1 was not found. Update the Unity path in this script.' }
$iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue
if (-not $iscc) {
  $isccCandidates = @(
    'C:\Users\14115\AppData\Local\Programs\Inno Setup 7\ISCC.exe',
    'C:\Program Files (x86)\Inno Setup 7\ISCC.exe',
    'C:\Program Files\Inno Setup 7\ISCC.exe'
  )
  $isccPath = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
} else { $isccPath = $iscc.Source }
if (-not $isccPath) { throw 'Inno Setup ISCC.exe was not found.' }
if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
$log = Join-Path $unityProject "Logs\unity-package-$version.log"
$env:UNITY_GAME_VERSION = $version
if (Test-Path $log) { Remove-Item -LiteralPath $log -Force }
& $unity -batchmode -quit -projectPath $unityProject -executeMethod BuildWindows.Build -logFile $log
$deadline = [DateTime]::UtcNow.AddMinutes(5)
while ([DateTime]::UtcNow -lt $deadline) {
  if ((Test-Path $log) -and (Select-String -LiteralPath $log -Pattern 'Build Finished, Result: Success' -Quiet) -and (Test-Path (Join-Path $stage '异变独行.exe'))) { break }
  if ((Test-Path $log) -and (Select-String -LiteralPath $log -Pattern 'Build Finished, Result: Failure' -Quiet)) { break }
  Start-Sleep -Seconds 1
}
if (-not ((Test-Path $log) -and (Select-String -LiteralPath $log -Pattern 'Build Finished, Result: Success' -Quiet))) { throw "Unity build failed. See $log" }
$player = $null
for ($attempt = 0; $attempt -lt 600 -and -not $player; $attempt++) {
  $player = Get-ChildItem -LiteralPath $stage -Filter '*.exe' -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'UnityCrashHandler64.exe' } | Select-Object -First 1
  if (-not $player) { Start-Sleep -Seconds 1 }
}
if (-not $player) { throw "Unity reported success but the player was not found in $stage" }
$backup = Get-ChildItem -LiteralPath $stage -Directory -Filter '*_BackUpThisFolder_ButDontShipItWithYourGame' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($backup) { Remove-Item -LiteralPath $backup.FullName -Recurse -Force }
$smokeLog = Join-Path $unityProject "Logs\player-smoke-$version.log"
$smoke = Start-Process -FilePath $player.FullName -ArgumentList @('-batchmode', '-nographics', '--smoke-test', '-logFile', "`"$smokeLog`"") -WindowStyle Hidden -Wait -PassThru
if ($smoke.ExitCode -ne 0 -or -not (Select-String -LiteralPath $smokeLog -Pattern 'NATIVE_SMOKE_OK' -Quiet)) { throw "Native player smoke test failed. See $smokeLog" }
& $isccPath "/DAppVersion=$version" "/DSourceDir=$stage" "/DOutputDir=$(Join-Path $root 'release')" (Join-Path $root 'installer\roguelike-unity.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup compilation failed.' }
Write-Host "Unity installer generated: $(Join-Path $root "release\异变独行-$version-Setup.exe")"
