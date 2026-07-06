"""
Scrapling-based bid collector — parallel path to Crawl4AI
Uses DynamicFetcher (Playwright) for proper CJK encoding support on gov sites.
Usage: python scrapling_crawler.py <source_url> <keyword1,keyword2,...>
Output: JSON array of matched items with detail extraction
"""
import sys
import json
import time
import random
import re

# Force UTF-8 output (needed on Windows GBK terminals)
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from scrapling import DynamicFetcher
from urllib.parse import urljoin


def random_delay(min_s=3, max_s=8):
    time.sleep(min_s + random.random() * (max_s - min_s))


def extract_detail(fetcher, url):
    """Extract structured bid data matching Excel columns for 中标信息统计 / 采购意向"""
    try:
        page = fetcher.fetch(url, timeout=30000)
        html = page.html_content or ''

        if not html or len(html) < 100:
            return None

        # Strip HTML tags for cleaner text extraction
        text = re.sub(r'<[^>]+>', ' ', html)
        text = re.sub(r'[ \t\r]+', ' ', text)
        text = re.sub(r'\n\s*\n', '\n', text)

        result = {}

        # ── 项目名称 ──
        for pat in [
            r'(?:项目名称|采购项目名称|招标项目名称)[：:\s]*(.+?)(?:\n|$)',
            r'<title>(.+?)</title>',
        ]:
            m = re.search(pat, html, re.IGNORECASE)
            if m:
                val = re.sub(r'<[^>]+>', '', m.group(1)).strip()
                val = re.sub(r'\s+', ' ', val)
                if len(val) >= 4:
                    result['title'] = val[:200]
                    break

        # ── 项目编号 ──
        m = re.search(r'(?:项目编号|招标编号|采购编号|项目登记号)[：:\s]*[<br>\s]*([A-Za-z0-9\-\/]{4,40})', html, re.IGNORECASE)
        if m: result['project_no'] = m.group(1).strip()

        # ── 预算金额/项目金额 ──
        for pat in [
            r'(?:预算金额|采购预算|项目预算|预算|项目金额|总投资)[：:\s]*[<br>\s]*(\d[\d.,]*)\s*(?:万元|万)?',
        ]:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                result['amount'] = m.group(1).strip()
                break

        # ── 中标金额/成交金额 ──
        for pat in [
            r'(?:中标金额|成交金额|中标价|中标总金额)[：:\s]*[<br>\s]*(\d[\d.,]*)\s*(?:万元|万)?',
        ]:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                result['win_amount'] = m.group(1).strip()
                break

        # ── 招标方式 ──
        m = re.search(r'(?:采购方式|招标方式)[：:\s]*[<br>\s]*([^\n<]{2,10})', html, re.IGNORECASE)
        if m:
            result['bid_type'] = m.group(1).strip()
        else:
            # Infer from text
            if '竞争性磋商' in text: result['bid_type'] = '竞争性磋商'
            elif '竞争性谈判' in text: result['bid_type'] = '竞争性谈判'
            elif '询价' in text: result['bid_type'] = '询价'
            elif '单一来源' in text: result['bid_type'] = '单一来源'

        # ── 招标方/采购人 ──
        m = re.search(r'(?:采购人|招标人|采购单位|招标单位|业主单位)[：:\s]*[<br>\s]*([^\n<]{2,60})', html, re.IGNORECASE)
        if m: result['bidder'] = m.group(1).strip()[:80]

        # ── 中标公司 ──
        m = re.search(r'(?:中标人|中标单位|成交供应商|供应商名称|中标供应商|中标人名称)[：:\s]*[<br>\s]*([^\n<]{2,60})', html, re.IGNORECASE)
        if m: result['win_company'] = m.group(1).strip()[:80]

        # ── 获取招标文件截止时间 ──
        m = re.search(r'(?:获取.*?(?:截止|结束)|文件.*?截止|招标文件获取.*?截止)[：:\s]*[<br>\s]*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[^\n<]{0,20})', html, re.IGNORECASE)
        if m: result['doc_deadline'] = m.group(1).strip()

        # ── 开标时间/投标截止时间 ──
        m = re.search(r'(?:开标时间|投标截止时间|开标日期|递交截止时间)[：:\s]*[<br>\s]*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[^\n<]{0,30})', html, re.IGNORECASE)
        if m: result['bid_time'] = m.group(1).strip()

        # ── 公告发布时间 ──
        m = re.search(r'(?:公告.*?时间|发布日期|发布时间|发.*?布.*?时间)[：:\s]*[<br>\s]*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[^\n<]{0,20})', html, re.IGNORECASE)
        if m: result['notice_time'] = m.group(1).strip()

        # ── 行政区域/省份 ──
        m = re.search(r'(?:行政区域|所属地区|所在地区|区域|地区|省份)[：:\s]*[<br>\s]*([^\n<]{2,20})', html, re.IGNORECASE)
        if m: result['region'] = m.group(1).strip()[:20]

        # ── 行业推断 ──
        if '学校' in text or '学院' in text or '大学' in text or '中学' in text or '小学' in text:
            result['industry'] = '学校'
        elif '医院' in text or '卫生院' in text or '疾控' in text:
            result['industry'] = '医院'
        elif '公安' in text or '法院' in text or '政府' in text or '局' in text:
            result['industry'] = '政府'
        elif '企业' in text or '公司' in text:
            result['industry'] = '企业'

        # ── 采购需求 ──
        m = re.search(r'(?:采购需求|项目需求|招标内容|采购内容|标的内容)[：:\s]*[<br>\s]*([^\n<]{10,500})', html, re.IGNORECASE)
        if m: result['purchase_requirements'] = m.group(1).strip()[:300]

        # ── 投标方式 ──
        m = re.search(r'(?:投标方式|提交方式|响应文件.*?方式)[：:\s]*[<br>\s]*([^\n<]{2,10})', html, re.IGNORECASE)
        if m: result['submit_type'] = m.group(1).strip()

        return result if result else None
    except Exception as e:
        print(f"[scrapling] extract_detail error: {e}", file=sys.stderr)
        return None


