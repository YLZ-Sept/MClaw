"""通过 Playwright 浏览器自动化发布快手评论

选择器策略（从高到低优先级）：
  1. 语义定位器 —— get_by_placeholder / get_by_role / get_by_text
  2. 通用属性定位器 —— [contenteditable] / textarea / input
  3. 硬编码 CSS 选择器兜底
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from media_platform.kuaishou.login import KuaishouLogin
from tools import utils


async def find_comment_input(page):
    """渐进式查找评论输入框"""
    # Tier 1: 语义定位器
    strategies = [
        ("placeholder", lambda: page.get_by_placeholder("说点什么...")),
        ("placeholder", lambda: page.get_by_placeholder("评论")),
        ("placeholder", lambda: page.get_by_placeholder("发一条友善的评论")),
        ("role_textbox", lambda: page.get_by_role("textbox").first),
    ]
    for name, factory in strategies:
        try:
            loc = factory()
            if await loc.count() > 0:
                utils.logger.info(f"[post_comment_ks] 输入框命中: {name}")
                return loc
        except Exception:
            continue

    # Tier 2: 通用属性定位器
    generic = [
        page.locator('[contenteditable="true"]').first,
        page.locator("textarea").first,
        page.locator('input[placeholder*="评论"]').first,
        page.locator('input[placeholder*="说点"]').first,
    ]
    for loc in generic:
        try:
            if await loc.count() > 0:
                utils.logger.info("[post_comment_ks] 输入框命中: 通用定位器")
                return loc
        except Exception:
            continue

    # Tier 3: 硬编码兜底（快手常见 DOM）
    fallback = [
        "textarea[placeholder*='评论']",
        "textarea[placeholder*='说点']",
        "input[placeholder*='评论']",
        "input[placeholder*='说点']",
        "[class*='comment'] textarea",
        "[class*='comment'] input",
        "[class*='comment-input'] textarea",
        "[class*='comment-input'] input",
        "[class*='reply-box'] textarea",
        "[class*='reply-box'] input",
        "[class*='CommentInput']",
        "#comment-input",
    ]
    for sel in fallback:
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0:
                utils.logger.info(f"[post_comment_ks] 输入框命中: 兜底 {sel}")
                return loc
        except Exception:
            continue

    return None


async def find_submit_button(page):
    """渐进式查找发送按钮"""
    # Tier 1: 语义定位器
    for name in ["发送", "发布", "评论", "提交"]:
        try:
            btn = page.get_by_role("button", name=name)
            if await btn.count() > 0:
                utils.logger.info(f"[post_comment_ks] 按钮命中: role=button, name={name}")
                return btn
        except Exception:
            continue

    # Tier 2: 文本定位
    for text in ["发送", "发布", "提交"]:
        try:
            btn = page.get_by_text(text, exact=True)
            if await btn.count() > 0:
                utils.logger.info(f"[post_comment_ks] 按钮命中: text={text}")
                return btn
        except Exception:
            continue

    # Tier 3: 通用按钮
    generic_btns = [
        page.locator("button").filter(has_text="发送").first,
        page.locator("button").filter(has_text="发布").first,
        page.locator("span").filter(has_text="发送").first,
        page.locator("span").filter(has_text="发布").first,
        page.locator("[class*='submit']").first,
        page.locator("[class*='send']").first,
    ]
    for btn in generic_btns:
        try:
            if await btn.count() > 0:
                utils.logger.info("[post_comment_ks] 按钮命中: 通用定位器")
                return btn
        except Exception:
            continue

    # Tier 4: 硬编码兜底
    fallback = [
        "button:has-text('发送')",
        "button:has-text('发布')",
        "span:has-text('发送')",
        "span:has-text('发布')",
        "button[class*='submit']",
        "button[class*='send']",
        "[class*='comment'] button",
        "[class*='reply'] button",
    ]
    for sel in fallback:
        try:
            btn = page.locator(sel).first
            if await btn.count() > 0:
                utils.logger.info(f"[post_comment_ks] 按钮命中: 兜底 {sel}")
                return btn
        except Exception:
            continue

    return None


async def ensure_logged_in(browser_context, page):
    """检查并确保已登录快手"""
    await page.goto("https://www.kuaishou.com", wait_until="domcontentloaded")
    await asyncio.sleep(3)

    # 检查 passToken cookie
    current_cookie = await browser_context.cookies()
    _, cookie_dict = utils.convert_cookies(current_cookie)
    pass_token = cookie_dict.get("passToken", "")

    if not pass_token:
        utils.logger.info("[post_comment_ks] 未登录，开始扫码登录...")
        login_obj = KuaishouLogin(
            login_type=config.LOGIN_TYPE,
            login_phone="",
            browser_context=browser_context,
            context_page=page,
            cookie_str=config.COOKIES,
        )
        await login_obj.begin()
        utils.logger.info("[post_comment_ks] 登录完成")

    return True


async def post_comment_flow(page, video_url, content):
    """导航到视频页并发布评论"""
    utils.logger.info(f"[post_comment_ks] 打开视频: {video_url}")
    await page.goto(video_url, wait_until="domcontentloaded")
    await asyncio.sleep(5)  # KS 页面加载较慢

    # 滚动到评论区
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.4)")
    await asyncio.sleep(1.5)

    # 查找评论输入框
    input_box = await find_comment_input(page)

    if not input_box:
        # 尝试点击评论区区域触发输入框
        utils.logger.info("[post_comment_ks] 未找到输入框，尝试点击评论区...")
        click_targets = [
            page.get_by_text("评论"),
            page.get_by_text("说点什么..."),
            page.locator("[class*='comment'] span").first,
            page.locator("[class*='comment-icon']").first,
            page.locator("[class*='reply-box']").first,
        ]
        for target in click_targets:
            try:
                if await target.count() > 0:
                    await target.first.click(timeout=3000)
                    await asyncio.sleep(1.5)
                    break
            except PlaywrightTimeoutError:
                continue

        input_box = await find_comment_input(page)

    if not input_box:
        utils.logger.error("[post_comment_ks] 无法找到评论输入框")
        return {"success": False, "error": "no_input_box"}

    # 输入内容
    await input_box.click()
    await asyncio.sleep(0.5)

    try:
        tag_name = await input_box.evaluate("el => el.tagName.toLowerCase()")
    except Exception:
        tag_name = ""

    if tag_name == "div" or await input_box.get_attribute("contenteditable") == "true":
        await input_box.evaluate("el => { el.textContent = ''; el.focus(); }")
        await input_box.type(content, delay=50)
    else:
        await input_box.fill(content)

    await asyncio.sleep(1)
    utils.logger.info(f"[post_comment_ks] 已输入评论: {content[:50]}...")

    # 查找发送按钮
    submit_btn = await find_submit_button(page)

    if submit_btn:
        await submit_btn.click()
        await asyncio.sleep(3)
        utils.logger.info("[post_comment_ks] 评论已提交")
        return {"success": True, "method": "click"}
    else:
        utils.logger.info("[post_comment_ks] 未找到发送按钮，尝试 Enter 键...")
        await input_box.press("Enter")
        await asyncio.sleep(3)
        return {"success": True, "method": "enter"}


async def main():
    video_id = sys.argv[1] if len(sys.argv) > 1 else ""
    content = sys.argv[2] if len(sys.argv) > 2 else ""

    if not video_id or not content:
        print("Usage: python post_comment_ks.py <video_id> <content>")
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
                headless=False,
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

        try:
            await ensure_logged_in(browser_context, page)

            video_url = f"https://www.kuaishou.com/short-video/{video_id}"
            result = await post_comment_flow(page, video_url, content)

            import json as _json
            print(f"POST_COMMENT_RESULT: {_json.dumps(result, ensure_ascii=False)}")
        except Exception as e:
            utils.logger.error(f"[post_comment_ks] 异常: {e}")
            print(f'POST_COMMENT_RESULT: {{"success": false, "error": "{str(e)[:200]}"}}')
        finally:
            await asyncio.sleep(2)
            await browser_context.close()
            utils.logger.info("[post_comment_ks] 完成")


if __name__ == "__main__":
    asyncio.get_event_loop().run_until_complete(main())
