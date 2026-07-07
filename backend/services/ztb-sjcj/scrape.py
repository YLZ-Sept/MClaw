"""招投标数据采集 — API + 详情页"""
import os
import sys
import json
import time
import argparse
from datetime import datetime
from playwright.sync_api import sync_playwright
from config import (
    STATE_DIR, DATA_DIR, SEARCH_URL, DETAIL_URL, API_BASE,
    ALL_KEYWORDS, TAB_CONFIG, PAGE_SIZE, MAX_PAGES, REQUEST_DELAY, PROVINCE,
)


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def extract_amount(text):
    """从文本中提取金额（万元）"""
    import re
    if not text:
        return ""
    # 匹配 XX 万元 / XX 元 / XX 万
    m = re.search(r"(\d+\.?\d*)\s*万", text)
    if m:
        return m.group(1)
    m = re.search(r"(\d+\.?\d*)\s*元", text)
    if m:
        val = float(m.group(1))
        return f"{val / 10000:.2f}"
    return ""


def scrape(headless=False, skip_detail=False):
    """主采集流程"""
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    batch_dir = os.path.join(DATA_DIR, batch_id)
    ensure_dir(batch_dir)
    ensure_dir(STATE_DIR)

    print(f"批次: {batch_id}")
    print(f"数据目录: {batch_dir}")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=STATE_DIR,
            headless=headless,
        )
        page = context.pages[0] if context.pages else context.new_page()

        # 验证登录状态并获取 openid
        page.goto(SEARCH_URL, wait_until="load", timeout=60000)
        page.wait_for_timeout(3000)

        if "/login" in page.url:
            print("未登录！请先运行: python login.py")
            context.close()
            sys.exit(1)

        # 获取 openid（API 必需参数）
        openid = page.evaluate("""async () => {
            const r = await fetch('/new_qd_yfbsite/api/system/members?openid=test');
            const d = await r.json();
            return d?.data?.openId || '';
        }""")
        print(f"openid: {openid}")

        print("登录状态有效，开始采集...")

        all_results = {"zhongbiao": [], "caiyi": []}
        seen_ids = {"zhongbiao": set(), "caiyi": set()}

        for tab_key, tab_cfg in TAB_CONFIG.items():
            print(f"\n{'=' * 50}")
            print(f"采集 {tab_cfg['label']}...")

            for kw_idx, keyword in enumerate(ALL_KEYWORDS):
                print(f"  [{kw_idx + 1}/{len(ALL_KEYWORDS)}] 关键词: {keyword}")

                for page_num in range(1, MAX_PAGES + 1):
                    api_url = (
                        f"{API_BASE}/subZhaobiao/queryZBInfo"
                        f"?pageSize={PAGE_SIZE}&pageNum={page_num}"
                        f"&pageFrom={tab_cfg['pageFrom']}"
                        f"&keyword={keyword}&queryType=&offSet=&viewMonitor=false"
                        f"&areaIds=29&openid={openid}"
                    )

                    try:
                        resp = page.evaluate(
                            """async (url) => {
                                const r = await fetch(url);
                                return await r.json();
                            }""",
                            api_url,
                        )
                    except Exception as e:
                        print(f"    API请求失败: {e}")
                        break

                    if resp.get("code") != 200:
                        print(f"    API错误: {resp.get('msg', '')}")
                        break

                    data = resp.get("data", {})
                    items = data.get("resultList") or data.get("purchaseList") or []

                    if not items:
                        break

                    new_count = 0
                    for item in items:
                        if tab_key == "zhongbiao":
                            uid = item.get("contentId")
                            if uid and uid not in seen_ids[tab_key]:
                                seen_ids[tab_key].add(uid)
                                all_results[tab_key].append(item)
                                new_count += 1
                        else:
                            uid = item.get("id") or item.get("relationId")
                            if uid and uid not in seen_ids[tab_key]:
                                seen_ids[tab_key].add(uid)
                                all_results[tab_key].append(item)
                                new_count += 1

                    print(f"    第{page_num}页: {len(items)}条, 新增{new_count}条, 累计{len(seen_ids[tab_key])}条")

                    if len(items) < PAGE_SIZE:
                        break  # 最后一页

                    time.sleep(REQUEST_DELAY)

                time.sleep(REQUEST_DELAY)

        # 保存初始列表数据
        list_file = os.path.join(batch_dir, "_raw_list.json")
        with open(list_file, "w", encoding="utf-8") as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)
        print(f"\n列表数据已保存: {list_file}")
        print(f"中标信息: {len(all_results['zhongbiao'])} 条")
        print(f"采购意向: {len(all_results['caiyi'])} 条")

        # 采集中标信息详情页（补充完整字段）
        if not skip_detail and all_results["zhongbiao"]:
            print(f"\n开始采集中标信息详情页（共{len(all_results['zhongbiao'])}条）...")
            enriched_zhongbiao = []
            for idx, item in enumerate(all_results["zhongbiao"]):
                content_id = item.get("contentId")
                area_id = item.get("areaId", "29")

                detail_url = (
                    f"{DETAIL_URL}/{content_id}/{area_id}/zhongbiao"
                    f"?fromPage=searchPage&isFirstZhaobiao=false"
                )

                try:
                    page.goto(detail_url, wait_until="load", timeout=30000)
                    page.wait_for_timeout(1500)

                    detail = extract_detail_fields(page)
                    enriched = {**item, **detail}

                    if (idx + 1) % 20 == 0:
                        t = enriched.get("title", "")
                        print(f"  [{idx + 1}/{len(all_results['zhongbiao'])}] "
                              f"{t[:40]}...")

                except Exception as e:
                    print(f"  [{idx + 1}] 详情页失败: {e}")
                    enriched = item

                enriched_zhongbiao.append(enriched)

                if (idx + 1) % 10 == 0:
                    time.sleep(2)
                else:
                    time.sleep(0.8)

            all_results["zhongbiao"] = enriched_zhongbiao
        elif skip_detail:
            print("\n跳过详情页采集（--no-detail）。")

        # 保存完整数据
        full_file = os.path.join(batch_dir, "_full_data.json")
        with open(full_file, "w", encoding="utf-8") as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)
        print(f"\n完整数据已保存: {full_file}")

        # 输出采集摘要
        with open(os.path.join(batch_dir, "_summary.txt"), "w", encoding="utf-8") as f:
            f.write(f"采集时间: {batch_id}\n")
            f.write(f"中标信息: {len(all_results['zhongbiao'])} 条\n")
            f.write(f"采购意向: {len(all_results['caiyi'])} 条\n")
            f.write(f"关键词数: {len(ALL_KEYWORDS)}\n")

        print("\n采集完成!")
        context.close()