def crawl_source(url, keywords):
    """Crawl a listing page, find keyword-matching links, extract details"""
    results = []
    df = DynamicFetcher()

    try:
        print(f"[scrapling] crawling: {url}", file=sys.stderr)
        page = df.fetch(url, timeout=30000, wait=3000)

        # Collect all links from multiple selectors
        links = []
        selectors = [
            'a', 'li a', 'td a', 'tr a', '.list a', '.result a',
            '.article a', '.entry a', 'a[title]', '.vT-srch-result-list a',
            '.news-list a', '.info-list a'
        ]
        for selector in selectors:
            try:
                for el in page.css(selector):
                    href = el.attrib.get('href', '')
                    title = (el.attrib.get('title') or el.text or '').strip()
                    if not title or not href: continue
                    if len(title) < 5 or len(title) > 300: continue
                    if re.match(r'^(首页|上一页|下一页|末页|返回|更多|详情|查看|附件|下载|登录|注册|注销)$', title):
                        continue
                    links.append({'title': title, 'href': href})
            except Exception:
                pass

        # Deduplicate by href
        seen = set()
        unique = []
        for link in links:
            key = link['href']
            if key not in seen:
                seen.add(key)
                unique.append(link)
        links = unique

        # Resolve relative URLs
        for link in links:
            link['href'] = urljoin(url, link['href'])

        print(f"[scrapling] found {len(links)} links on listing page", file=sys.stderr)

        # Debug: show first few link titles
        for link in links[:5]:
            print(f"[scrapling]   link: [{link['title'][:60]}]", file=sys.stderr)

        # Filter by keywords (case-insensitive)
        matched = []
        for link in links:
            for kw in keywords:
                if kw.lower() in link['title'].lower():
                    matched.append(link)
                    break

        print(f"[scrapling] {len(matched)} matched by keywords", file=sys.stderr)

        # Extract details from matched links (limit to first 20)
        for i, item in enumerate(matched[:20]):
            if i > 0: random_delay(5, 10)
            detail = extract_detail(df, item['href'])

            entry = {
                'title': item['title'],
                'url': item['href'],
            }
            if detail:
                entry.update(detail)
            results.append(entry)

        return results

    except Exception as e:
        print(f"[scrapling] crawl error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return []
    finally:
        try: df.close()
        except: pass


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({'error': 'Usage: python scrapling_crawler.py <url> <kw1,kw2,...>'}))
        sys.exit(1)

    url = sys.argv[1]
    keywords = [k.strip() for k in sys.argv[2].split(',') if k.strip()]

    results = crawl_source(url, keywords)
    print(json.dumps(results, ensure_ascii=False, indent=2))
