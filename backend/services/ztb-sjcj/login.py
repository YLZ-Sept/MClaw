"""首次登录：打开浏览器 -> 用户扫码 -> 登录状态自动持久化"""
import os
import time
from playwright.sync_api import sync_playwright

STATE_DIR = os.path.join(os.path.dirname(__file__), "browser_state")
SIGNAL_FILE = os.path.join(os.path.dirname(__file__), ".login_ready")

os.makedirs(STATE_DIR, exist_ok=True)
if os.path.exists(SIGNAL_FILE):
    os.remove(SIGNAL_FILE)

with sync_playwright() as p:
    # 持久化上下文，cookies/localStorage 自动保存在 STATE_DIR
    context = p.chromium.launch_persistent_context(
        user_data_dir=STATE_DIR,
        headless=False,
    )
    page = context.pages[0] if context.pages else context.new_page()

    page.goto("https://qiye.qianlima.com", wait_until="load", timeout=60000)
    page.wait_for_timeout(3000)

    print(f"当前页面: {page.url}")
    print()
    print("请在浏览器窗口中用微信扫描二维码登录。")
    print(f"登录完成后，在终端输入: echo done > E:/CC/ZTB-SJCJ/.login_ready")
    print()

    for i in range(150):
        if os.path.exists(SIGNAL_FILE):
            print("检测到登录完成，保存状态...")
            break
        time.sleep(2)

    page.wait_for_timeout(2000)
    print(f"当前页面: {page.url}")
    print(f"登录状态已自动保存到: {STATE_DIR}")
    context.close()

    if os.path.exists(SIGNAL_FILE):
        os.remove(SIGNAL_FILE)
    print("完成。")
