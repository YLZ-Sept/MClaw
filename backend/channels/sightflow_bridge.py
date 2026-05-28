"""
MClaw ↔ Sightflow Bridge

Sightflow (Python) 负责: 截图、OCR、键鼠操作
MClaw (Node.js) 负责: Agent 调度、LLM 调用、多渠道管理

协议: WebSocket → MClaw /ws/sightflow
"""

import sys
import os
import json
import time
import threading
import logging
from datetime import datetime

import websocket

# Sightflow imports
from sightflow_agent.agent import VisionAgent, Message
from sightflow_agent.drivers.wechat import WeChatDriver

# Logging
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(name)s] %(message)s')
log = logging.getLogger("mclaw-bridge")

# Config
MCLAW_URL = os.environ.get("MCLAW_URL", "ws://localhost:3001/ws/sightflow")
ACCOUNT_ID = os.environ.get("SIGHTFLOW_ACCOUNT", "")
PLATFORM = os.environ.get("SIGHTFLOW_PLATFORM", "wechat")
SCAN_INTERVAL = int(os.environ.get("SIGHTFLOW_INTERVAL", "10"))
REPLY_ENABLED = os.environ.get("SIGHTFLOW_NO_REPLY", "").lower() not in ("1", "true", "yes")

if not ACCOUNT_ID:
    for i, arg in enumerate(sys.argv):
        if arg == "--account" and i + 1 < len(sys.argv):
            ACCOUNT_ID = sys.argv[i + 1]
if "--no-reply" in sys.argv:
    REPLY_ENABLED = False

if not ACCOUNT_ID:
    print("Usage: python sightflow_bridge.py --account <channel_account_id> [--no-reply]")
    print("  or set SIGHTFLOW_ACCOUNT env var")
    sys.exit(1)

# State
ws = None
agent = None
known_messages = set()
ws_connected = False
loop_running = False


def timestamp():
    return datetime.now().strftime("%H:%M:%S")


# ========== WebSocket ==========

def on_ws_open(ws_conn):
    global ws_connected
    ws_connected = True
    log.info("WS connected, authenticating...")
    ws_conn.send(json.dumps({"type": "auth", "account_id": ACCOUNT_ID}))


def on_ws_message(ws_conn, raw):
    global ws_connected
    try:
        data = json.loads(raw)
    except Exception:
        return

    msg_type = data.get("type", "")

    if msg_type == "auth_ok":
        platform = data.get("platform", "wechat")
        mode = data.get("reply_mode", "manual")
        log.info(f"Auth OK platform={platform} mode={mode}")
        start_scan_loop()

    elif msg_type == "auth_error":
        log.error(f"Auth failed: {data.get('message')}")
        sys.exit(1)

    elif msg_type == "auth_timeout":
        log.error("Auth timeout")
        ws_conn.close()

    elif msg_type == "reply":
        content = data.get("content", "")
        log.info(f"Reply received: {content[:50]}...")
        if REPLY_ENABLED and agent:
            deliver_reply(data.get("contact_name", ""), content)

    elif msg_type == "suggestion":
        content = data.get("content", "")
        log.info(f"AI suggestion: {content[:80]}...")
        print(f"\n[AI Suggestion] {content[:300]}\n")

    elif msg_type == "ack":
        log.info(f"Message ack conv={data.get('conversation_id', '')[:8]}")

    elif msg_type == "heartbeat_ok":
        pass

    else:
        log.debug(f"Unknown WS message: {msg_type}")


def on_ws_error(ws_conn, error):
    global ws_connected
    ws_connected = False
    log.error(f"WS error: {error}")


def on_ws_close(ws_conn, status, msg):
    global ws_connected
    ws_connected = False
    log.warning(f"WS closed: {status} {msg}")
    # Reconnect in 5s
    time.sleep(5)
    connect_ws()


def connect_ws():
    global ws
    log.info(f"Connecting to {MCLAW_URL}...")
    ws = websocket.WebSocketApp(
        MCLAW_URL,
        on_open=on_ws_open,
        on_message=on_ws_message,
        on_error=on_ws_error,
        on_close=on_ws_close,
    )
    threading.Thread(target=ws.run_forever, daemon=True).start()


def send_to_mclaw(contact_name, content):
    """Send incoming message to MClaw"""
    if ws and ws_connected:
        ws.send(json.dumps({
            "type": "message",
            "contact_name": contact_name,
            "contact_avatar": "",
            "content": content,
        }))
        log.info(f"Sent to MClaw: {contact_name}: {content[:50]}...")


# ========== Sightflow Agent ==========

