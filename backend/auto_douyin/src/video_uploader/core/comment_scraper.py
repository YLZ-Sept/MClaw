"""
评论采集器 — 复用 auto_douyin Playwright 浏览器 + Cookie，从帖子页面提取评论
"""
import asyncio
import json
import os
import re
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright

from ..utils.logger import get_logger

logger = get_logger(__name__)

# cookies 目录 (相对于项目根)
COOKIES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "cookies"


def _find_cookie_file(platform: str) -> str | None:
    """查找平台最新的 cookie 文件"""
    if not COOKIES_DIR.exists():
        return None
    prefix = f"{platform}_"
    files = sorted(
        [f for f in os.listdir(COOKIES_DIR) if f.startswith(prefix) and f.endswith(".json")],
        key=lambda f: os.path.getmtime(os.path.join(COOKIES_DIR, f)),
        reverse=True,
    )
    return str(COOKIES_DIR / files[0]) if files else None


def _resolve_douyin_short_url(short_url: str) -> str | None:
    """解析抖音短链接 (v.douyin.com) → 提取帖子 ID 构造直链"""
    try:
        req = urllib.request.Request(short_url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            final_url = resp.geturl()
        logger.info(f"短链接解析: {short_url[:50]} → {final_url[:80]}")
        # /video/{id} 或 /note/{id} 或 share/video/{id}
        for pattern in [r"video/(\d+)", r"note/(\d+)", r"share/video/(\d+)"]:
            m = re.search(pattern, final_url)
            if m:
                prefix = "video" if "video" in pattern else "note"
                return f"https://www.douyin.com/{prefix}/{m.group(1)}"
        logger.warning(f"无法从重定向 URL 提取帖子 ID: {final_url[:100]}")
        return None
    except Exception as e:
        logger.error(f"短链接解析失败: {e}")
        return None


def _build_douyin_target_url(post_url: str) -> str:
    """将抖音帖子 URL 转换为可直接导航的页面 URL（支持 video 和 note）"""
    # 直链: douyin.com/video/{id} 或 douyin.com/note/{id}
    for pattern in [r"video/(\d+)", r"note/(\d+)"]:
        m = re.search(pattern, post_url)
        if m:
            prefix = "video" if "video" in pattern else "note"
            return f"https://www.douyin.com/{prefix}/{m.group(1)}"

    # 短链接: v.douyin.com/xxx
    if "v.douyin.com" in post_url:
        resolved = _resolve_douyin_short_url(post_url)
        if resolved:
            return resolved
        logger.warning(f"短链接解析失败，使用原始 URL: {post_url[:60]}")

    return post_url


# ──── 抖音 ────

async def _scrape_douyin_comments(post_url: str, cookie_file: str | None = None) -> list[dict]:
    """从抖音帖子页面提取评论"""
    cookie = cookie_file or _find_cookie_file("douyin")
    if not cookie:
        raise RuntimeError("未找到抖音 cookie 文件，请先在发布步骤中登录")

    target = _build_douyin_target_url(post_url)

    comments = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(storage_state=cookie)
        page = await context.new_page()

        # 注入 stealth
        stealth_path = Path(__file__).parent / "stealth.min.js"
        if stealth_path.exists():
            await context.add_init_script(path=str(stealth_path))

        try:
            logger.info(f"导航到: {target}")
            await page.goto(target, wait_until="domcontentloaded", timeout=30000)

            # 等待评论区渲染（抖音需要一定时间加载评论区）
            await asyncio.sleep(5)

            # 等待评论区域加载
            try:
                await page.wait_for_selector(".comment-mainContent", timeout=10000)
            except Exception:
                try:
                    await page.wait_for_selector("[data-e2e='comment-list']", timeout=10000)
                except Exception:
                    pass

            # 滚动加载更多评论
            for _ in range(6):
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1.5)

            # ── 从 DOM 提取评论（基于实际 HTML 结构）──
            comments = await page.evaluate("""() => {
                const results = [];
                const seen = new Set();

                // 评论项容器: div.J1g_n48Z.vLI7Tj17
                const items = document.querySelectorAll('.J1g_n48Z.vLI7Tj17');
                for (const item of items) {
                    // 作者: .Sw1iq0tk > a
                    const authorEl = item.querySelector('.Sw1iq0tk a');
                    const author = authorEl?.innerText?.trim() || '匿名';
                    // 去掉"作者"后缀标签
                    const cleanAuthor = author.replace(/作者$/, '').trim();

                    // 内容: .Pmn4RZdg 内第一个 span.ikxmLIZA 的文本（避免混入标签）
                    const contentEl = item.querySelector('.Pmn4RZdg .ikxmLIZA') || item.querySelector('.Pmn4RZdg span');
                    let content = contentEl?.innerText?.trim() || '';
                    // 去掉可能的标签后缀
                    content = content.replace(/作者赞过$/g, '').replace(/置顶$/g, '').trim();

                    // 时间: 可能在 item 内的其他位置
                    const timeEl = item.querySelector('[class*="time"], [class*="Time"], [class*="date"]');
                    const time = timeEl?.innerText?.trim() || '';

                    if (content && content.length > 1 && !seen.has(content.slice(0, 50))) {
                        seen.add(content.slice(0, 50));
                        results.push({
                            comment_content: content.slice(0, 1000),
                            comment_author: cleanAuthor,
                            comment_likes: 0,
                            comment_time: time,
                            post_url: window.location.href,
                            post_title: document.title || '',
                        });
                    }
                }

                // 如果精确匹配失败，后备方案
                if (results.length === 0) {
                    // 用 comment-item-info-wrap 找
                    const fallbackItems = document.querySelectorAll('.comment-item-info-wrap');
                    for (const item of fallbackItems) {
                        const authorEl = item.querySelector('.Sw1iq0tk a');
                        const author = authorEl?.innerText?.trim() || '匿名';
                        const cleanAuthor = author.replace(/作者$/, '').trim();
                        // 找兄弟节点的内容
                        const parent = item.parentElement;
                        const contentEl = parent?.querySelector('.Pmn4RZdg');
                        let content = contentEl?.innerText?.trim() || '';
                        content = content.replace(/作者赞过/g, '').replace(/置顶$/m, '').replace(/作者$/m, '').replace(/\s+$/gm, '').trim();
                        if (content && content.length > 1 && !seen.has(content.slice(0, 50))) {
                            seen.add(content.slice(0, 50));
                            results.push({
                                comment_content: content.slice(0, 1000),
                                comment_author: cleanAuthor,
                                comment_likes: 0,
                                comment_time: '',
                                post_url: window.location.href,
                                post_title: document.title || '',
                            });
                        }
                    }
                }
                return results;
            }""")

            logger.info(f"抖音提取到 {len(comments)} 条评论")

        except Exception as e:
            logger.error(f"抖音评论采集失败: {e}")
        finally:
            await context.close()
            await browser.close()

    return comments


