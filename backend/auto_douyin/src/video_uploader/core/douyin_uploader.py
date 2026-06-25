# -*- coding: utf-8 -*-

"""
抖音上传器模块
基于Playwright实现的抖音视频上传功能
"""

import asyncio
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from playwright.async_api import Playwright, async_playwright, Page

from ..models.config import Config
from ..utils.logger import get_logger


class DouyinUploader:
    """抖音上传器类"""

    # Playwright 1.60+ 默认使用 headless shell，可能未安装
    # 回退到 chromium 本体 (chrome.exe) 以兼容现有安装
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

    def __init__(self, account_name: str, cookie_file: str, config: Config):
        self.account_name = account_name
        self.cookie_file = cookie_file
        self.config = config
        self.logger = get_logger(self.__class__.__name__)
        self.date_format = '%Y年%m月%d日 %H:%M'

    async def _launch_browser(self, playwright, headless=False):
        """启动浏览器，headless 模式自动使用 chromium 本体"""
        exe = None
        if headless:
            exe = self._find_chromium()
        if exe:
            return await playwright.chromium.launch(
                headless=True,
                executable_path=exe,
                args=['--headless=new']
            )
        return await playwright.chromium.launch(headless=headless)

    async def check_cookie(self) -> bool:
        """检查Cookie是否有效"""
        if not os.path.exists(self.cookie_file):
            self.logger.warning(f"Cookie文件不存在: {self.cookie_file}")
            return False

        try:
            async with async_playwright() as playwright:
                browser = await self._launch_browser(playwright, headless=True)
                context = await browser.new_context(storage_state=self.cookie_file)
                await self._set_init_script(context)

                page = await context.new_page()
                await page.goto("https://creator.douyin.com/creator-micro/content/upload")

                try:
                    await page.wait_for_url("https://creator.douyin.com/creator-micro/content/upload", timeout=5000)
                except:
                    self.logger.warning("等待5秒 cookie 失效")
                    await context.close()
                    await browser.close()
                    return False

                # 检查是否需要登录
                if await page.get_by_text('手机号登录').count() or await page.get_by_text('扫码登录').count():
                    self.logger.warning("cookie 失效，需要重新登录")
                    await context.close()
                    await browser.close()
                    return False
                else:
                    self.logger.info("cookie 有效")
                    await context.close()
                    await browser.close()
                    return True

        except Exception as e:
            self.logger.error(f"检查Cookie时发生错误: {str(e)}")
            return False

    async def login(self) -> bool:
        """登录并生成Cookie — 扫码后自动检测登录成功，无需手动操作"""
        try:
            # 确保Cookie目录存在
            os.makedirs(os.path.dirname(self.cookie_file), exist_ok=True)

            async with async_playwright() as playwright:
                browser = await self._launch_browser(playwright, headless=False)
                context = await browser.new_context()
                await self._set_init_script(context)

                page = await context.new_page()
                await page.goto("https://creator.douyin.com/")

                # 等待用户扫码登录 — 轮询检测页面跳转
                self.logger.info("请使用抖音扫描二维码登录...")
                try:
                    await page.wait_for_url(
                        "https://creator.douyin.com/creator-micro/**",
                        timeout=120000
                    )
                except Exception:
                    # 也可能登录后跳转到其他路径，检查是否还在登录页
                    pass

                # 等页面稳定后检查是否登录成功
                await asyncio.sleep(2)
                current_url = page.url
                if "creator.douyin.com" in current_url and "login" not in current_url.lower():
                    self.logger.info("检测到登录成功")
                else:
                    # 检查页面内容是否还有登录元素
                    has_login = await page.get_by_text('手机号登录').count() or await page.get_by_text('扫码登录').count()
                    if has_login:
                        self.logger.warning("未检测到登录成功，再等待60秒...")
                        try:
                            await page.wait_for_url("**creator.douyin.com/creator-micro**", timeout=60000)
                            await asyncio.sleep(2)
                        except:
                            self.logger.error("登录超时")
                            await browser.close()
                            return False

                # 保存Cookie
                await context.storage_state(path=self.cookie_file)
                await browser.close()

                self.logger.info(f"Cookie已保存到: {self.cookie_file}")
                return True

        except Exception as e:
            self.logger.error(f"登录过程中发生错误: {str(e)}")
            return False

    async def upload_video(self,
                           video_path: str,
                           title: str,
                           tags: List[str],
                           description: str = None,
                           thumbnail_path: str = None,
                           publish_date: datetime = None,
                           location: str = "北京市",
                           cover_orientation: str = "portrait") -> bool:
        """
        上传视频到抖音

        Args:
            video_path: 视频文件路径
            title: 视频标题
            tags: 话题标签列表
            description: 作品描述
            thumbnail_path: 缩略图路径
            publish_date: 发布时间(None表示立即发布)
            location: 地理位置
            cover_orientation: 封面方向 portrait | landscape

        Returns:
            bool: 上传是否成功
        """
        try:
            async with async_playwright() as playwright:
                return await self._upload_video_impl(
                    playwright, video_path, title, tags, description,
                    thumbnail_path, publish_date, location, cover_orientation
                )
        except Exception as e:
            self.logger.error(f"上传视频时发生错误: {str(e)}")
            return False

    async def upload_images(self,
                            images: List[str],
                            title: str,
                            tags: List[str],
                            description: str = None,
                            publish_date: datetime = None,
                            location: str = "北京市",
                            music_path: str = None,
                            music_query: str = None) -> bool:
        """
        上传图文到抖音

        Args:
            images: 图片文件路径列表
            title: 作品标题
            tags: 话题标签列表
            description: 作品描述
            publish_date: 发布时间(None表示立即发布)
            location: 地理位置
            music_path: 背景音乐文件路径（用于提取搜索词）
            music_query: 音乐搜索关键词（抖音曲库）

        Returns:
            bool: 上传是否成功
        """
        try:
            async with async_playwright() as playwright:
                return await self._upload_images_impl(
                    playwright, images, title, tags, description,
                    publish_date, location, music_path, music_query
                )
        except Exception as e:
            self.logger.error(f"上传图文时发生错误: {str(e)}")
            return False

    async def _upload_video_impl(self,
                                 playwright: Playwright,
                                 video_path: str,
                                 title: str,
                                 tags: List[str],
                                 description: str = None,
                                 thumbnail_path: str = None,
                                 publish_date: datetime = None,
                                 location: str = "北京市",
                                 cover_orientation: str = "portrait") -> bool:
        """上传视频的具体实现"""

        # 启动浏览器
        if self.config.chrome_path:
            browser = await playwright.chromium.launch(
                headless=False,
                executable_path=self.config.chrome_path
            )
        else:
            browser = await self._launch_browser(playwright, headless=False)

        # 创建上下文并设置权限
        context = await browser.new_context(
            storage_state=self.cookie_file,
            permissions=['geolocation'],
            geolocation={'latitude': 39.9042, 'longitude': 116.4074}
        )
        await self._set_init_script(context)

        page = await context.new_page()

        # 设置页面权限处理
        await self._setup_page_permissions(page)

        try:
            # 访问上传页面
            await page.goto("https://creator.douyin.com/creator-micro/content/upload")
            self.logger.info(f'[+]正在上传-------{title}.mp4')

            # 等待页面加载
            await page.wait_for_url("https://creator.douyin.com/creator-micro/content/upload")

            # 上传视频文件
            await page.locator("div[class^='container'] input").set_input_files(video_path)

            # 等待进入发布页面
            await self._wait_for_publish_page(page)

            # 填充标题、描述和话题
            await self._fill_title_and_tags(page, title, tags, description)

            # 截图验证文字是否正确填充
            await page.screenshot(path=f"debug_fill_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png", full_page=True)
            self.logger.info("已保存填充后截图")

            # 等待视频上传完成
            await self._wait_for_upload_complete(page, video_path)

            # 设置缩略图
            if thumbnail_path and os.path.exists(thumbnail_path):
                await self._set_thumbnail(page, thumbnail_path, cover_orientation)

            # 设置地理位置
            await self._set_location(page, location)

            # 设置第三方平台同步
            await self._set_third_party_sync(page)

            # 设置定时发布
            if publish_date:
                await self._set_schedule_time(page, publish_date)

            # 发布视频
            await self._publish_video(page)

            # 保存Cookie
            await context.storage_state(path=self.cookie_file)
            self.logger.info('Cookie已更新')

            await asyncio.sleep(2)
            return True

        except Exception as e:
            self.logger.error(f"上传过程中发生错误: {str(e)}")
            await page.screenshot(path=f"error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
            return False

        finally:
            await context.close()
            await browser.close()

    async def _upload_images_impl(self,
                                   playwright: Playwright,
                                   images: List[str],
                                   title: str,
                                   tags: List[str],
                                   description: str = None,
                                   publish_date: datetime = None,
                                   location: str = "北京市",
                                   music_path: str = None,
                                   music_query: str = None) -> bool:
        """上传图文的具体实现"""

        if self.config.chrome_path:
            browser = await playwright.chromium.launch(
                headless=False,
                executable_path=self.config.chrome_path
            )
        else:
            browser = await self._launch_browser(playwright, headless=False)

        context = await browser.new_context(
            storage_state=self.cookie_file,
            permissions=['geolocation'],
            geolocation={'latitude': 39.9042, 'longitude': 116.4074}
        )
        await self._set_init_script(context)

        page = await context.new_page()
        await self._setup_page_permissions(page)

        try:
            # 访问上传页面
            await page.goto("https://creator.douyin.com/creator-micro/content/upload")
            self.logger.info(f'[+]正在上传图文-------{title}')

            await page.wait_for_url("https://creator.douyin.com/creator-micro/content/upload")

            # 点击"发布图文"标签
            await self._click_image_tab(page)

            # 上传图片
            await self._upload_image_files(page, images)

            # 等待进入发布页面
            await self._wait_for_publish_page(page)

            # 填充标题、描述和话题
            await self._fill_title_and_tags(page, title, tags, description)

            # 等待图片上传完成
            await self._wait_for_image_upload_complete(page)

            # 设置背景音乐
            if music_query or (music_path and os.path.exists(music_path)):
                await self._set_music(page, music_path, music_query)

            # 设置地理位置
            await self._set_location(page, location)

            # 设置第三方平台同步
            await self._set_third_party_sync(page)

            # 设置定时发布
            if publish_date:
                await self._set_schedule_time(page, publish_date)

            # 发布
            await self._publish_video(page)

            await context.storage_state(path=self.cookie_file)
            self.logger.info('Cookie已更新')

            await asyncio.sleep(2)
            return True

        except Exception as e:
            self.logger.error(f"上传图文过程中发生错误: {str(e)}")
            await page.screenshot(path=f"error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
            return False

        finally:
            await context.close()
            await browser.close()

    async def _click_image_tab(self, page: Page):
        """点击'发布图文'标签页"""
        self.logger.info("正在切换到'发布图文'标签...")
        await asyncio.sleep(2)  # 等待页面完全加载

        tab_selectors = [
            'text="发布图文"',
            'div:has-text("发布图文")',
            'span:has-text("发布图文")',
            '[class*="tab"]:has-text("发布图文")',
            'div[class*="tab"]:has-text("图文")',
            'span[class*="tab"]:has-text("图文")',
        ]

        for selector in tab_selectors:
            try:
                el = page.locator(selector).first
                if await el.count() > 0:
                    await el.click()
                    self.logger.info(f"成功点击'发布图文'标签: {selector}")
                    await asyncio.sleep(2)
                    return
            except Exception as e:
                self.logger.debug(f"尝试选择器 {selector} 失败: {str(e)}")
                continue

        self.logger.warning("未找到'发布图文'标签，尝试继续上传")

    async def _upload_image_files(self, page: Page, images: List[str]):
        """上传图片文件"""
        self.logger.info(f"正在上传 {len(images)} 张图片...")

        # 图文模式下的文件上传input
        image_input_selectors = [
            "div[class^='container'] input[type='file']",
            "input[type='file'][accept*='image']",
            "input[type='file']",
        ]

        uploaded = False
        for selector in image_input_selectors:
            try:
                file_input = page.locator(selector).first
                if await file_input.count() > 0:
                    await file_input.set_input_files(images)
                    self.logger.info(f"成功上传图片: {selector}")
                    uploaded = True
                    break
            except Exception as e:
                self.logger.debug(f"尝试上传选择器 {selector} 失败: {str(e)}")
                continue

        if not uploaded:
            raise Exception("无法找到图片上传输入框")

    async def _wait_for_image_upload_complete(self, page: Page):
        """等待图片上传完成"""
        self.logger.info("等待图片上传完成...")
        await asyncio.sleep(2)  # 图片通常上传较快

        # 检查是否有上传进度或重新上传按钮
        max_wait = 60
        waited = 0
        while waited < max_wait:
            try:
                # 检查是否有"重新上传"按钮（表示上传完成）
                number = await page.locator('[class^="long-card"] div:has-text("重新上传")').count()
                if number > 0:
                    self.logger.info("图片上传完毕")
                    return

                # 检查是否有上传失败
                if await page.locator('div:has-text("上传失败")').count():
                    self.logger.error("图片上传失败")
                    raise Exception("图片上传失败")

                self.logger.info("图片上传中...")
                await asyncio.sleep(2)
                waited += 2
            except Exception as e:
                if "图片上传失败" in str(e):
                    raise
                self.logger.info("图片上传中...")
                await asyncio.sleep(2)
                waited += 2

        self.logger.warning("图片上传等待超时，继续后续流程")

    async def _set_music(self, page: Page, music_path: str = None, music_query: str = None):
        """图文模式 — 选择热门榜单第一首音乐"""
        self.logger.info("正在选择背景音乐...")

        # 先看看是否需要展开"扩展信息"区域
        expand_selectors = [
            'text="扩展信息"',
            'span:has-text("扩展信息")',
            'div:has-text("扩展信息")',
        ]
        for selector in expand_selectors:
            try:
                expand_btn = page.locator(selector).first
                if await expand_btn.count() > 0:
                    await expand_btn.click()
                    self.logger.info("展开扩展信息区域")
                    await asyncio.sleep(1)
                    break
            except Exception:
                continue

        # 点击"选择音乐"打开音乐面板
        music_btn_selectors = [
            'text="选择音乐"',
            'span:has-text("选择音乐")',
            'div:has-text("选择音乐")',
        ]

        clicked = False
        for selector in music_btn_selectors:
            try:
                btn = page.locator(selector).first
                if await btn.count() > 0:
                    await btn.click()
                    self.logger.info(f"成功点击音乐按钮: {selector}")
                    clicked = True
                    await asyncio.sleep(3)
                    break
            except Exception as e:
                self.logger.debug(f"尝试音乐选择器 {selector} 失败: {str(e)}")
                continue

        if not clicked:
            self.logger.warning("未找到音乐选择按钮，跳过BGM设置")
            return

        # 点击"热门榜单"标签
        hot_tab_selectors = [
            'text="热门榜单"',
            'span:has-text("热门榜单")',
            'div:has-text("热门榜单")',
            'text="热歌榜"',
            'span:has-text("热歌榜")',
            'div[class*="tab"]:has-text("热门")',
            'div[class*="tab"]:has-text("热歌")',
            'div[role="tab"]:has-text("热门")',
        ]

        for selector in hot_tab_selectors:
            try:
                tab = page.locator(selector).first
                if await tab.count() > 0:
                    await tab.click()
                    self.logger.info(f"点击热门榜单: {selector}")
                    await asyncio.sleep(2)
                    break
            except Exception:
                continue

        # 点击第一个音乐项
        music_item_selectors = [
            '[class*="music"] [class*="item"]',
            '[class*="song"] [class*="item"]',
            'div[class*="list"] div[class*="item"]',
            'div[role="listitem"]',
            'div[class*="card"]',
        ]

        item_clicked = False
        for selector in music_item_selectors:
            try:
                await page.wait_for_selector(selector, timeout=5000)
                items = page.locator(selector)
                count = await items.count()
                self.logger.info(f"音乐列表 [{selector}]: 找到 {count} 个")
                if count > 0:
                    await items.first.click()
                    self.logger.info("已选择第一首音乐")
                    item_clicked = True
                    await asyncio.sleep(1)
                    break
            except Exception:
                continue

        if not item_clicked:
            self.logger.warning("未找到音乐列表，跳过BGM设置")
            await page.keyboard.press("Escape")
            return

        # 点击"使用"确认
        use_selectors = [
            'button:has-text("使用")',
            'text="使用"',
            'button:has-text("确定")',
            'button:has-text("完成")',
        ]

        for selector in use_selectors:
            try:
                btn = page.locator(selector).first
                if await btn.count() > 0:
                    await btn.click()
                    self.logger.info(f"BGM确认: {selector}")
                    await asyncio.sleep(1)
                    return
            except Exception:
                continue

        self.logger.info("BGM设置流程完成")

    async def _wait_for_publish_page(self, page: Page):
        """等待进入发布页面"""
        self.logger.info("等待进入发布页面...")
        while True:
            try:
                await page.wait_for_url(
                    "https://creator.douyin.com/creator-micro/content/publish?enter_from=publish_page",
                    timeout=3000
                )
                self.logger.info("成功进入version_1发布页面!")
                break
            except Exception:
                try:
                    await page.wait_for_url(
                        "https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page",
                        timeout=3000
                    )
                    self.logger.info("成功进入version_2发布页面!")
                    break
                except:
                    try:
                        # 图文发布页面 URL
                        await page.wait_for_url(
                            "https://creator.douyin.com/creator-micro/content/post/image**",
                            timeout=3000
                        )
                        self.logger.info("成功进入图文发布页面!")
                        break
                    except:
                        self.logger.info("超时未进入发布页面，重新尝试...")
                        await asyncio.sleep(0.5)

    async def _fill_title_and_tags(self, page: Page, title: str, tags: List[str], description: str = None):
        """填充标题、描述和话题 — 使用 keyboard.insertText 正确处理中文"""
        await asyncio.sleep(1)
        self.logger.info("正在填充标题、描述和话题...")

        # 填充标题
        title_input = page.get_by_text('作品标题').locator("..").locator("xpath=following-sibling::div[1]").locator("input")
        if await title_input.count():
            await title_input.click()
            await page.keyboard.press("Control+a")
            await page.keyboard.insert_text(title[:55])
        else:
            # fallback: 找页面上的 input
            try:
                fallback = page.locator('input[placeholder*="标题"], [class*="title"] input').first
                await fallback.click()
                await page.keyboard.press("Control+a")
                await page.keyboard.insert_text(title[:55])
            except Exception as e:
                self.logger.warning(f"标题填充失败: {e}")

        # 填充描述
        if description:
            await asyncio.sleep(0.5)
            try:
                # 抖音的描述区是 contenteditable div
                zone = page.locator('.zone-container, .notranslate[contenteditable="true"]').first
                if await zone.count():
                    await zone.click()
                    await asyncio.sleep(0.3)
                    await page.keyboard.press("Control+a")
                    await page.keyboard.insert_text(description)
                    self.logger.info("描述已填充")
                else:
                    self.logger.warning("未找到描述输入区")
            except Exception as e:
                self.logger.warning(f"填充描述失败: {e}")

        # 填充话题标签
        if tags and len(tags) > 0:
            await asyncio.sleep(0.3)
            try:
                zone = page.locator('.zone-container, .notranslate[contenteditable="true"]').first
                if await zone.count():
                    for tag in tags:
                        tag_text = tag.strip()
                        if tag_text:
                            await zone.click()
                            await page.keyboard.press("End")
                            await page.keyboard.insert_text(f" #{tag_text}")
                            await asyncio.sleep(0.2)
                    self.logger.info("话题标签已填充")
            except Exception as e:
                self.logger.warning(f"填充话题标签失败: {e}")

        self.logger.info(f'总共添加{len(tags)}个话题')

    async def _wait_for_upload_complete(self, page: Page, video_path: str):
        """等待视频上传完成"""
        self.logger.info("等待视频上传完成...")
        while True:
            try:
                # 检查是否有重新上传按钮
                number = await page.locator('[class^="long-card"] div:has-text("重新上传")').count()
                if number > 0:
                    self.logger.info("视频上传完毕")
                    break
                else:
                    self.logger.info("正在上传视频中...")
                    await asyncio.sleep(2)

                    # 检查是否上传失败
                    if await page.locator('div.progress-div > div:has-text("上传失败")').count():
                        self.logger.error("发现上传出错了... 准备重试")
                        await self._handle_upload_error(page, video_path)
            except:
                self.logger.info("正在上传视频中...")
                await asyncio.sleep(2)

    async def _handle_upload_error(self, page: Page, video_path: str):
        """处理上传错误"""
        self.logger.info('视频出错了，重新上传中')
        await page.locator('div.progress-div [class^="upload-btn-input"]').set_input_files(video_path)

    async def _set_thumbnail(self, page: Page, thumbnail_path: str, cover_orientation: str = "portrait"):
        """设置视频缩略图"""
        if not thumbnail_path or not os.path.exists(thumbnail_path):
            self.logger.info("缩略图路径无效，跳过缩略图设置")
            return

        self.logger.info(f"开始设置缩略图: {thumbnail_path}, 封面方向: {cover_orientation}")

        try:
            # 尝试点击选择封面按钮 - 多种定位方式
            cover_button_clicked = False
            cover_selectors = [
                'text="选择封面"',
                'button:has-text("选择封面")',
                '[data-testid="cover-select"]',
                '.cover-select-btn',
                'button[class*="cover"]'
            ]

            for selector in cover_selectors:
                try:
                    await page.wait_for_selector(selector, timeout=3000)
                    await page.click(selector)
                    self.logger.info(f"成功点击选择封面按钮: {selector}")
                    cover_button_clicked = True
                    break
                except Exception as e:
                    self.logger.debug(f"尝试选择器 {selector} 失败: {str(e)}")
                    continue

            if not cover_button_clicked:
                self.logger.warning("未找到选择封面按钮，跳过缩略图设置")
                return

            # 等待弹窗出现
            try:
                await page.wait_for_selector("div.semi-modal-content:visible", timeout=5000)
                self.logger.info("封面设置弹窗已打开")
            except:
                self.logger.warning("未检测到封面设置弹窗，继续尝试")

            await asyncio.sleep(1)

            # 根据封面方向点击对应的按钮
            is_landscape = cover_orientation == "landscape"
            cover_label = "横封面" if is_landscape else "竖封面"
            cover_clicked = False

            cover_type_selectors = [
                f'text="设置{cover_label}"',
                f'button:has-text("设置{cover_label}")',
                f'text="{cover_label}"',
                f'button:has-text("{cover_label}")',
            ]

            # 额外尝试 class 选择器
            if is_landscape:
                cover_type_selectors.extend([
                    'button[class*="horizontal"]',
                    'button[class*="landscape"]',
                    '[class*="horizontal-cover"]',
                    '[class*="landscape-cover"]',
                ])
            else:
                cover_type_selectors.extend([
                    'button[class*="vertical"]',
                    '[class*="vertical-cover"]',
                ])

            for selector in cover_type_selectors:
                try:
                    await page.wait_for_selector(selector, timeout=3000)
                    await page.click(selector)
                    self.logger.info(f"成功点击设置{cover_label}: {selector}")
                    cover_clicked = True
                    break
                except Exception as e:
                    self.logger.debug(f"尝试{cover_label}选择器 {selector} 失败: {str(e)}")
                    continue

            if not cover_clicked:
                self.logger.warning(f"未找到设置{cover_label}按钮，尝试直接上传")

            await asyncio.sleep(2)

            # 尝试上传缩略图 - 多种文件上传方式
            upload_success = False
            upload_selectors = [
                "div[class^='semi-upload upload'] >> input.semi-upload-hidden-input",
                "input[type='file'][accept*='image']",
                "input.semi-upload-hidden-input",
                "input[type='file']",
                ".upload-input input",
                "[data-testid='file-upload'] input"
            ]

            for selector in upload_selectors:
                try:
                    upload_input = page.locator(selector)
                    if await upload_input.count() > 0:
                        await upload_input.set_input_files(thumbnail_path)
                        self.logger.info(f"成功上传缩略图文件: {selector}")
                        upload_success = True
                        break
                except Exception as e:
                    self.logger.debug(f"尝试上传选择器 {selector} 失败: {str(e)}")
                    continue

            if not upload_success:
                self.logger.error("无法找到文件上传输入框")
                return

            # 等待上传完成
            await asyncio.sleep(3)

            # 尝试点击完成按钮 - 多种方式
            complete_clicked = False
            complete_selectors = [
                "div[class^='extractFooter'] button:visible:has-text('完成')",
                "button:has-text('完成')",
                "button:has-text('确定')",
                "button:has-text('保存')",
                "[data-testid='confirm-btn']",
                ".confirm-btn",
                ".save-btn"
            ]

            for selector in complete_selectors:
                try:
                    complete_btn = page.locator(selector)
                    if await complete_btn.count() > 0:
                        await complete_btn.click()
                        self.logger.info(f"成功点击完成按钮: {selector}")
                        complete_clicked = True
                        break
                except Exception as e:
                    self.logger.debug(f"尝试完成按钮选择器 {selector} 失败: {str(e)}")
                    continue

            if not complete_clicked:
                self.logger.warning("未找到完成按钮，尝试按ESC键关闭弹窗")
                await page.keyboard.press("Escape")

            await asyncio.sleep(1)
            self.logger.info("缩略图设置流程完成")

        except Exception as e:
            self.logger.error(f"设置缩略图时发生错误: {str(e)}")
            self.logger.info("缩略图设置失败，但不影响视频上传，继续后续流程")

            # 尝试关闭可能打开的弹窗
            try:
                await page.keyboard.press("Escape")
                await asyncio.sleep(1)
            except:
                pass

    async def _set_location(self, page: Page, location: str):
        """设置地理位置"""
        if not location:
            self.logger.info("未指定地理位置，跳过设置")
            return

        self.logger.info(f"开始设置地理位置: {location}")

        try:
            # 处理可能出现的地理位置权限弹窗
            await self._handle_geolocation_permission(page)

            # 多种地理位置输入框定位器
            location_input_clicked = False
            location_selectors = [
                'div.semi-select span:has-text("输入地理位置")',
                'span:has-text("输入地理位置")',
                'text="输入地理位置"',
                '[placeholder*="地理位置"]',
                '[placeholder*="位置"]',
                'input[placeholder*="地理位置"]',
                '.location-input',
                '[data-testid="location-input"]',
                'div.semi-select-selection',
                '.semi-select-selection-text:has-text("输入地理位置")'
            ]

            for selector in location_selectors:
                try:
                    await page.wait_for_selector(selector, timeout=3000)
                    await page.click(selector)
                    self.logger.info(f"成功点击地理位置输入框: {selector}")
                    location_input_clicked = True
                    break
                except Exception as e:
                    self.logger.debug(f"尝试地理位置选择器 {selector} 失败: {str(e)}")
                    continue

            if not location_input_clicked:
                self.logger.warning("未找到地理位置输入框，跳过地理位置设置")
                return

            await asyncio.sleep(1)

            # 清空输入框并输入地理位置
            try:
                # 尝试多种清空方式
                await page.keyboard.press("Control+A")  # 全选
                await page.keyboard.press("Delete")  # 删除
                await asyncio.sleep(0.5)

                # 输入地理位置
                await page.keyboard.type(location)
                self.logger.info(f"已输入地理位置: {location}")
                await asyncio.sleep(2)  # 等待搜索结果

            except Exception as e:
                self.logger.warning(f"输入地理位置时出错: {str(e)}")
                # 尝试直接在输入框中输入
                try:
                    input_element = page.locator('input[placeholder*="地理位置"], input[type="text"]').first
                    await input_element.fill("")
                    await input_element.fill(location)
                    await asyncio.sleep(2)
                except Exception as e2:
                    self.logger.error(f"备用输入方法也失败: {str(e2)}")
                    return

            # 等待并选择下拉选项 - 多种方式
            option_clicked = False
            option_selectors = [
                'div[role="listbox"] [role="option"]',
                '.semi-select-option',
                'div[class*="option"]',
                'li[role="option"]',
                '.location-option',
                '[data-testid="location-option"]',
                'div[class*="dropdown"] div[class*="item"]',
                '.semi-list-item'
            ]

            for selector in option_selectors:
                try:
                    await page.wait_for_selector(selector, timeout=3000)
                    options = page.locator(selector)
                    option_count = await options.count()

                    if option_count > 0:
                        # 尝试点击第一个选项
                        await options.first.click()
                        self.logger.info(f"成功选择地理位置选项: {selector}")
                        option_clicked = True
                        break
                except Exception as e:
                    self.logger.debug(f"尝试选项选择器 {selector} 失败: {str(e)}")
                    continue

            if not option_clicked:
                # 尝试按Enter键确认
                self.logger.warning("未找到下拉选项，尝试按Enter键确认")
                try:
                    await page.keyboard.press("Enter")
                    option_clicked = True
                except Exception as e:
                    self.logger.error(f"按Enter键确认失败: {str(e)}")

            if option_clicked:
                await asyncio.sleep(1)
                self.logger.info(f"地理位置设置完成: {location}")
            else:
                self.logger.warning("地理位置设置可能失败，但继续后续流程")

        except Exception as e:
            self.logger.error(f"设置地理位置时发生错误: {str(e)}")
            self.logger.info("地理位置设置失败，但不影响视频上传，继续后续流程")

    async def _handle_geolocation_permission(self, page: Page):
        """处理地理位置权限弹窗"""
        try:
            # 等待可能的权限弹窗
            await asyncio.sleep(1)

            # 尝试处理浏览器原生权限弹窗
            permission_selectors = [
                'button:has-text("允许")',
                'button:has-text("Allow")',
                'button:has-text("允许访问位置")',
                '[data-testid="permission-allow"]',
                '.permission-allow-btn'
            ]

            for selector in permission_selectors:
                try:
                    permission_btn = page.locator(selector)
                    if await permission_btn.count() > 0:
                        await permission_btn.click()
                        self.logger.info(f"已处理地理位置权限弹窗: {selector}")
                        await asyncio.sleep(1)
                        break
                except Exception as e:
                    self.logger.debug(f"尝试权限选择器 {selector} 失败: {str(e)}")
                    continue

        except Exception as e:
            self.logger.debug(f"处理地理位置权限时出错: {str(e)}")
            # 权限处理失败不影响主流程

    async def _set_third_party_sync(self, page: Page):
        """设置第三方平台同步"""
        try:
            third_part_element = '[class^="info"] > [class^="first-part"] div div.semi-switch'
            if await page.locator(third_part_element).count():
                # 检测是否是已选中状态
                if 'semi-switch-checked' not in await page.eval_on_selector(third_part_element, 'div => div.className'):
                    await page.locator(third_part_element).locator('input.semi-switch-native-control').click()
                    self.logger.info("已启用第三方平台同步")
        except Exception as e:
            self.logger.error(f"设置第三方平台同步时发生错误: {str(e)}")

    async def _set_schedule_time(self, page: Page, publish_date: datetime):
        """设置定时发布"""
        try:
            # 选择定时发布
            label_element = page.locator("[class^='radio']:has-text('定时发布')")
            await label_element.click()
            await asyncio.sleep(1)

            # 设置发布时间
            publish_date_hour = publish_date.strftime("%Y-%m-%d %H:%M")
            await page.locator('.semi-input[placeholder="日期和时间"]').click()
            await page.keyboard.press("Control+KeyA")
            await page.keyboard.type(str(publish_date_hour))
            await page.keyboard.press("Enter")

            self.logger.info(f"定时发布时间设置为: {publish_date_hour}")
            await asyncio.sleep(1)
        except Exception as e:
            self.logger.error(f"设置定时发布时发生错误: {str(e)}")

    async def _publish_video(self, page: Page):
        """发布视频"""
        self.logger.info("正在发布视频...")
        while True:
            try:
                publish_button = page.get_by_role('button', name="发布", exact=True)
                if await publish_button.count():
                    await publish_button.click()

                # 等待跳转到作品管理页面
                await page.wait_for_url("https://creator.douyin.com/creator-micro/content/manage**", timeout=3000)
                self.logger.info("视频发布成功")
                break
            except:
                self.logger.info("视频正在发布中...")
                await page.screenshot(full_page=True)
                await asyncio.sleep(0.5)

    async def _setup_page_permissions(self, page: Page):
        """设置页面权限处理"""
        try:
            # 监听权限请求并自动允许
            async def handle_permission_request(request):
                self.logger.info(f"收到权限请求: {request.name}")
                await request.allow()

            # 监听对话框（包括权限弹窗）
            async def handle_dialog(dialog):
                self.logger.info(f"收到对话框: {dialog.type} - {dialog.message}")
                if "位置" in dialog.message or "location" in dialog.message.lower():
                    await dialog.accept()
                else:
                    await dialog.dismiss()

            # 绑定事件监听器
            page.on("dialog", handle_dialog)

            # 注入自动处理权限的脚本
            await page.add_init_script(
                """
                // 重写 geolocation API 以避免权限弹窗
                if (navigator.geolocation) {
                    const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition;
                    navigator.geolocation.getCurrentPosition = function(success, error, options) {
                        // 直接返回北京坐标
                        success({
                            coords: {
                                latitude: 39.9042,
                                longitude: 116.4074,
                                accuracy: 50
                            },
                            timestamp: Date.now()
                        });
                    };
                }

                // 自动处理权限弹窗
                const originalConfirm = window.confirm;
                window.confirm = function(message) {
                    if (message.includes('位置') || message.includes('location')) {
                        return true;
                    }
                    return originalConfirm.call(this, message);
                };
            """
                )

            self.logger.info("页面权限处理设置完成")

        except Exception as e:
            self.logger.warning(f"设置页面权限处理时发生错误: {str(e)}")

    async def _set_init_script(self, context):
        """设置初始化脚本"""
        try:
            stealth_js_path = Path(__file__).parent / "stealth.min.js"
            if stealth_js_path.exists():
                await context.add_init_script(path=str(stealth_js_path))
            return context
        except Exception as e:
            self.logger.warning(f"设置初始化脚本时发生错误: {str(e)}")
            return context
