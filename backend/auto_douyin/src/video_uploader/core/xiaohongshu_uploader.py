"""
小红书自动上传器
"""

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Optional, List

from playwright.async_api import async_playwright, Page, Browser
from ..models.platforms import XiaohongshuVideoInfo, XiaohongshuAccount
from ..utils.logger import logger


class XiaohongshuUploader:
    """小红书上传器"""

    _CHROMIUM_EXE = None

    @classmethod
    def _find_chromium(cls) -> str | None:
        if cls._CHROMIUM_EXE:
            return cls._CHROMIUM_EXE
        import glob as _glob
        base = Path(os.environ.get('LOCALAPPDATA', os.path.expanduser('~/.cache')))
        candidates = list(_glob.iglob(
            str(base / 'ms-playwright' / 'chromium-*' / 'chrome-win64' / 'chrome.exe'),
            root_dir=str(base)
        ))
        if candidates:
            cls._CHROMIUM_EXE = candidates[0]
        return cls._CHROMIUM_EXE

    async def _launch_browser(self, playwright, headless=False):
        exe = None
        if headless:
            exe = self._find_chromium()
        if exe:
            return await playwright.chromium.launch(
                headless=True, executable_path=exe, args=['--headless=new']
            )
        return await playwright.chromium.launch(headless=headless)

    def __init__(self, headless: bool = False):
        self.headless = headless
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.is_logged_in = False
        
    async def __aenter__(self):
        """异步上下文管理器入口"""
        await self.start_browser()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器出口"""
        await self.close_browser()
        
    async def start_browser(self):
        """启动浏览器"""
        playwright = await async_playwright().start()
        
        # 启动浏览器
        self.browser = await playwright.chromium.launch(
            headless=self.headless,
            args=[
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
            ]
        )
        
        # 创建上下文
        context = await self.browser.new_context(
            viewport={'width': 1280, 'height': 720},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        
        self.page = await context.new_page()
        
        # 添加反检测脚本
        await self._add_stealth_script()
        
        logger.info("浏览器启动成功")
        
    async def _add_stealth_script(self):
        """添加反检测脚本"""
        stealth_script = """
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
        
        window.chrome = {
            runtime: {},
        };
        
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        """
        
        await self.page.add_init_script(stealth_script)
        
    async def close_browser(self):
        """关闭浏览器"""
        if self.browser:
            await self.browser.close()
            logger.info("浏览器已关闭")
            
    async def login(self, account: XiaohongshuAccount) -> bool:
        """登录小红书"""
        try:
            logger.info(f"开始登录小红书账号: {account.name}")

            # 先验证已有 cookie 是否有效（不打开可见浏览器）
            if account.cookie_file and account.cookie_file.exists():
                logger.info("检测到已保存的Cookie，正在验证...")
                if await self.check_cookie(str(account.cookie_file)):
                    self.is_logged_in = True
                    logger.info("使用已保存的登录状态")
                    return True
                logger.info("已保存的Cookie已失效，需要重新登录")

            # 访问小红书创作者中心登录页面
            await self.page.goto("https://creator.xiaohongshu.com/login")
            await asyncio.sleep(3)

            # 确保在登录页
            current_url = self.page.url
            if "/login" not in current_url:
                logger.info(f"已在创作者中心，无需登录: {current_url}")
                self.is_logged_in = True
                await self._save_cookies(account)
                return True

            logger.info("需要扫码登录，请使用小红书APP扫描二维码")
            logger.info("请在弹出的浏览器窗口中扫码登录")

            success = await self._wait_for_login_success()
            if success:
                await self._save_cookies(account)
                self.is_logged_in = True
                logger.info("登录成功")
                return True
            else:
                logger.error("登录失败或超时")
                return False

        except Exception as e:
            logger.error(f"登录过程出错: {str(e)}")
            return False
            
    async def _need_scan_login(self) -> bool:
        """检查是否需要扫码登录"""
        try:
            current_url = self.page.url
            logger.info(f"当前页面URL: {current_url}")

            # 已在发布页面 = 已登录
            if "creator.xiaohongshu.com" in current_url and "/login" not in current_url:
                logger.info("已在创作者中心，无需登录")
                return False

            # URL 包含 /login = 确认需要扫码
            if "/login" in current_url:
                logger.info("当前在登录页，需要扫码")
                return True

            # 兜底：检查页面元素
            qr_selectors = [
                ".qrcode-img", ".login-qr", "[class*='qr']",
                ".login-container", ".scan-login", "[class*='login']"
            ]
            for selector in qr_selectors:
                try:
                    if await self.page.locator(selector).is_visible():
                        logger.info(f"发现登录元素: {selector}")
                        return True
                except Exception:
                    continue

            await asyncio.sleep(2)
            page_content = await self.page.content()
            login_keywords = ["登录", "扫码", "二维码", "login", "qr"]
            for keyword in login_keywords:
                if keyword in page_content:
                    logger.info(f"页面包含登录关键词: {keyword}")
                    return True

            return False
        except Exception as e:
            logger.error(f"检查登录状态失败: {str(e)}")
            return True
            
    async def _wait_for_login_success(self, timeout: int = 300) -> bool:
        """等待登录成功 — 轮询直到 URL 离开登录页"""
        try:
            logger.info(f"等待登录完成，超时时间: {timeout}秒")
            for _ in range(timeout):
                await asyncio.sleep(1)
                current_url = self.page.url
                # 登录页 URL 也匹配 creator.xiaohongshu.com，必须排除 /login
                if "creator.xiaohongshu.com" in current_url and "/login" not in current_url:
                    logger.info(f"登录成功，跳转到: {current_url}")
                    await asyncio.sleep(2)
                    return True
            logger.error("等待登录超时")
            return False
        except Exception as e:
            logger.error(f"等待登录超时或失败: {str(e)}")
            return False
            
    async def _verify_login_status(self) -> bool:
        """验证登录状态"""
        try:
            # 访问创作者中心页面来验证登录状态
            await self.page.goto("https://creator.xiaohongshu.com/")
            await asyncio.sleep(3)

            current_url = self.page.url
            logger.info(f"小红书验证登录状态 - 当前URL: {current_url}")

            # 如果URL包含login说明需要登录，如果包含creator说明已登录
            if "login" in current_url:
                return False
            elif "creator.xiaohongshu.com" in current_url:
                return True
            else:
                # 检查页面内容是否有登录相关元素
                login_elements = await self.page.query_selector_all("[class*='login'], .qr")
                return len(login_elements) == 0

        except Exception as e:
            logger.error(f"验证小红书登录状态失败: {str(e)}")
            return False

    async def check_cookie(self, cookie_file: str = None) -> bool:
        """检查Cookie是否有效（独立headless浏览器，不依赖实例状态）"""
        cookie_path = Path(cookie_file) if cookie_file else None
        if not cookie_path or not cookie_path.exists():
            logger.warning(f"Cookie文件不存在: {cookie_path}")
            return False
        try:
            async with async_playwright() as playwright:
                browser = await self._launch_browser(playwright, headless=True)
                context = await browser.new_context(
                    viewport={'width': 1280, 'height': 720},
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    storage_state=str(cookie_path)
                )
                # 添加反检测脚本
                stealth_js = Path(__file__).parent / "stealth.min.js"
                if stealth_js.exists():
                    await context.add_init_script(path=str(stealth_js))
                page = await context.new_page()
                await page.goto("https://creator.xiaohongshu.com/")
                await asyncio.sleep(3)

                current_url = page.url
                await browser.close()
                if "login" in current_url:
                    return False
                return "creator.xiaohongshu.com" in current_url
        except Exception as e:
            logger.error(f"检查Cookie时发生错误: {str(e)}")
            return False
            
    async def _save_cookies(self, account: XiaohongshuAccount):
        """保存cookies"""
        try:
            cookies_dir = Path("cookies")
            cookies_dir.mkdir(exist_ok=True)
            cookie_file = cookies_dir / f"xiaohongshu_{account.name}.json"
            await self.page.context.storage_state(path=str(cookie_file))
            account.cookie_file = cookie_file
            logger.info(f"Cookies已保存: {cookie_file}")
        except Exception as e:
            logger.error(f"保存cookies失败: {str(e)}")

    async def _load_cookies(self, account: XiaohongshuAccount) -> bool:
        """加载cookies"""
        try:
            if not account.cookie_file or not account.cookie_file.exists():
                return False
            with open(account.cookie_file, 'r', encoding='utf-8') as f:
                state = json.load(f)
            # 兼容旧格式 (纯 cookie 数组) 和 storage_state 格式
            if isinstance(state, dict):
                cookies = state.get('cookies', [])
            else:
                cookies = state
            if isinstance(cookies, list) and len(cookies) > 0:
                await self.page.context.add_cookies(cookies)
            logger.info(f"Cookies已加载: {account.cookie_file}")
            return True
        except Exception as e:
            logger.error(f"加载cookies失败: {str(e)}")
            return False
            
    async def upload_video(self, video_info: XiaohongshuVideoInfo) -> bool:
        """上传视频"""
        try:
            # 重新验证登录状态
            if not self.is_logged_in:
                logger.warning("登录状态未知，正在验证...")
                if not await self._verify_login_status():
                    logger.error("未登录或登录已失效，请重新登录")
                    return False
                else:
                    self.is_logged_in = True

            logger.info(f"开始上传视频: {video_info.video_path}")

            # 访问发布页面
            await self.page.goto("https://creator.xiaohongshu.com/publish/publish")
            await asyncio.sleep(5)

            logger.info(f"当前页面URL: {self.page.url}")

            # 检查是否成功进入发布页面
            if "publish" not in self.page.url and "creator" not in self.page.url:
                logger.error("未能进入发布页面，可能需要重新登录")
                return False

            # 上传视频文件
            if not await self._upload_video_file(video_info.video_path):
                return False

            # 等待视频处理完成
            if not await self._wait_video_processing():
                return False

            # 等待表单加载 + 导出页面输入元素用于诊断
            await asyncio.sleep(5)
            await self._dump_page_inputs()

            # 填写视频信息
            if not await self._fill_video_info(video_info):
                logger.error("填写视频信息失败")
                await self.page.screenshot(path="debug_xhs_fill_info.png")
                await self._dump_page_inputs()
                return False

            # 发布视频
            return await self._publish_video()

        except Exception as e:
            logger.error(f"上传视频失败: {str(e)}")
            return False
            
    async def _upload_video_file(self, video_path: Path) -> bool:
        """上传视频文件"""
        try:
            logger.info("正在寻找小红书文件上传区域...")
            
            # 等待页面完全加载
            await asyncio.sleep(3)
            
            # 小红书可能的文件上传选择器
            upload_selectors = [
                'input[type="file"]',
                'input[accept*="video"]',
                '.upload-btn input[type="file"]',
                '.upload-area input[type="file"]',
                '.file-upload input[type="file"]',
                '.video-upload input[type="file"]'
            ]
            
            file_input = None
            for selector in upload_selectors:
                elements = await self.page.query_selector_all(selector)
                if elements:
                    for element in elements:
                        try:
                            # 检查是否可见或可用
                            is_visible = await element.is_visible()
                            is_enabled = await element.is_enabled()
                            if is_visible or is_enabled:
                                file_input = element
                                logger.info(f"找到文件上传输入框: {selector}")
                                break
                        except:
                            continue
                    if file_input:
                        break
            
            if not file_input:
                # 尝试查找并点击上传区域来触发文件选择
                upload_areas = [
                    '.upload-area',
                    '.upload-zone', 
                    '.drag-upload',
                    '.upload-btn',
                    '[class*="upload"]',
                    '.file-selector',
                    'button[class*="upload"]',
                    '.add-media',
                    '.media-upload'
                ]
                
                for selector in upload_areas:
                    try:
                        if await self.page.locator(selector).is_visible():
                            logger.info(f"点击上传区域: {selector}")
                            await self.page.click(selector)
                            await asyncio.sleep(2)
                            
                            # 再次查找文件输入框
                            file_input = await self.page.query_selector('input[type="file"]')
                            if file_input:
                                logger.info("点击后找到文件输入框")
                                break
                    except Exception as e:
                        logger.debug(f"尝试点击 {selector} 失败: {str(e)}")
                        continue
            
            if not file_input:
                logger.error("未找到文件上传输入框")
                # 截图保存现场以便调试
                await self.page.screenshot(path="debug_xiaohongshu_upload.png")
                logger.info("已保存页面截图: debug_xiaohongshu_upload.png")
                return False
                
            # 上传文件
            await file_input.set_input_files(str(video_path))
            logger.info(f"小红书视频文件 {video_path.name} 上传中...")
            
            return True
            
        except Exception as e:
            logger.error(f"上传视频文件失败: {str(e)}")
            return False
            
    async def _wait_video_processing(self, timeout: int = 300) -> bool:
        """等待视频处理完成"""
        try:
            # 先等预览出现
            preview_selectors = [
                ".video-preview",
                ".preview-container",
                "[class*='preview']",
                "[class*='cover']",
                "video",
            ]
            for selector in preview_selectors:
                try:
                    await self.page.wait_for_selector(selector, timeout=10000)
                    logger.info(f"视频预览已出现: {selector}")
                    break
                except Exception:
                    continue

            # 等待 loading 消失（使用 .first 避免 strict mode 多元素报错）
            loading_selectors = [
                ".loading",
                ".uploading",
                ".processing",
                "[class*='loading']",
                "[class*='progress']",
            ]
            for selector in loading_selectors:
                try:
                    el = self.page.locator(selector).first
                    if await el.count() > 0:
                        try:
                            await el.wait_for(state="hidden", timeout=timeout * 1000)
                        except Exception:
                            pass
                except Exception:
                    continue

            # 额外等待确保表单渲染
            await asyncio.sleep(3)
            logger.info("视频处理完成")
            return True

        except Exception as e:
            logger.warning(f"等待视频处理出错（继续执行）: {str(e)}")
            await asyncio.sleep(5)
            return True  # 不要因为等待失败而中断流程
            
    async def _fill_video_info(self, video_info: XiaohongshuVideoInfo) -> bool:
        """填写视频信息，返回是否成功填写了核心字段（标题+描述）"""
        try:
            logger.info("开始填写小红书视频信息...")

            title_ok = False
            desc_ok = False

            # ── 填写标题 ──
            if video_info.title:
                title_selectors = [
                    'input[placeholder*="标题"]',
                    'textarea[placeholder*="标题"]',
                    'input[placeholder*="title"]',
                    'input[placeholder*="Title"]',
                    '[class*="title"] input',
                    '[class*="title"] textarea',
                    '[class*="note"] input',
                    '[class*="subject"] input',
                    '#title',
                    'input[name*="title"]',
                ]
                title_ok = await self._try_fill_field(title_selectors, video_info.title, "标题")
                if not title_ok:
                    # 兜底：遍历页面上所有可见 input[type=text]，取第一个
                    title_ok = await self._fill_first_visible_input(video_info.title, "标题")
                if not title_ok:
                    logger.warning("未找到标题输入框")

            # ── 填写描述/正文 ──
            if video_info.description:
                desc_selectors = [
                    'textarea[placeholder*="描述"]',
                    'textarea[placeholder*="正文"]',
                    'textarea[placeholder*="内容"]',
                    'textarea[placeholder*="介绍"]',
                    'textarea[placeholder*="desc"]',
                    'textarea[placeholder*="content"]',
                    'textarea[placeholder*="body"]',
                    'textarea[placeholder*="说点什么"]',
                    'textarea:not([placeholder*="标题"])',
                    '[class*="content"] textarea',
                    '[class*="desc"] textarea',
                    '[class*="editor"] textarea',
                    '[class*="note"] textarea',
                    '[class*="post"] textarea',
                    '[contenteditable="true"]',
                    '[role="textbox"]',
                    '.ql-editor',
                    '.rich-text',
                    '#description',
                ]
                desc_ok = await self._try_fill_field(desc_selectors, video_info.description, "描述")
                if not desc_ok:
                    # 兜底：遍历页面上所有 textarea，填充第一个可见的（非标题的）
                    desc_ok = await self._fill_first_visible_textarea(video_info.description, "描述")

            # ── 添加话题标签（追加到描述框）──
            if video_info.topic_tags:
                await self._add_topic_tags(video_info.topic_tags)

            if video_info.tags:
                await self._add_tags(video_info.tags)

            # 选择作品话题/分类（小红书必填）
            await self._select_xhs_topic(video_info)

            if video_info.location:
                await self._set_location(video_info.location)

            logger.info(f"小红书视频信息填写完成 (标题={title_ok}, 描述={desc_ok})")
            return title_ok or desc_ok

        except Exception as e:
            logger.error(f"填写视频信息失败: {str(e)}")
            return False

    async def _try_fill_field(self, selectors: list, text: str, label: str) -> bool:
        """尝试用一组选择器填充字段"""
        for selector in selectors:
            try:
                el = self.page.locator(selector).first
                if await el.count() > 0 and await el.is_visible():
                    await el.click()
                    await asyncio.sleep(0.3)
                    await el.fill(text)
                    logger.info(f"已填写{label}: {text[:30]}... (选择器: {selector})")
                    return True
            except Exception:
                continue
        return False

    async def _fill_first_visible_input(self, text: str, label: str) -> bool:
        """兜底：找到页面上第一个可见的 input[type=text] 并填充"""
        try:
            inputs = self.page.locator('input[type="text"]:visible')
            count = await inputs.count()
            for i in range(min(count, 5)):
                el = inputs.nth(i)
                if await el.is_visible() and await el.is_enabled():
                    await el.click()
                    await asyncio.sleep(0.3)
                    await el.fill(text)
                    logger.info(f"已填写{label}(兜底input): {text[:30]}...")
                    return True
        except Exception:
            pass
        return False

    async def _fill_first_visible_textarea(self, text: str, label: str) -> bool:
        """兜底：找到页面上第一个可见的 textarea 并填充"""
        try:
            textareas = self.page.locator('textarea:visible')
            count = await textareas.count()
            for i in range(min(count, 5)):
                el = textareas.nth(i)
                if await el.is_visible() and await el.is_enabled():
                    # 检查这个 textarea 是否已经有值（可能是标题已填过的）
                    val = await el.input_value()
                    if not val or val == '':
                        await el.click()
                        await asyncio.sleep(0.3)
                        await el.fill(text)
                        logger.info(f"已填写{label}(兜底textarea): {text[:30]}...")
                        return True
            # 如果一个空的 textarea 都没找到，就用第一个
            if count > 0:
                el = textareas.nth(0)
                await el.click()
                await asyncio.sleep(0.3)
                await el.fill(text)
                logger.info(f"已填写{label}(兜底textarea[0]): {text[:30]}...")
                return True
        except Exception as e:
            logger.error(f"兜底textarea填充失败: {e}")
        return False
            
    async def _add_topic_tags(self, topic_tags: List[str]):
        """添加话题标签 — 追加到描述/正文框末尾"""
        try:
            desc_selectors = [
                'textarea:visible',
                '[contenteditable="true"]',
                '[role="textbox"]',
                '[class*="content"] textarea',
                '[class*="editor"] textarea',
                '[class*="desc"] textarea',
            ]
            el = None
            for sel in desc_selectors:
                try:
                    el = self.page.locator(sel).first
                    if await el.count() > 0 and await el.is_visible():
                        break
                except Exception:
                    continue

            if not el:
                logger.warning("未找到描述框用于添加话题标签")
                return

            for tag in topic_tags:
                topic_text = f" #{tag}#"
                current = await el.input_value() if await el.get_attribute('contenteditable') != 'true' else await el.text_content() or ''
                await el.fill(current + topic_text)
                await asyncio.sleep(0.3)

            logger.info(f"已添加话题标签: {topic_tags}")
        except Exception as e:
            logger.error(f"添加话题标签失败: {str(e)}")
            
    async def _add_tags(self, tags: List[str]):
        """添加普通标签 — 小红书标签通常通过 #话题# 格式在正文中添加，此处为兜底"""
        try:
            if not tags:
                return
            tag_selectors = [
                'input[placeholder*="标签"]',
                'input[placeholder*="tag"]',
                'input[placeholder*="话题"]',
                '.tag-input',
                '.tags-input',
            ]
            for tag in tags:
                filled = False
                for selector in tag_selectors:
                    try:
                        el = self.page.locator(selector).first
                        if await el.count() > 0 and await el.is_visible():
                            await el.click()
                            await el.fill(tag)
                            await el.press("Enter")
                            await asyncio.sleep(0.5)
                            filled = True
                            break
                    except Exception:
                        continue
                if not filled:
                    logger.info(f"未找到标签输入框，标签 '{tag}' 已通过话题格式添加")
            logger.info(f"已添加标签: {tags}")
        except Exception as e:
            logger.error(f"添加标签失败: {str(e)}")
            
    async def _select_xhs_topic(self, video_info):
        """选择小红书作品话题/分类（必填项）"""
        try:
            # 点击「参与话题」或「添加话题」按钮
            topic_triggers = [
                'text="参与话题"',
                'text="添加话题"',
                'span:has-text("参与话题")',
                'span:has-text("添加话题")',
                'div:has-text("参与话题")',
                'div:has-text("添加话题")',
                'text="选择话题"',
                'text="话题"',
                '[class*="topic"]',
                '[class*="category"]',
            ]
            clicked = False
            for sel in topic_triggers:
                try:
                    el = self.page.locator(sel).first
                    if await el.count() > 0 and await el.is_visible():
                        await el.click()
                        logger.info(f"点击话题入口: {sel}")
                        clicked = True
                        await asyncio.sleep(2)
                        break
                except Exception:
                    continue

            if not clicked:
                logger.info("未找到话题选择入口（可能不需要）")
                return

            # 在弹出的面板中选择第一个话题
            topic_options = [
                '[class*="topic"] [class*="item"]:first-child',
                '[class*="category"] [class*="item"]:first-child',
                '[class*="dropdown"] [class*="item"]:first-child',
                '[role="listbox"] [role="option"]:first-child',
                '[class*="popup"] [class*="item"]:first-child',
                '[class*="modal"] [class*="item"]:first-child',
                '[class*="panel"] [class*="item"]:first-child',
                'div[class*="item"]:has-text("科技")',
                'div[class*="item"]:has-text("生活")',
                'div[class*="item"]:has-text("知识")',
                '[class*="option"]:first-child',
            ]
            for sel in topic_options:
                try:
                    el = self.page.locator(sel).first
                    if await el.count() > 0 and await el.is_visible():
                        await el.click()
                        logger.info(f"已选择话题: {sel}")
                        await asyncio.sleep(1)
                        return
                except Exception:
                    continue

            # 兜底：如果有话题搜索框，输入关键词
            search_selectors = [
                'input[placeholder*="搜索"]',
                'input[placeholder*="话题"]',
                'input[placeholder*="search"]',
            ]
            for sel in search_selectors:
                try:
                    el = self.page.locator(sel).first
                    if await el.count() > 0 and await el.is_visible():
                        await el.fill("科技")
                        await asyncio.sleep(1)
                        await el.press("Enter")
                        await asyncio.sleep(1)
                        # 选第一个结果
                        first = self.page.locator('[class*="item"]:first-child, [class*="result"]:first-child').first
                        if await first.count() > 0 and await first.is_visible():
                            await first.click()
                        logger.info("通过搜索选择了话题")
                        return
                except Exception:
                    continue

            logger.warning("未能选择话题")
        except Exception as e:
            logger.error(f"选择话题失败: {e}")

    async def _set_location(self, location: str):
        """设置地理位置"""
        try:
            # 查找位置设置按钮
            location_selectors = [
                ".location-btn",
                ".add-location",
                "[class*='location']"
            ]
            
            for selector in location_selectors:
                if await self.page.locator(selector).is_visible():
                    await self.page.click(selector)
                    await asyncio.sleep(1)
                    
                    # 搜索位置
                    search_input = ".location-search input, .search-input input"
                    if await self.page.locator(search_input).is_visible():
                        await self.page.fill(search_input, location)
                        await asyncio.sleep(2)
                        
                        # 选择第一个搜索结果
                        first_result = ".location-list .location-item:first-child, .search-result:first-child"
                        if await self.page.locator(first_result).is_visible():
                            await self.page.click(first_result)
                            logger.info(f"已设置位置: {location}")
                            return
                            
        except Exception as e:
            logger.error(f"设置位置失败: {str(e)}")
            
    async def _set_visibility(self, visible_type: str):
        """设置可见性"""
        try:
            # 查找隐私设置
            privacy_selectors = [
                ".privacy-setting",
                ".visibility-setting",
                "[class*='privacy']",
                "[class*='visibility']"
            ]
            
            for selector in privacy_selectors:
                if await self.page.locator(selector).is_visible():
                    await self.page.click(selector)
                    await asyncio.sleep(1)
                    
                    # 根据可见性类型选择对应选项
                    if visible_type == "public":
                        option_selector = "[data-value='public'], .public-option"
                    elif visible_type == "friends":
                        option_selector = "[data-value='friends'], .friends-option"
                    else:  # private
                        option_selector = "[data-value='private'], .private-option"
                        
                    if await self.page.locator(option_selector).is_visible():
                        await self.page.click(option_selector)
                        logger.info(f"已设置可见性: {visible_type}")
                        return
                        
        except Exception as e:
            logger.error(f"设置可见性失败: {str(e)}")
            
    async def _publish_video(self) -> bool:
        """发布视频"""
        try:
            logger.info("正在发布...")
            await asyncio.sleep(2)

            publish_selectors = [
                'button:has-text("发布")',
                'button:has-text("提交")',
                'button:has-text("publish")',
                'button:has-text("Publish")',
                '[class*="publish"] button',
                '[class*="submit"] button',
                '[class*="publish-btn"]',
                '[class*="submit-btn"]',
                'button[class*="publish"]',
                'button[class*="submit"]',
                'div[role="button"]:has-text("发布")',
                'span:has-text("发布")',
                '.btn-publish',
                '#publish-btn',
            ]

            clicked = False
            for selector in publish_selectors:
                try:
                    el = self.page.locator(selector).first
                    if await el.count() > 0 and await el.is_visible():
                        if await el.is_enabled():
                            await el.click()
                            logger.info(f"点击发布按钮: {selector}")
                            clicked = True
                            break
                        else:
                            logger.info(f"发布按钮存在但被禁用: {selector}")
                except Exception:
                    continue

            if not clicked:
                logger.error("未找到可点击的发布按钮")
                await self.page.screenshot(path="debug_xhs_publish.png")
                return False

            # 等待发布完成
            await asyncio.sleep(5)

            # 检查是否发布成功
            success = await self._check_publish_success()
            if success:
                logger.info("视频发布成功")
            else:
                logger.warning("发布结果未确认，可能已成功")
            return True

        except Exception as e:
            logger.error(f"发布视频失败: {str(e)}")
            return False
            
    async def _dump_page_inputs(self):
        """诊断：导出页面上所有输入元素和按钮到日志文件"""
        try:
            result = await self.page.evaluate("""() => {
                const items = [];
                document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"], button, [role="button"], [class*="btn"], [class*="button"]').forEach(el => {
                    const style = el.offsetParent !== null ? 'visible' : 'hidden';
                    const text = (el.textContent || '').trim().substring(0, 50);
                    if (!text && !el.placeholder && el.tagName === 'BUTTON') return;
                    items.push({
                        tag: el.tagName,
                        type: el.type || '',
                        placeholder: el.placeholder || '',
                        name: el.name || '',
                        id: el.id || '',
                        className: (el.className?.substring?.(0, 80) || '') + (typeof el.className === 'object' ? '[SVG]' : ''),
                        visible: el.offsetParent !== null,
                        text: text,
                        value: (el.value || '').substring(0, 30),
                        disabled: el.disabled || false,
                    });
                });
                return JSON.stringify(items, null, 2);
            }""")
            with open(Path(__file__).parent.parent.parent.parent / "debug_xhs_inputs.json", "w", encoding="utf-8") as f:
                f.write(result)
            logger.info("页面输入元素已导出到 debug_xhs_inputs.json")
        except Exception as e:
            logger.error(f"导出页面输入元素失败: {e}")

    async def _check_publish_success(self) -> bool:
        """检查发布是否成功"""
        try:
            # 查找成功提示
            success_selectors = [
                '[class*="success"]',
                '[class*="toast"]',
                '.el-message--success',
                '.ant-message-success',
            ]
            for selector in success_selectors:
                try:
                    el = self.page.locator(selector).first
                    if await el.count() > 0 and await el.is_visible():
                        logger.info(f"检测到发布成功提示: {selector}")
                        return True
                except Exception:
                    continue

            # 检查是否跳转到作品管理页面
            await asyncio.sleep(2)
            current_url = self.page.url
            if "manage" in current_url or "content" in current_url or "home" in current_url:
                logger.info(f"页面已跳转: {current_url}")
                return True
            if "/publish" in current_url:
                logger.info("仍在发布页面，可能发布未完成")
                return False
            return "creator.xiaohongshu.com" in current_url
        except Exception:
            return False