# ──── 小红书 ────

async def _scrape_xiaohongshu_comments(post_url: str, cookie_file: str | None = None) -> list[dict]:
    """从小红书帖子页面提取评论"""
    cookie = cookie_file or _find_cookie_file("xiaohongshu")
    if not cookie:
        raise RuntimeError("未找到小红书 cookie 文件，请先在发布步骤中登录")

    # 从 URL 提取笔记 ID
    nid = re.search(r"explore/([a-zA-Z0-9]+)", post_url)
    nid = nid.group(1) if nid else ""
    target = f"https://www.xiaohongshu.com/explore/{nid}" if nid else post_url

    comments = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(storage_state=cookie)
        page = await context.new_page()

        stealth_path = Path(__file__).parent / "stealth.min.js"
        if stealth_path.exists():
            await context.add_init_script(path=str(stealth_path))

        try:
            logger.info(f"导航到: {target}")
            await page.goto(target, wait_until="domcontentloaded", timeout=30000)

            # 等待评论区渲染
            await asyncio.sleep(5)

            # 等待评论区域
            try:
                await page.wait_for_selector(".comments-container, .comment-item, .note-comment", timeout=10000)
            except Exception:
                pass

            # 滚动加载
            for _ in range(5):
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1.5)

            # 提取评论
            comments = await page.evaluate("""() => {
                const results = [];
                const items = document.querySelectorAll('.comment-item, .comments-el .item, [class*="CommentItem"]');
                items.forEach(el => {
                    const content = el.querySelector('.content, .comment-content, [class*="content"]')?.innerText?.trim();
                    const author = el.querySelector('.author, .username, .nickname, [class*="author"] a, [class*="username"]')?.innerText?.trim();
                    const likes = el.querySelector('.like-count, .likes span, [class*="like"] span')?.innerText?.trim() || '0';
                    const time = el.querySelector('.date, .time, [class*="date"]')?.innerText?.trim() || '';
                    if (content) {
                        results.push({
                            comment_content: content.slice(0, 1000),
                            comment_author: author || '匿名',
                            comment_likes: parseInt(likes) || 0,
                            comment_time: time,
                            post_url: window.location.href,
                            post_title: document.title || '',
                        });
                    }
                });
                return results;
            }""")

            logger.info(f"小红书提取到 {len(comments)} 条评论")

        except Exception as e:
            logger.error(f"小红书评论采集失败: {e}")
        finally:
            await context.close()
            await browser.close()

    return comments


# ──── 调度入口 ────

async def scrape_comments(platform: str, post_url: str, cookie_file: str | None = None) -> list[dict]:
    """采集指定平台帖子页面的评论"""
    p = platform.lower()
    if p in ("douyin", "dy"):
        return await _scrape_douyin_comments(post_url, cookie_file)
    elif p in ("xiaohongshu", "xhs"):
        return await _scrape_xiaohongshu_comments(post_url, cookie_file)
    else:
        logger.warning(f"暂不支持的平台: {platform}，返回空列表")
        return []
