Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$minX = 0; $minY = 0; $maxX = 0; $maxY = 0
foreach ($scr in [System.Windows.Forms.Screen]::AllScreens) {
  if ($scr.Bounds.Left -lt $minX) { $minX = $scr.Bounds.Left }
  if ($scr.Bounds.Top -lt $minY) { $minY = $scr.Bounds.Top }
  $r = $scr.Bounds.Right; if ($r -gt $maxX) { $maxX = $r }
  $b = $scr.Bounds.Bottom; if ($b -gt $maxY) { $maxY = $b }
}
$vw = $maxX - $minX
$vh = $maxY - $minY

$bmp = New-Object System.Drawing.Bitmap($vw, $vh)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($minX, $minY, 0, 0, (New-Object System.Drawing.Size($vw, $vh)))
$g.Dispose()

if ($args.Count -ge 4) {
  $L = [Math]::Max([int]$args[0], $minX)
  $T = [Math]::Max([int]$args[1], $minY)
  $R = [Math]::Min([int]$args[2], $maxX)
  $B = [Math]::Min([int]$args[3], $maxY)
  $cL = $L - $minX; $cT = $T - $minY
  $cw = $R - $L; $ch = $B - $T
  if ($cw -gt 10 -and $ch -gt 10) {
    $crop = $bmp.Clone([System.Drawing.Rectangle]::new($cL, $cT, $cw, $ch), $bmp.PixelFormat)
    $bmp.Dispose()
    $bmp = $crop
  }
}

$outpath = if ($args.Count -ge 5) { $args[4] } else { $args[0] }
if (-not $outpath) { $outpath = Join-Path $env:TEMP "sightflow_cap.png" }
$bmp.Save($outpath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output $outpath
