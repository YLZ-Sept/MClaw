const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'internal.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 库存表迁移：旧版 product_id PK → 新版 (product_id,warehouse_id) 复合主键
db.exec(`DROP TABLE IF EXISTS inventory`);

db.exec(`
  -- ========== CRM ==========
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT,
    company TEXT, position TEXT, gender TEXT,
    age INTEGER, traits TEXT, preferences TEXT,
    contact_frequency TEXT, address TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS follow_ups (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
    content TEXT NOT NULL, next_contact_date TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
    name TEXT NOT NULL, position TEXT, phone TEXT, email TEXT,
    is_primary INTEGER DEFAULT 0, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL,
    contract_no TEXT, sales_owner TEXT,
    contact_name TEXT, contact_phone TEXT,
    content TEXT, amount REAL DEFAULT 0,
    signed_date TEXT, warranty_period TEXT,
    prepaid_amount REAL DEFAULT 0, receivable_amount REAL DEFAULT 0,
    invoice TEXT, delivery_progress TEXT, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ========== 进销存 ==========
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE,
    unit TEXT, sale_price REAL, cost_price REAL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS inventory (
    product_id TEXT NOT NULL REFERENCES products(id),
    warehouse_id TEXT NOT NULL DEFAULT '默认仓库',
    quantity INTEGER DEFAULT 0,
    PRIMARY KEY (product_id, warehouse_id)
  );

  CREATE TABLE IF NOT EXISTS stock_transactions (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
    type TEXT NOT NULL CHECK(type IN ('in','out','transfer')),
    quantity INTEGER NOT NULL, warehouse_id TEXT,
    operator TEXT, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS warehouses (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT,
    manager TEXT, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS inventory_alerts (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
    warehouse_id TEXT, min_quantity INTEGER DEFAULT 0,
    max_quantity INTEGER, enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_person TEXT,
    phone TEXT, email TEXT, address TEXT, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    total REAL, status TEXT DEFAULT 'draft',
    ordered_date TEXT, received_date TEXT, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id TEXT PRIMARY KEY, purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
    product_id TEXT REFERENCES products(id),
    quantity REAL DEFAULT 1, unit_price REAL DEFAULT 0, total REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sales_orders (
    id TEXT PRIMARY KEY, customer_id TEXT,
    total REAL, status TEXT DEFAULT 'draft',
    order_date TEXT, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sales_order_items (
    id TEXT PRIMARY KEY, sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
    product_id TEXT REFERENCES products(id),
    quantity REAL DEFAULT 1, unit_price REAL DEFAULT 0, total REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS returns (
    id TEXT PRIMARY KEY, sales_order_id TEXT,
    product_id TEXT, quantity REAL DEFAULT 1,
    reason TEXT, status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ========== 人事 ==========
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, department TEXT,
    role TEXT, phone TEXT, email TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id),
    start_date TEXT NOT NULL, end_date TEXT NOT NULL,
    reason TEXT, status TEXT DEFAULT 'pending',
    approver_id TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    parent_id TEXT REFERENCES departments(id),
    manager_id TEXT, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS recruitment (
    id TEXT PRIMARY KEY, department TEXT, position TEXT NOT NULL,
    headcount INTEGER DEFAULT 1, status TEXT DEFAULT 'open',
    requirements TEXT, salary_range TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id TEXT PRIMARY KEY, recruitment_id TEXT REFERENCES recruitment(id),
    name TEXT NOT NULL, phone TEXT, email TEXT,
    status TEXT DEFAULT 'pending', resume_path TEXT, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS personnel_changes (
    id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id),
    type TEXT NOT NULL, old_department TEXT, new_department TEXT,
    old_role TEXT, new_role TEXT, effective_date TEXT,
    reason TEXT, status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS attendance_rules (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    check_in_time TEXT, check_out_time TEXT,
    late_threshold INTEGER DEFAULT 0, work_days TEXT DEFAULT '1,2,3,4,5',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS clock_records (
    id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id),
    clock_type TEXT NOT NULL CHECK(clock_type IN ('in','out')),
    clock_time TEXT NOT NULL, source TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ========== 文档 ==========
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, file_path TEXT,
    file_type TEXT, file_size INTEGER,
    category TEXT, tags TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS org_charts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, file_path TEXT,
    file_type TEXT, file_size INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS document_folders (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    parent_id TEXT, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ========== CRM 核心 ==========
  CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY, title TEXT NOT NULL,
    sales_owner TEXT, contact_name TEXT, contact_phone TEXT,
    description TEXT, amount REAL DEFAULT 0,
    stage TEXT DEFAULT 'contact', competition TEXT,
    progress TEXT, next_plan TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ========== 进销存扩展: 设备台账 ==========
  CREATE TABLE IF NOT EXISTS asset_ledger (
    id TEXT PRIMARY KEY, customer_id TEXT,
    product_name TEXT NOT NULL, serial_no TEXT,
    deploy_date TEXT, warranty_expire TEXT, license_expire TEXT,
    status TEXT DEFAULT 'active',   -- active/maintenance/expired
    remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ========== 绩效 ==========
  CREATE TABLE IF NOT EXISTS performance_schemes (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    period TEXT DEFAULT 'quarterly',  -- monthly/quarterly/yearly
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS performance_items (
    id TEXT PRIMARY KEY, scheme_id TEXT NOT NULL REFERENCES performance_schemes(id),
    employee_id TEXT NOT NULL REFERENCES employees(id),
    indicator TEXT NOT NULL,       -- KPI 指标名
    weight REAL DEFAULT 0,         -- 权重
    target TEXT,                   -- 目标值
    self_score REAL, leader_score REAL,
    comment TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 绩效考核 V2：维度模板 + 考核记录 + 单项评分
  CREATE TABLE IF NOT EXISTS performance_dimensions (
    id TEXT PRIMARY KEY, scheme_id TEXT NOT NULL REFERENCES performance_schemes(id) ON DELETE CASCADE,
    name TEXT NOT NULL, weight REAL DEFAULT 0, sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS performance_records (
    id TEXT PRIMARY KEY, scheme_id TEXT NOT NULL REFERENCES performance_schemes(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    month TEXT NOT NULL,        -- YYYY-MM
    total_score REAL, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(scheme_id, employee_id, month)
  );

  CREATE TABLE IF NOT EXISTS performance_scores (
    id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES performance_records(id) ON DELETE CASCADE,
    dimension_id TEXT NOT NULL REFERENCES performance_dimensions(id) ON DELETE CASCADE,
    self_score REAL, leader_score REAL
  );

  -- 绩效考核 V3：扁平化月度报告，维度存 JSON
  CREATE TABLE IF NOT EXISTS performance_reports (
    id TEXT PRIMARY KEY, employee_name TEXT NOT NULL,
    department TEXT, position TEXT,
    month TEXT NOT NULL,           -- YYYY-MM
    dims TEXT,                     -- JSON array: [{"name":"工作效率","weight":20,"score":85},...]
    total_score REAL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 考勤月报 V2：对齐 Excel 考勤机导出格式
  CREATE TABLE IF NOT EXISTS attendance_reports (
    id TEXT PRIMARY KEY, employee_name TEXT NOT NULL,
    department TEXT, position TEXT,
    month TEXT NOT NULL,           -- YYYY-MM
    should_work_days REAL DEFAULT 0,
    actual_work_days REAL DEFAULT 0,
    rest_days REAL DEFAULT 0,
    normal_days REAL DEFAULT 0,
    abnormal_days REAL DEFAULT 0,
    standard_hours REAL DEFAULT 0,
    actual_hours REAL DEFAULT 0,
    late_count INTEGER DEFAULT 0,
    late_minutes INTEGER DEFAULT 0,
    absent_count INTEGER DEFAULT 0,
    absent_minutes INTEGER DEFAULT 0,
    missing_clock_count INTEGER DEFAULT 0,
    location_abnormal INTEGER DEFAULT 0,
    out_hours REAL DEFAULT 0,
    travel_days REAL DEFAULT 0,
    personal_leave REAL DEFAULT 0,
    sick_leave REAL DEFAULT 0,
    comp_leave REAL DEFAULT 0,
    annual_leave REAL DEFAULT 0,
    marriage_leave REAL DEFAULT 0,
    maternity_leave REAL DEFAULT 0,
    paternity_leave REAL DEFAULT 0,
    other_leave REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS bid_sources (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    url TEXT NOT NULL, source_type TEXT DEFAULT 'api',
    interval_minutes INTEGER DEFAULT 360, enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS bid_keywords (
    id TEXT PRIMARY KEY, keyword TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS auto_reply_rules (
    id TEXT PRIMARY KEY, keyword TEXT NOT NULL,
    reply TEXT NOT NULL, priority INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1, match_mode TEXT DEFAULT 'contains',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS auto_reply_logs (
    id TEXT PRIMARY KEY, incoming_msg TEXT,
    matched_rule_id TEXT, reply TEXT,
    confidence INTEGER, source TEXT DEFAULT 'chat',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS faq (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    tags TEXT, category TEXT DEFAULT '通用',
    similar_questions TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS bid_items (
    id TEXT PRIMARY KEY, source_id TEXT REFERENCES bid_sources(id),
    title TEXT NOT NULL,                    -- 项目名称
    project_no TEXT,                        -- 项目编号
    bid_type TEXT DEFAULT '公开招标',        -- 招标方式
    fetch_time TEXT,                        -- 获取时间
    doc_deadline TEXT,                      -- 报名截止时间
    bid_time TEXT,                          -- 投标时间
    submit_type TEXT DEFAULT '线上',         -- 投标方式
    amount REAL,                            -- 项目预算（万元）
    purchase_requirements TEXT,             -- 采购需求
    evaluation TEXT,                        -- 评标办法
    collect_time TEXT,                      -- 自定义采集时间
    url TEXT UNIQUE,                        -- 网址
    is_notified INTEGER DEFAULT 0,
    status TEXT DEFAULT 'new',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS content_publish (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,                   -- 平台：微信/抖音/小红书
    content_type TEXT,                        -- 类型：图文/视频
    content TEXT,                             -- 内容
    scheduled_at TEXT,                        -- 计划发布时间
    status TEXT DEFAULT 'draft',              -- 状态
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// 兼容旧 faq 表：补充新增字段
try { db.exec("ALTER TABLE faq ADD COLUMN similar_questions TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE faq ADD COLUMN notes TEXT DEFAULT ''"); } catch {}
// 兼容旧 bid_sources 表：补充 source_type 字段
try { db.exec("ALTER TABLE bid_sources ADD COLUMN source_type TEXT DEFAULT 'api'"); } catch {}
// 兼容旧 bid_items 表：补充 project_no / purchase_requirements 字段
try { db.exec("ALTER TABLE bid_items ADD COLUMN project_no TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE bid_items ADD COLUMN purchase_requirements TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE performance_reports ADD COLUMN category TEXT DEFAULT 'monthly'"); } catch {}

// ===== 消息中心 / 多渠道会话 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS channel_accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,                  -- wechat / wecom / feishu / douyin
    account_name TEXT NOT NULL,              -- 账号名称（如"张三的微信"）
    agent_id TEXT,                           -- 绑定的数字员工 ID
    default_reply_mode TEXT DEFAULT 'manual',-- auto / manual / assisted
    config TEXT DEFAULT '{}',                -- JSON: API Key / Webhook URL 等
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS channel_conversations (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES channel_accounts(id),
    platform TEXT NOT NULL,
    contact_name TEXT NOT NULL,              -- 联系人昵称
    contact_avatar TEXT,                     -- 头像 URL
    last_message TEXT,                       -- 最后一条消息摘要
    last_message_at TEXT,                    -- 最后消息时间
    unread_count INTEGER DEFAULT 0,
    reply_mode TEXT DEFAULT 'auto',          -- auto / manual / assisted
    agent_id TEXT,                           -- 当前会话使用的数字员工
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS channel_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES channel_conversations(id),
    direction TEXT NOT NULL,                 -- incoming / outgoing
    content TEXT NOT NULL,
    reply_mode TEXT DEFAULT 'manual',        -- 发送时的模式
    ai_suggestion TEXT,                      -- AI 建议回复（协同模式用）
    status TEXT DEFAULT 'sent',              -- sent / delivered / read / failed
    raw_data TEXT,                           -- 原始 JSON（平台特有字段）
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_cmsg_conv ON channel_messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_cconv_acc ON channel_conversations(account_id, updated_at);
`);

