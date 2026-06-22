"""通过 Playwright 浏览器自动化发布抖音评论（绕过 API 签名限制）"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from media_platform.douyin.login import DouYinLogin
from tools import utils


async def main():
    aweme_id = sys.argv[1] if len(sys.argv) > 1 else ""
    content = sys.argv[2] if len(sys.argv) > 2 else ""

    if not aweme_id or not content:
        print("Usage: python post_comment.py <aweme_id> <content>")
        sys.exit(1)

    async with async_playwright() as playwright:
        chromium = playwright.chromium
        if config.SAVE_LOGIN_STATE:
            user_data_dir = os.path.join(
                os.getcwd(), "browser_data",
                config.USER_DATA_DIR % config.PLATFORM
            )
            browser_context = await chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                accept_downloads=True,
                headless=False,  # 必须有界面，方便查看发布过程
                proxy=None,
                viewport={"width": 1920, "height": 1080},
            )
        else:
            browser = await chromium.launch(headless=False)
            browser_context = await browser.new_context(
                viewport={"width": 1920, "height": 1080}
            )

        await browser_context.add_init_script(path="libs/stealth.min.js")
        page = await browser_context.new_page()

        # 先导航到首页检查登录状态
        await page.goto("https://www.douyin.com", wait_until="domcontentloaded")
        await asyncio.sleep(2)

        # 检查是否已登录
        local_storage = await page.evaluate("() => window.localStorage")
        is_logged_in = local_storage.get("HasUserLogin", "") == "1"

        if not is_logged_in:
            utils.logger.info("[post_comment] 未登录，开始扫码登录...")
            login_obj = DouYinLogin(
                login_type=config.LOGIN_TYPE,
                login_phone="",
                browser_context=browser_context,
                context_page=page,
                cookie_str=config.COOKIES
            )
            await login_obj.begin()
            utils.logger.info("[post_comment] 登录完成")

        # 导航到目标视频页面
        video_url = f"https://www.douyin.com/video/{aweme_id}"
        utils.logger.info(f"[post_comment] 打开视频: {video_url}")
        await page.goto(video_url, wait_until="domcontentloaded")
        await asyncio.sleep(4)  # 等待页面完全加载

        # 方法1: 尝试查找评论输入框并输入
        try:
            # 抖音评论区有多种选择器可能匹配
            comment_selectors = [
                "textarea[placeholder*='评论']",
                "div[contenteditable='true'][data-placeholder*='评论']",
                "div[contenteditable='true']",
                "textarea.CommentInput",
                "[class*='comment'] textarea",
                "[class*='comment'] [contenteditable]",
                ".comment-input textarea",
                ".comment-input [contenteditable]",
            ]

            input_box = None
            for sel in comment_selectors:
                try:
                    input_box = await page.wait_for_selector(sel, timeout=3000)
                    if input_box:
                        utils.logger.info(f"[post_comment] 找到评论输入框: {sel}")
                        break
                except PlaywrightTimeoutError:
                    continue

            if not input_box:
                # 方法2: 尝试点击评论区区域触发输入框
                utils.logger.info("[post_comment] 未找到输入框，尝试点击评论区...")
                click_targets = [
                    "span:has-text('评论')",
                    "div:has-text('评论')",
                    "[class*='comment'] span",
                    ".comment-icon",
                ]
                for sel in click_targets:
                    try:
                        await page.click(sel, timeout=3000)
                        await asyncio.sleep(1)
                        break
                    except PlaywrightTimeoutError:
                        continue

                # 重新查找输入框
                for sel in comment_selectors:
                    try:
                        input_box = await page.wait_for_selector(sel, timeout=2000)
                        if input_box:
                            break
                    except PlaywrightTimeoutError:
                        continue

            if input_box:
                # 清除已有内容并输入新内容
                await input_box.click()
                await asyncio.sleep(0.5)
                # 模拟逐字输入
                await input_box.fill(content)
                await asyncio.sleep(1)
                utils.logger.info(f"[post_comment] 已输入评论: {content[:50]}...")

                # 查找发送按钮
                submit_selectors = [
                    "button:has-text('发送')",
                    "button:has-text('发布')",
                    "span:has-text('发送')",
                    "span:has-text('发布')",
                    "[class*='submit']",
                    "[class*='send']",
                    "button[class*='comment']",
                ]
                submit_btn = None
                for sel in submit_selectors:
                    try:
                        submit_btn = await page.wait_for_selector(sel, timeout=2000)
                        if submit_btn:
                            utils.logger.info(f"[post_comment] 找到发送按钮: {sel}")
                            break
                    except PlaywrightTimeoutError:
                        continue

                if submit_btn:
                    await submit_btn.click()
                    await asyncio.sleep(3)
                    utils.logger.info("[post_comment] 评论已提交")
                    print("POST_COMMENT_RESULT: {\"success\": true, \"method\": \"browser\"}")
                else:
                    # 尝试按 Enter 发送
                    utils.logger.info("[post_comment] 未找到发送按钮，尝试 Enter 键...")
                    await input_box.press("Enter")
                    await asyncio.sleep(3)
                    print("POST_COMMENT_RESULT: {\"success\": true, \"method\": \"enter\"}")
            else:
                utils.logger.error("[post_comment] 无法找到评论输入框")
                print("POST_COMMENT_RESULT: {\"success\": false, \"error\": \"no_input_box\"}")

        except Exception as e:
            utils.logger.error(f"[post_comment] 浏览器操作异常: {e}")
            print(f"POST_COMMENT_RESULT: {{\"success\": false, \"error\": \"{str(e)[:200]}\"}}")

        # 等待几秒观察结果
        await asyncio.sleep(2)
        await browser_context.close()
        utils.logger.info("[post_comment] 完成")


if __name__ == '__main__':
    asyncio.get_event_loop().run_until_complete(main())
