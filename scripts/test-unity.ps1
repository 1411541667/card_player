param(
    [string]$UnityPath = 'D:\unity\2022.3.62f3c1\Editor\Unity.exe',
    [int]$TimeoutSeconds = 300
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'unity'
$nodePath = Join-Path $root 'node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) { $nodePath = (Get-Command node -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $UnityPath)) { throw 'Unity executable was not found. Pass -UnityPath with your Unity 2022.3.62f3c1 path.' }
& $nodePath (Join-Path $PSScriptRoot 'export-unity-parity.mjs') --check
if ($LASTEXITCODE -ne 0) { throw 'Web reference check failed.' }
$resultDirectory = Join-Path $root 'test-results'
New-Item -ItemType Directory -Force -Path $resultDirectory | Out-Null
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$resultFile = Join-Path $resultDirectory "unity-check-$stamp.xml"
$logFile = Join-Path $resultDirectory "unity-check-$stamp.log"
Write-Host 'Running Unity EditMode tests. Close this Unity project in the Editor before starting this command.'
$runner = Start-Process -FilePath $UnityPath -ArgumentList @('-batchmode', '-nographics', '-projectPath', "`"$project`"", '-runTests', '-testPlatform', 'EditMode', '-testResults', "`"$resultFile`"", '-logFile', "`"$logFile`"") -WindowStyle Hidden -PassThru
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$report = $null
try {
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-Path -LiteralPath $resultFile) {
            try { [xml]$candidate = Get-Content -LiteralPath $resultFile -Raw; if ($candidate.'test-run'.result) { $report = $candidate; break } } catch { }
        }
        if ($runner.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $report) {
        if (Test-Path -LiteralPath $logFile) { Get-Content -LiteralPath $logFile -Tail 30 | Write-Host }
        throw "No complete test report. Check project lock/compiler errors in $logFile"
    }
    Write-Host "Tests: $($report.'test-run'.total), Passed: $($report.'test-run'.passed), Failed: $($report.'test-run'.failed)"
    Write-Host "Report: $resultFile"
    Write-Host "Log: $logFile"
    if ($report.'test-run'.result -ne 'Passed') { throw 'Unity tests failed. Open the XML report for failing test details.' }
} finally {
    # Stop only the batch process created by this invocation, including shutdown hangs.
    if (-not $runner.HasExited -and -not $runner.WaitForExit(5000)) { Stop-Process -Id $runner.Id -Force }
}
