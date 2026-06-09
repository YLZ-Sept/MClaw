"""
Crawl4AI MCP Server — stdio-based MCP server wrapping Crawl4AI.
Exposes crawl, extract_links, and structured_extract tools.
Usage: python crawl4ai_mcp_server.py
"""
import sys
import json
import asyncio
from typing import Any

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode, LLMConfig
from crawl4ai.extraction_strategy import LLMExtractionStrategy

# ─── MCP protocol framing ───

def send_response(request_id: str, result: Any):
    """Send a JSON-RPC response over stdout."""
    body = json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result}, ensure_ascii=False)
    frame = f"Content-Length: {len(body.encode())}\r\n\r\n{body}"
    sys.stdout.buffer.write(frame.encode('utf-8'))
    sys.stdout.buffer.flush()

def send_notification(method: str, params: dict = None):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params or {}}, ensure_ascii=False)
    frame = f"Content-Length: {len(body.encode())}\r\n\r\n{body}"
    sys.stdout.buffer.write(frame.encode('utf-8'))
    sys.stdout.buffer.flush()

def send_error(request_id: str, code: int, message: str):
    body = json.dumps({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})
    frame = f"Content-Length: {len(body.encode())}\r\n\r\n{body}"
    sys.stdout.buffer.write(frame.encode('utf-8'))
    sys.stdout.buffer.flush()

def read_message() -> dict | None:
    """Read a single JSON-RPC message from stdin (binary-safe, cross-platform)."""
    stdin = sys.stdin.buffer  # Use binary mode to avoid \r\n → \n on Windows
    header = b""
    while True:
        ch = stdin.read(1)
        if not ch:
            return None
        header += ch
        if header.endswith(b"\r\n\r\n"):
            break

    content_len = 0
    for line in header.decode().split("\r\n"):
        if line.lower().startswith("content-length:"):
            content_len = int(line.split(":")[1].strip())
            break

    if content_len == 0:
        return None

    body = stdin.read(content_len).decode()
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return None

# ─── Crawl4AI tools ───

_crawler: AsyncWebCrawler = None

async def get_crawler():
    global _crawler
    if _crawler is None:
        _crawler = AsyncWebCrawler(verbose=False)
        await _crawler.start()
    return _crawler

# Tool definitions
TOOLS = [
    {
        "name": "crawl_page",
        "description": "使用隐身浏览器抓取单个网页，返回 Markdown 格式内容。适用于采集招标公告列表页。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "要抓取的网页 URL"},
                "wait_for": {"type": "string", "description": "等待策略: load/domcontentloaded/networkidle", "default": "networkidle"},
                "timeout": {"type": "integer", "description": "超时（毫秒）", "default": 30000},
                "cookies": {"type": "array", "items": {"type": "object"}, "description": "要注入的 cookies 列表"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "extract_links",
        "description": "从抓取的页面中提取链接，支持关键词过滤。返回匹配的链接列表。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "要抓取的网页 URL"},
                "keywords": {"type": "array", "items": {"type": "string"}, "description": "用于过滤链接文本的关键词列表"},
                "min_title_length": {"type": "integer", "description": "链接文本最小长度", "default": 8}
            },
            "required": ["url"]
        }
    },
    {
        "name": "structured_extract",
        "description": "抓取页面并使用 LLM 进行结构化数据提取。用于从招标详情页提取项目名称、金额、时间等结构化字段。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "要提取的页面 URL"},
                "schema_description": {"type": "string", "description": "描述需要提取的字段，如'提取招标项目的标题、项目编号、预算金额、投标截止时间'"},
                "wait_for": {"type": "string", "description": "等待策略", "default": "networkidle"}
            },
            "required": ["url", "schema_description"]
        }
    }
]

