"""
WeChat typing helper — uses Sightflow WeChatDriver (pyautogui) for reliable keyboard input.
Called from Node.js sightflow-agent.js when MClaw sends a reply.

Usage: python type_wechat.py --text "message" [--contact "name"]
"""

import sys
import time
import ctypes
from ctypes import wintypes

# Restore and activate WeChat window
def ensure_wechat_visible():
    user32 = ctypes.windll.user32

    result = []
    def callback(hwnd, _):
        length = user32.GetWindowTextLengthW(hwnd)
        if 0 < length < 20:
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            if buf.value == '微信':
                rect = wintypes.RECT()
                user32.GetWindowRect(hwnd, ctypes.byref(rect))
                result.append((hwnd, rect.left, rect.top, rect.right, rect.bottom))
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(WNDENUMPROC(callback), 0)

    if not result:
        print("ERROR: WeChat window not found")
        sys.exit(1)

    hwnd, L, T, R, B = result[0]

    if not user32.IsWindowVisible(hwnd) or user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, 9)  # SW_RESTORE
        time.sleep(0.3)
        user32.ShowWindow(hwnd, 5)  # SW_SHOW
        time.sleep(0.2)

    user32.SetForegroundWindow(hwnd)
    time.sleep(0.3)
    return True


def type_message(text, contact=None):
    """Type and send a message in WeChat using pyautogui"""
    import pyautogui

    ensure_wechat_visible()

    # If contact specified, open their chat via Ctrl+F search
    if contact:
        pyautogui.hotkey('ctrl', 'f')
        time.sleep(0.3)
        pyautogui.write(contact, interval=0.05)
        time.sleep(0.5)
        pyautogui.press('enter')
        time.sleep(0.3)

    # Type the message (pyautogui.write handles Unicode properly, unlike SendKeys)
    pyautogui.write(text, interval=0.03)
    time.sleep(0.2)

    # Send (Enter)
    pyautogui.press('enter')
    time.sleep(0.1)
    print("OK")


if __name__ == "__main__":
    text = None
    contact = None

    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--text" and i + 1 < len(args):
            text = args[i + 1]
            i += 2
        elif args[i] == "--file" and i + 1 < len(args):
            with open(args[i + 1], 'r', encoding='utf-8') as f:
                text = f.read()
            i += 2
        elif args[i] == "--contact" and i + 1 < len(args):
            contact = args[i + 1]
            i += 2
        else:
            i += 1

    if not text:
        print("Usage: python type_wechat.py --text 'message' [--contact 'name']")
        print("       python type_wechat.py --file 'path' [--contact 'name']")
        sys.exit(1)

    type_message(text, contact)