def restore_wechat_window():
    """Restore WeChat window from system tray (hidden state)"""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32

    # Find hidden WeChat windows by enumerating all (including hidden)
    result = []
    def callback(hwnd, _lParam):
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0 and length < 20:
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title = buf.value
            if title == '微信':
                rect = wintypes.RECT()
                user32.GetWindowRect(hwnd, ctypes.byref(rect))
                result.append((hwnd, rect.left, rect.top, rect.right, rect.bottom))
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(WNDENUMPROC(callback), 0)

    if not result:
        log.warning("WeChat window not found (is WeChat running?)")
        return None

    hwnd, L, T, R, B = result[0]
    visible = user32.IsWindowVisible(hwnd)
    iconic = user32.IsIconic(hwnd)

    log.info(f"WeChat HWND={hwnd} visible={visible} iconic={iconic} rect=({L},{T},{R},{B})")

    if not visible or iconic:
        SW_RESTORE = 9
        SW_SHOW = 5
        user32.ShowWindow(hwnd, SW_RESTORE)
        time.sleep(0.3)
        user32.ShowWindow(hwnd, SW_SHOW)
        time.sleep(0.2)
        user32.SetForegroundWindow(hwnd)
        time.sleep(0.3)
        log.info("WeChat window restored")

    return {"hwnd": hwnd, "L": L, "T": T, "R": R, "B": B}


def init_agent():
    """Initialize Sightflow VisionAgent with WeChat driver"""
    global agent

    # First, ensure WeChat window is visible
    win_info = restore_wechat_window()
    if not win_info:
        log.error("Cannot find WeChat window. Make sure WeChat is running and logged in.")
        return False

    log.info("Initializing Sightflow VisionAgent + WeChatDriver...")
    driver = WeChatDriver()
    agent = VisionAgent(driver=driver, ocr_enabled=True, debug=False)

    # Attach to WeChat window
    if not driver.attach():
        log.error("Cannot attach to WeChat. Make sure WeChat is visible on screen.")
        return False

    log.info(f"Sightflow agent ready (OCR: PaddleOCR)")
    return True


def scan_unread():
    """Scan for unread WeChat messages using Sightflow"""
    if not agent:
        return []

    try:
        notifications = agent.detect_unread()
        return notifications
    except Exception as e:
        log.error(f"Scan error: {e}")
        return []


def read_chat_messages(contact_name):
    """Read messages from a specific contact using Sightflow"""
    if not agent:
        return []

    try:
        messages = agent.read_chat(contact_name, limit=5)
        return messages
    except Exception as e:
        log.error(f"Read chat error: {e}")
        return []


def deliver_reply(contact_name, text):
    """Send a reply via Sightflow keyboard simulation"""
    if not agent or not contact_name:
        log.warning("Cannot deliver reply: no agent or contact")
        return

    try:
        log.info(f"Delivering reply to {contact_name}: {text[:50]}...")
        agent.send_message(contact_name, text)
        log.info("Reply delivered")
    except Exception as e:
        log.error(f"Deliver reply error: {e}")


# ========== Main Loop ==========

def scan_loop():
    """Main loop: scan WeChat → detect new messages → forward to MClaw"""
    global loop_running

    log.info(f"Scan loop started (interval={SCAN_INTERVAL}s)")
    loop_running = True

    while loop_running:
        try:
            # 1. Detect unread notifications
            notifications = scan_unread()

            if notifications:
                log.info(f"Found {len(notifications)} unread notifications")

            for notif in notifications:
                contact = notif.contact
                log.info(f"  Unread: {contact} (count={notif.count})")

                # 2. Read the actual messages
                messages = read_chat_messages(contact)

                for msg in messages:
                    # Deduplicate
                    fingerprint = f"{msg.sender}:{msg.text[:60]}"
                    if fingerprint in known_messages:
                        continue
                    known_messages.add(fingerprint)

                    log.info(f"  New msg from {msg.sender}: {msg.text[:60]}...")

                    # 3. Forward to MClaw
                    send_to_mclaw(msg.sender, msg.text)

            # Keep known_messages bounded
            if len(known_messages) > 500:
                known_messages.clear()

        except Exception as e:
            log.error(f"Scan loop error: {e}")

        time.sleep(SCAN_INTERVAL)


def start_scan_loop():
    """Start scan loop in background thread"""
    threading.Thread(target=scan_loop, daemon=True).start()


# ========== Entry ==========

def main():
    global REPLY_ENABLED

    print("=" * 50)
    print("  MClaw ↔ Sightflow Bridge")
    print(f"  Platform: {PLATFORM}")
    print(f"  MClaw: {MCLAW_URL}")
    print(f"  Scan interval: {SCAN_INTERVAL}s")
    print(f"  Auto-reply: {'enabled' if REPLY_ENABLED else 'disabled'}")
    print(f"  OCR: PaddleOCR (Chinese optimized)")
    print("=" * 50)
    print()

    # 1. Init Sightflow
    if not init_agent():
        print("\nCannot start without WeChat. Exiting.")
        sys.exit(1)

    # 2. Connect to MClaw
    connect_ws()

    # 3. Keep alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        loop_running = False
        if ws:
            ws.close()
        print("Goodbye.")


if __name__ == "__main__":
    main()