async def handle_tool_call(name: str, args: dict) -> str:
    crawler = await get_crawler()

    if name == "crawl_page":
        url = args["url"]
        wait_for = args.get("wait_for", "")
        timeout = args.get("timeout", 30000)

        wait_selectors = {"load", "domcontentloaded", "networkidle", ""}
        config = CrawlerRunConfig(
            wait_for=wait_for if wait_for not in wait_selectors else None,
            page_timeout=timeout,
            cache_mode=CacheMode.BYPASS
        )
        result = await crawler.arun(url=url, config=config)
        return result.markdown or result.html[:10000] if result.html else ""

    elif name == "extract_links":
        url = args["url"]
        keywords = args.get("keywords", [])
        min_len = args.get("min_title_length", 8)

        config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS
        )
        result = await crawler.arun(url=url, config=config)
        text = result.markdown or ""

        # Parse links from markdown: [title](url)
        import re
        link_pattern = re.compile(r'\[([^\]]+)\]\((https?://[^)]+)\)')
        matches = link_pattern.findall(text)

        # Also extract <a> tags from HTML
        if result.html:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(result.html, 'lxml')
            for a in soup.find_all('a'):
                title = (a.get_text(strip=True) or "").replace('\n', ' ').replace('\r', '')
                href = (a.get('href') or "").strip()
                if title and href and href.startswith('http'):
                    matches.append((title, href))

        # Deduplicate by title
        seen = set()
        unique = []
        for title, href in matches:
            title = title.strip()
            if title in seen or len(title) < min_len or len(title) > 300:
                continue
            # Filter nav/copyright links
            skip = {'首页', '上一页', '下一页', '末页', '返回', '更多', '详情', '查看', '附件',
                    '下载', '登录', '注册', '注销', 'English', '中文', '无障碍', '适老化',
                    '网站地图', '关于', '联系', '版权', '隐私', 'RSS', '订阅'}
            if title in skip:
                continue
            seen.add(title)
            matched_kw = [kw for kw in keywords if kw in title] if keywords else [True]
            if matched_kw:
                unique.append({"title": title, "url": href})

        return json.dumps(unique, ensure_ascii=False)

    elif name == "structured_extract":
        url = args["url"]
        schema_desc = args.get("schema_description", "")
        wait_for = args.get("wait_for", "")
        wait_selectors2 = {"load", "domcontentloaded", "networkidle", ""}

        # Use Crawl4AI's LLM extraction strategy with env-provided creds
        import os
        llm_provider = os.environ.get("CRAWL4AI_LLM_PROVIDER", "")
        llm_api_key = os.environ.get("CRAWL4AI_LLM_API_KEY")
        llm_api_base = os.environ.get("CRAWL4AI_LLM_API_BASE")

        if llm_provider and llm_api_key:
            llm_kwargs = {"provider": llm_provider, "api_token": llm_api_key}
            if llm_api_base:
                llm_kwargs["api_base"] = llm_api_base
            extraction_strategy = LLMExtractionStrategy(
                llm_config=LLMConfig(**llm_kwargs),
                instruction=schema_desc,
                extraction_type="json"
            )
        else:
            extraction_strategy = None

        config = CrawlerRunConfig(
            wait_for=wait_for if wait_for not in wait_selectors2 else None,
            cache_mode=CacheMode.BYPASS,
            extraction_strategy=extraction_strategy
        )
        result = await crawler.arun(url=url, config=config)
        if result.extracted_content:
            return result.extracted_content
        return json.dumps({"markdown": result.markdown[:5000] if result.markdown else ""}, ensure_ascii=False)

    else:
        return json.dumps({"error": f"Unknown tool: {name}"})

# ─── Main loop ───

async def main():
    while True:
        msg = read_message()
        if msg is None:
            break

        method = msg.get("method", "")
        req_id = msg.get("id", "")

        try:
            if method == "initialize":
                send_response(req_id, {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "crawl4ai-mcp", "version": "1.0"}
                })
                # Send initialized notification after a short delay
                await asyncio.sleep(0.01)
                send_notification("notifications/initialized")

            elif method == "tools/list":
                send_response(req_id, {"tools": TOOLS})

            elif method == "tools/call":
                tool_name = msg.get("params", {}).get("name", "")
                tool_args = msg.get("params", {}).get("arguments", {})
                result_text = await handle_tool_call(tool_name, tool_args)
                send_response(req_id, {
                    "content": [{"type": "text", "text": result_text}]
                })

            elif method == "ping":
                send_response(req_id, {})

            elif method == "notifications/initialized":
                pass  # no response needed

            else:
                send_error(req_id, -32601, f"Method not found: {method}")

        except Exception as e:
            send_error(req_id, -32603, str(e))

if __name__ == "__main__":
    asyncio.run(main())
