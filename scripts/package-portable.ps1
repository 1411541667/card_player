$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
  # npm/vite/gcc may write harmless warnings to stderr; under 'Stop' a redirected
  # stderr stream would abort the script, so run native commands with 'Continue'.
  $ErrorActionPreference = 'Continue'
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE" }
  $ErrorActionPreference = 'Stop'

  powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'make-launcher-icon.ps1')
  if ($LASTEXITCODE -ne 0) { throw "icon generation failed with exit code $LASTEXITCODE" }

  Copy-Item -LiteralPath (Join-Path $projectRoot 'launcher\server.cjs') -Destination (Join-Path $projectRoot 'server.cjs') -Force
  Copy-Item -LiteralPath 'C:\Program Files\nodejs\node.exe' -Destination (Join-Path $projectRoot 'node.exe') -Force

  $ErrorActionPreference = 'Continue'
  & windres.exe (Join-Path $projectRoot 'launcher\launcher.rc') -o (Join-Path $projectRoot 'launcher\launcher-res.o')
  if ($LASTEXITCODE -ne 0) { throw "windres failed with exit code $LASTEXITCODE" }
  & gcc.exe (Join-Path $projectRoot 'launcher\launcher.c') (Join-Path $projectRoot 'launcher\launcher-res.o') -o (Join-Path $projectRoot 'GameLauncher.exe') -mwindows -lshlwapi
  $gccExit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($gccExit -ne 0) { throw "gcc failed with exit code $gccExit" }
  if (!(Test-Path (Join-Path $projectRoot 'GameLauncher.exe'))) { throw 'GCC did not create the exe.' }

  Write-Host "Launcher ready: $(Join-Path $projectRoot 'GameLauncher.exe')"
  Write-Host "The launcher uses node.exe, server.cjs and the dist folder in the same directory."
}
finally { Pop-Location }
