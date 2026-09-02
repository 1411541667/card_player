$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $root 'src\appimpage.jpg'
$iconPath = Join-Path $root 'launcher\launcher.ico'
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("launcher-icon-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $temp | Out-Null

try {
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  $side = [Math]::Min($source.Width, $source.Height)
  $left = [int](($source.Width - $side) / 2)
  $top = [int](($source.Height - $side) / 2)
  $sizes = @(16, 32, 48, 64, 128, 256)
  $pngs = @()
  foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $bitmap.SetResolution(96, 96)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $size, $size)), $left, $top, $side, $side, [System.Drawing.GraphicsUnit]::Pixel)
    $png = Join-Path $temp ("$size.png")
    $bitmap.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += $png
    $graphics.Dispose(); $bitmap.Dispose()
  }
  $source.Dispose()

  $streams = $pngs | ForEach-Object { [System.IO.File]::ReadAllBytes($_) }
  $output = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter($output)
  $writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]$sizes.Count)
  $offset = 6 + (16 * $sizes.Count)
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$streams[$i].Length); $writer.Write([UInt32]$offset)
    $offset += $streams[$i].Length
  }
  foreach ($bytes in $streams) { $writer.Write($bytes) }
  [System.IO.File]::WriteAllBytes($iconPath, $output.ToArray())
  $writer.Dispose(); $output.Dispose()
  Write-Host "Launcher icon ready: $iconPath"
}
finally {
  if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
