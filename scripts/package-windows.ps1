$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  $pkg = Get-Content -Raw package.json | ConvertFrom-Json
  $version = $pkg.version
  foreach ($command in @('npm run content:check','npm test','npm run lint','npm run build')) {
    Write-Host "==> $command"; Invoke-Expression $command
    if ($LASTEXITCODE -ne 0) { throw "$command failed" }
  }
  $sdks = dotnet --list-sdks 2>$null
  if (-not $sdks) { throw 'No .NET SDK found. Install the .NET 8 SDK and retry.' }
  $stage = Join-Path $root "release\stage-$version"
  if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
  New-Item -ItemType Directory -Force $stage | Out-Null
  $env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
  $env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
  $env:DOTNET_CLI_HOME = Join-Path $env:TEMP 'roguelike-dotnet-home'
  New-Item -ItemType Directory -Force $env:DOTNET_CLI_HOME | Out-Null
  dotnet publish launcher\GameLauncher.csproj -c Release -r win-x64 --self-contained true -p:Version=$version -o $stage
  if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }
  Copy-Item -Recurse -Force dist (Join-Path $stage 'dist')
  Copy-Item -Force launcher\launcher.ico (Join-Path $stage 'launcher.ico')
  $iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue
  if (-not $iscc) { Write-Warning "Inno Setup not found. Runnable staging directory: $stage"; exit 0 }
  $output = Join-Path $root 'release'
  & $iscc.Source "/DAppVersion=$version" "/DSourceDir=$stage" "/DOutputDir=$output" installer\roguelike.iss
  if ($LASTEXITCODE -ne 0) { throw 'Inno Setup failed' }
  Write-Host "Installer generated: $output\Roguelike-Card-Framework-$version-Setup.exe"
} finally { Pop-Location }