// ===== 一键追爆款 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS hot_products (
    id TEXT PRIMARY KEY,
    brand_name TEXT NOT NULL,
    description TEXT NOT NULL,
    selling_points TEXT DEFAULT '[]',
    contact_info TEXT DEFAULT '',
    target_audience TEXT DEFAULT '',
    industry_tags TEXT DEFAULT '',
    background_image TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS hot_contents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    tags TEXT DEFAULT '',
    platforms TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    publish_url TEXT,
    video_url TEXT,
    video_url_landscape TEXT,
    video_status TEXT,
    bgm_path TEXT,
    bg_image_path TEXT,
    error_message TEXT,
    generated_at TEXT DEFAULT (datetime('now','localtime')),
    published_at TEXT
  );

  CREATE TABLE IF NOT EXISTS hot_conversations (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'private_msg',
    platform_msg_id TEXT,
    from_user_name TEXT NOT NULL,
    incoming_text TEXT NOT NULL,
    intent TEXT DEFAULT 'invalid',
    reply_text TEXT,
    is_lead INTEGER DEFAULT 0,
    replied_at TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS hot_leads (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES hot_conversations(id),
    user_name TEXT NOT NULL,
    contact_extracted TEXT,
    summary TEXT,
    status TEXT DEFAULT 'new',
    pushed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// 插入默认仓库
const wc = db.prepare('SELECT COUNT(*) AS c FROM warehouses').get();
if (wc.c === 0) {
  db.prepare("INSERT INTO warehouses (id,name,address) VALUES ('wh-default','默认仓库','')").run();
}

// 插入默认考勤规则
const ac = db.prepare('SELECT COUNT(*) AS c FROM attendance_rules').get();
if (ac.c === 0) {
  db.prepare("INSERT INTO attendance_rules (id,name,check_in_time,check_out_time) VALUES ('rule-default','标准班次','09:00','18:00')").run();
}

// 种子：绩效考核数据 — 通过导入功能填充，不自动种子
function seedPerformanceReports() {
  // 模板文件中无实际数据行，等待用户导入填好的考评文档
  const hasPerf = db.prepare('SELECT COUNT(*) AS c FROM performance_reports').get().c;
  if (hasPerf === 0) console.log('[seed] 绩效考核表已就绪，等待导入数据');
}

// 种子：考勤月报数据
function seedAttendanceReports() {
  const XLSX = require('xlsx');
  const { randomUUID } = require('crypto');
  const attDir = 'G:/桌面/人力资源管理模块/考勤月报/考勤月报xlsx(1).xlsx';
  const hasAtt = db.prepare('SELECT COUNT(*) AS c FROM attendance_reports').get().c;
  if (hasAtt > 0) return;

  const fs = require('fs');
  if (!fs.existsSync(attDir)) { console.log('[seed] 考勤月报文件不存在，跳过'); return; }

  const wb = XLSX.readFile(attDir);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'' });

  // Row 0: header1, Row 1: header2, Row 2+: data
  // 映射: [姓名,部门,职务,应出勤,实际出勤,休息,正常,异常,标准时长,实际时长,迟到次数,迟到时长,旷工次数,旷工时长,缺卡次数,地点异常,外出,出差,事假,病假,调休假,年假,婚假,产假,陪产假,其他]
  const parseNum = (v) => {
    if (v === '--' || v === '' || v === undefined) return 0;
    return parseFloat(v) || 0;
  };

  const month = '2026-05'; // 默认当月，Excel中没有明确的月份列

  for (let i = 2; i < data.length; i++) {
    const r = data[i];
    if (!r[0] || String(r[0]).trim() === '') continue;
    const id = randomUUID();
    db.prepare(`INSERT INTO attendance_reports (id,employee_name,department,position,month,
      should_work_days,actual_work_days,rest_days,normal_days,abnormal_days,standard_hours,actual_hours,
      late_count,late_minutes,absent_count,absent_minutes,missing_clock_count,location_abnormal,
      out_hours,travel_days,personal_leave,sick_leave,comp_leave,annual_leave,marriage_leave,maternity_leave,paternity_leave,other_leave)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, String(r[0]).trim(), String(r[1]||'').trim(), String(r[2]||'').trim(), month,
        parseNum(r[3]), parseNum(r[4]), parseNum(r[5]), parseNum(r[6]), parseNum(r[7]), parseNum(r[8]), parseNum(r[9]),
        parseNum(r[10]), parseNum(r[11]), parseNum(r[12]), parseNum(r[13]), parseNum(r[14]), parseNum(r[15]),
        parseNum(r[16]), parseNum(r[17]), parseNum(r[18]), parseNum(r[19]), parseNum(r[20]), parseNum(r[21]),
        parseNum(r[22]), parseNum(r[23]), parseNum(r[24]), parseNum(r[25]));
  }
  console.log('[seed] 考勤月报数据已导入 ' + (data.length - 2) + ' 条');
}

try { seedPerformanceReports(); } catch(e) { console.log('[seed] 绩效考核种子失败:', e.message); }
try { seedAttendanceReports(); } catch(e) { console.log('[seed] 考勤月报种子失败:', e.message); }

module.exports = db;
