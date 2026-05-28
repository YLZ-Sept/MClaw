param([switch]$Show)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinFind {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWinDelegate lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  public delegate bool EnumWinDelegate(IntPtr hWnd, IntPtr lParam);
}
public struct RECT { public int L,T,R,B; public override string ToString() { return L+","+T+","+R+","+B; } }
"@

# Get WeChat-related process IDs
$targetNames = @('WeChatAppEx', 'weixin', 'wechat', 'WeChat', 'WXWork')
$targetPids = @{}
Get-Process -ErrorAction SilentlyContinue | Where-Object { $targetNames -contains $_.Name } | ForEach-Object {
  $targetPids[$_.Id] = $_.Name
}

if ($targetPids.Count -eq 0) {
  Write-Output "NOT_FOUND"
  exit
}

$results = New-Object System.Collections.Generic.List[string]
$sb = New-Object System.Text.StringBuilder(256)

$callback = [WinFind+EnumWinDelegate]{
  param($h, $l)
  $winPid = [uint32]0
  [WinFind]::GetWindowThreadProcessId($h, [ref]$winPid) | Out-Null
  $pidInt = [int]$winPid
  if ($targetPids.ContainsKey($pidInt)) {
    [WinFind]::GetWindowText($h, $sb, 256) | Out-Null
    $t = $sb.ToString()
    $r = New-Object RECT
    [WinFind]::GetWindowRect($h, [ref]$r) | Out-Null
    $w = $r.R - $r.L
    $h2 = $r.B - $r.T
    if ($w -gt 200 -and $h2 -gt 200) {
      $procName = $targetPids[$pidInt]
      if ($Show -or [WinFind]::IsIconic($h)) {
        [WinFind]::ShowWindow($h, 9) | Out-Null
        Start-Sleep -Milliseconds 300
      }
      if ($Show) {
        [WinFind]::SetForegroundWindow($h) | Out-Null
        Start-Sleep -Milliseconds 300
      }
      [WinFind]::GetWindowRect($h, [ref]$r) | Out-Null
      $results.Add("$h|$t|$($r.ToString())|$procName")
    }
  }
  return $true
}

[WinFind]::EnumWindows($callback, [IntPtr]::Zero)

if ($results.Count -eq 0) {
  Write-Output "NOT_FOUND"
} else {
  Write-Output $results[0]
}