def extract_detail_fields(page):
    """从详情页提取结构化字段"""
    text = page.inner_text("body")

    fields = {}

    # 提取招标单位
    try:
        el = page.query_selector('text=招标单位')
        if el:
            parent = el.evaluate("el => el.parentElement?.innerText || ''")
            fields["_zhaoBiaoUnit"] = parent.replace("招标单位", "").strip()[:200]
    except:
        fields["_zhaoBiaoUnit"] = ""

    # 提取代理单位
    try:
        el = page.query_selector('text=代理单位')
        if el:
            parent = el.evaluate("el => el.parentElement?.innerText || ''")
            fields["_agentUnit"] = parent.replace("代理单位", "").strip()[:200]
    except:
        fields["_agentUnit"] = ""

    # 提取中标单位
    try:
        el = page.query_selector('text=中标单位, text=中标供应商')
        if el:
            parent = el.evaluate("el => el.parentElement?.innerText || ''")
            fields["_zhongBiaoUnit"] = parent.replace("中标单位", "").replace("中标供应商", "").strip()[:200]
    except:
        fields["_zhongBiaoUnit"] = ""

    # 提取项目编号
    try:
        el = page.query_selector('text=项目编号')
        if el:
            parent = el.evaluate("el => el.parentElement?.innerText || ''")
            fields["_projectNo"] = parent.replace("项目编号", "").strip()[:100]
    except:
        fields["_projectNo"] = ""

    # 提取预估金额/预算金额
    try:
        for label in ["预估金额", "预算金额", "项目金额"]:
            el = page.query_selector(f'text={label}')
            if el:
                parent = el.evaluate("el => el.parentElement?.innerText || ''")
                val = parent.replace(label, "").strip()[:50]
                if val:
                    fields["_amount"] = val
                    break
    except:
        fields["_amount"] = ""

    # 提取成交金额
    try:
        for label in ["成交金额", "中标金额"]:
            el = page.query_selector(f'text={label}')
            if el:
                parent = el.evaluate("el => el.parentElement?.innerText || ''")
                val = parent.replace(label, "").strip()[:50]
                if val:
                    fields["_dealAmount"] = val
                    break
    except:
        fields["_dealAmount"] = ""

    # 提取报名截止时间
    try:
        el = page.query_selector('text=报名截止时间')
        if el:
            parent = el.evaluate("el => el.parentElement?.innerText || ''")
            fields["_regDeadline"] = parent.replace("报名截止时间", "").strip()[:50]
    except:
        fields["_regDeadline"] = ""

    # 提取投标截止时间
    try:
        el = page.query_selector('text=投标截止时间')
        if el:
            parent = el.evaluate("el => el.parentElement?.innerText || ''")
            fields["_bidDeadline"] = parent.replace("投标截止时间", "").strip()[:50]
    except:
        fields["_bidDeadline"] = ""

    # 提取采购方式
    try:
        el = page.query_selector('text=采购方式')
        if el:
            parent = el.evaluate("el => el.parentElement?.innerText || ''")
            fields["_procurementMethod"] = parent.replace("采购方式", "").strip()[:50]
    except:
        fields["_procurementMethod"] = ""

    # 提取公告内容全文
    try:
        el = page.query_selector('text=公告内容')
        if el:
            # 获取公告内容后面的文本
            full_text = text.split("公告内容", 1)
            if len(full_text) > 1:
                fields["_fullContent"] = full_text[1][:5000]
    except:
        fields["_fullContent"] = text[:3000]

    return fields


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="招投标数据采集")
    parser.add_argument("--type", choices=["zhongbiao", "caiyi", "all"],
                        default="all", help="采集类型")
    parser.add_argument("--headless", action="store_true", help="无头模式（后台运行）")
    parser.add_argument("--no-detail", action="store_true", help="跳过详情页采集（仅列表数据）")
    args = parser.parse_args()
    scrape(headless=args.headless, skip_detail=args.no_detail)
