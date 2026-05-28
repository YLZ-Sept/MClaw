# List all windows belonging to WeChat processes with details
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WL {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWinDelegate lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetClassName(IntPtr hWnd, StringBuilder name, int count);
  public delegate bool EnumWinDelegate(IntPtr hWnd, IntPtr lParam);
}
public struct RECT { public int L,T,R,B; }
"@

$targetNames = @('WeChatAppEx', 'weixin', 'wechat', 'WeChat', 'WXWork')
$targetPids = @{}
Get-Process -ErrorAction SilentlyContinue | Where-Object { $targetNames -contains $_.Name } | ForEach-Object {
  $targetPids[$_.Id] = $_.Name
}

$sb = New-Object System.Text.StringBuilder(256)
$cb = [WL+EnumWinDelegate]{
  param($h, $l)
  $winPid = [uint32]0
  [WL]::GetWindowThreadProcessId($h, [ref]$winPid) | Out-Null
  $pidInt = [int]$winPid
  if ($targetPids.ContainsKey($pidInt)) {
    [WL]::GetWindowText($h, $sb, 256) | Out-Null
    $t = $sb.ToString()
    [WL]::GetClassName($h, $sb, 256) | Out-Null
    $cls = $sb.ToString()
    $r = New-Object RECT
    [WL]::GetWindowRect($h, [ref]$r) | Out-Null
    $vis = [WL]::IsWindowVisible($h)
    $w = $r.R - $r.L
    $h2 = $r.B - $r.T
    Write-Output "hwnd=$h pid=$pidInt proc=$($targetPids[$pidInt]) cls=[$cls] title=[$t] vis=$vis size=$($w)x$($h2) pos=$($r.L),$($r.T)"
  }
  return $true
}
[WL]::EnumWindows($cb, [IntPtr]::Zero)
