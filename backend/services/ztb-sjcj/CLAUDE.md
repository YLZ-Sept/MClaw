# ZTB-SJCJ — 招投标数据采集

基于 Playwright 的乙方宝（千里马招标网）招投标数据采集工具，支持中标信息和采购意向两类数据，按关键词在云南省内搜索，采集后输出 xlsx。

## 技术栈

- Python 3.x, Playwright, openpyxl

## 目录结构

```
ZTB-SJCJ/
├── CLAUDE.md              # 项目规范（本文件）
├── config.py               # 配置：网址、关键词、表头字段
├── login.py                # 首次登录：打开浏览器 → 用户扫码 → 保存 state.json
├── scrape.py               # 加载 state → 搜索关键词 → 翻页采集 → 逐页存 txt
├── export.py               # txt 汇总清洗 → 输出 xlsx
├── run.py                   # 一键跑：scrape → export
├── data/                    # 采集的原始 txt（按时间戳分目录）
├── output/                  # 输出的 xlsx
└── browser_state/           # Playwright 持久化 state.json（不入 git）
```

## 采集目标

- 网站：https://qiye.qianlima.com（乙方宝/千里马招标网）
- 地域：云南省内
- 关键词：IT/信息化类（42条）+ 网络安全类（17条）

## 开发命令

```bash
pip install playwright openpyxl
playwright install chromium

# 首次登录（手动扫码）
python login.py

# 一键采集+导出
python run.py

# 单独采集
python scrape.py --type zhongbiao    # 中标信息
python scrape.py --type caiyi        # 采购意向

# 单独导出
python export.py --type zhongbiao
python export.py --type caiyi
```

## 关键词定义（config.py）

### IT/信息化类（42条）
办公设备类：电脑、计算机、打印机、办公设备、复印机
信息化/软件类：信息化、信息系统、软件开发、系统集成、软件
安防/监控类：视频监控、安防、监控、门禁、一卡通
网络/通信类：网络设备、综合布线、通信设备、交换机、路由器
显示/会议类：大屏、LED、显示屏、会议系统、音响
数据中心类：数据中心、机房、机房建设、服务器、存储、云平台
智慧/数字类：智慧、数字化、智能化
教育类：教学设备、多媒体、录播
基础设施类：弱电、UPS
运维/服务类：运维、技术服务
数据库类：数据库

### 网络安全类（17条）
网络安全、信息安全、数据安全、等级保护、等保测评、防火墙、入侵检测、
漏洞扫描、安全服务、安全审计、安全运维、安全防护、应急响应、安全管理、
身份认证、堡垒机、态势感知

## 输出表头

### 中标信息统计（15列）
招标时间 | 报名时间 | 投标时间 | 区域 | 一级行业 | 招标人 | 招标公司 | 项目名称 |
项目产品（服务） | 项目金额（万元） | 网页链接 | 招投标方式 | 中标单位 | 成交金额（万元） | 备注

### 采购意向统计（9列）
区域 | 一级行业 | 招标人 | 项目名称 | 项目金额（万元） | 采购需求 | 预计采购时间 | 项目地点 | 发布时间

## 网址模式（API 逆向结果）

| 用途 | URL 模式 |
|------|---------|
| 搜索页 | `#/infoCenter/search` |
| 招标/中标列表 API | `GET /api/subZhaobiao/queryZBInfo?pageFrom=zhongbiao&keyword=...&areaIds=29&openid=...` |
| 采购意向列表 API | `GET /api/subZhaobiao/queryZBInfo?pageFrom=caigou&keyword=...&areaIds=29&openid=...` |
| 招标/中标详情页 | `#/infoCenter/infoDetail/{contentId}/{areaId}/zhongbiao` |
| 采购意向详情页 | `#/infoCenter/infoDetail/{relationId}/{areaId}/caigou?purchaseId={id}` |

API 必需参数：`openid`（通过 `/api/system/members` 获取）

## 采集流程

1. `login.py` → Playwright persistent context → 微信扫码 → 登录态持久化到 `browser_state/`
2. `scrape.py` → 加载 browser_state → 获取 openid → 按关键词遍历 API → 去重 → 详情页补字段 → 存 JSON
3. `export.py` → 读 JSON → 字段映射 → 输出 xlsx

## 工程约定

- data/ 下每次采集新建 `YYYYMMDD_HHMMSS/` 子目录，原始 JSON 不可覆盖
- browser_state/ 不入 git
- output/ 输出文件名带时间戳，不覆盖历史输出
- config.py 中的关键词改完即刻生效，下次 run 自动用新关键词
- openid 从 `/api/system/members` 动态获取，不硬编码
