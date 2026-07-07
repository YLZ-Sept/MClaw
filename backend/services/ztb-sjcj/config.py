"""招投标数据采集 — 配置文件"""
import os

# 项目根目录
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

# 浏览器持久化目录（登录态）
STATE_DIR = os.path.join(ROOT_DIR, "browser_state")

# 数据输出目录
DATA_DIR = os.path.join(ROOT_DIR, "data")
OUTPUT_DIR = os.path.join(ROOT_DIR, "output")

# 网站基础配置
BASE_URL = "https://qiye.qianlima.com/new_qd_yfbsite"
API_BASE = f"{BASE_URL}/api"
SEARCH_URL = f"{BASE_URL}/#/infoCenter/search"
DETAIL_URL = f"{BASE_URL}/#/infoCenter/infoDetail"

# 地区限制
PROVINCE = "云南"

# 搜索关键词
# 中标公告标题用项目级通用词汇，而非极端技术术语
IT_KEYWORDS = [
    # 办公设备 — 学校和政府最常见的 IT 采购，中标命中率最高
    "电脑", "计算机", "打印机", "办公设备", "复印机",
    # 信息化/软件
    "信息化", "信息系统", "软件开发", "系统集成", "软件",
    # 安防/监控 — 中标公告高频词
    "视频监控", "安防", "监控", "门禁", "一卡通",
    # 网络/通信
    "网络设备", "综合布线", "通信设备", "交换机", "路由器",
    # 显示/会议
    "大屏", "LED", "显示屏", "会议系统", "音响",
    # 数据中心/机房
    "数据中心", "机房", "机房建设", "服务器", "存储", "云平台",
    # 智慧/数字 — "智慧校园"、"数字化建设" 等中标高频词
    "智慧", "数字化", "智能化",
    # 教育 — 学校是 YN 最大 IT 采购方
    "教学设备", "多媒体", "录播",
    # 基础设施
    "弱电", "UPS",
    # 运维/服务
    "运维", "技术服务",
    # 数据库
    "数据库",
]

SECURITY_KEYWORDS = [
    "网络安全", "信息安全", "数据安全", "等级保护",
    "等保测评", "防火墙", "入侵检测", "漏洞扫描",
    "安全服务", "安全审计", "安全运维", "安全防护",
    "应急响应", "安全管理", "身份认证",
    # 保留少量具体设备词，偶尔出现在中标公告
    "堡垒机", "态势感知",
]

ALL_KEYWORDS = IT_KEYWORDS + SECURITY_KEYWORDS

# 按tab分类的采集配置
TAB_CONFIG = {
    "zhongbiao": {
        "label": "中标信息",
        "pageFrom": "zhongbiao",
        "output_file": "中标信息统计",
        "headers": [
            "招标时间", "报名时间", "投标时间", "区域", "一级行业",
            "招标人", "招标公司", "项目名称", "项目产品（服务）",
            "项目金额（万元）", "网页链接", "招投标方式", "中标单位",
            "成交金额（万元）", "备注",
        ],
    },
    "caiyi": {
        "label": "采购意向",
        "pageFrom": "caigou",
        "output_file": "采购意向统计",
        "headers": [
            "区域", "一级行业", "招标人", "项目名称",
            "项目金额（万元）", "采购需求", "预计采购时间",
            "项目地点", "发布时间",
        ],
    },
}

# 一级行业关键词映射（从标题/内容匹配行业分类）
INDUSTRY_KEYWORDS = {
    "IT/信息化": IT_KEYWORDS,
    "网络安全": SECURITY_KEYWORDS,
}

# API 参数
PAGE_SIZE = 30
MAX_PAGES = 5   # 每个关键词最多翻页数（近一周数据通常在5页以内）
REQUEST_DELAY = 1.5  # API 请求间隔（秒），避免被限流


def classify_industry(title, content):
    """根据标题和内容判断一级行业"""
    text = f"{title} {content}"
    for industry, keywords in INDUSTRY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                return industry
    return ""
