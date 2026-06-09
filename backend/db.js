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

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY, customer_id TEXT,
    title TEXT NOT NULL, description TEXT,
    priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open',
    assigned_to TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY, customer_id TEXT,
    rating INTEGER, category TEXT,
    content TEXT,
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
  CREATE TABLE IF NOT EXISTS bid_statistics (
    id TEXT PRIMARY KEY,
    bid_publish_time TEXT,                    -- 招标时间
    registration_time TEXT,                   -- 报名时间
    bid_time TEXT,                            -- 投标时间
    region TEXT DEFAULT '昆明',               -- 区域
    industry TEXT,                            -- 一级行业
    bidder TEXT,                              -- 招标人
    bid_company TEXT,                         -- 招标公司（代理机构）
    project_name TEXT NOT NULL,               -- 项目名称
    project_content TEXT,                     -- 项目产品（服务）
    budget_amount REAL,                       -- 项目金额（万元）
    url TEXT,                                 -- 网页链接
    bid_method TEXT DEFAULT '公开招标',        -- 招投标方式
    bid_win_time TEXT,                        -- 中标时间
    notice_time TEXT,                         -- 公告发布时间
    win_company TEXT,                         -- 中标单位
    win_amount REAL,                          -- 成交金额（万元）
    remark TEXT,                              -- 备注
    source TEXT DEFAULT 'manual',             -- 数据来源：manual/crawl4ai
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
// 招投标统计对齐 Excel 模板：新增 招标时间/报名时间 列
try { db.exec("ALTER TABLE bid_statistics ADD COLUMN bid_publish_time TEXT"); } catch {}
try { db.exec("ALTER TABLE bid_statistics ADD COLUMN registration_time TEXT"); } catch {}
// 乙方宝默认采集源
try { db.prepare("INSERT INTO bid_sources (id,name,url,source_type,interval_minutes,enabled) VALUES (?,?,?,?,?,?)").run(
  require('crypto').randomUUID(), '乙方宝', 'https://www.woyaobid.cn/search', 'crawl4ai', 360, 1
); } catch {}
try { db.exec("ALTER TABLE performance_reports ADD COLUMN category TEXT DEFAULT 'monthly'"); } catch {}
// 兼容旧 returns 表：补充 executor 需要的字段
try { db.exec("ALTER TABLE returns ADD COLUMN order_type TEXT DEFAULT 'sales'"); } catch {}
try { db.exec("ALTER TABLE returns ADD COLUMN order_id TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE returns ADD COLUMN product_name TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE returns ADD COLUMN model TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE returns ADD COLUMN type TEXT DEFAULT 'return'"); } catch {}
try { db.exec("ALTER TABLE returns ADD COLUMN exchange_product TEXT DEFAULT ''"); } catch {}

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

// ===== 安全 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    permissions TEXT DEFAULT '["chat","digital","trending","knowledge","skills","crm","inventory","hr","docs","channels","publish","model","security"]',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS security_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// 迁移：补 permissions 字段
try { db.exec('ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT \'["chat","digital","trending","knowledge","skills","crm","inventory","hr","docs","channels","publish","model","security"]\''); } catch {}

// 种子管理员账号
function seedUser(username, password, name, role, permissions) {
  const existing = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (existing) return;
  const { randomUUID } = require('crypto');
  const salt = randomUUID().replace(/-/g, '');
  const hash = require('crypto').scryptSync(password, salt, 64).toString('hex');
  db.prepare('INSERT INTO users (id, username, password_hash, name, role, permissions) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), username, salt + ':' + hash, name, role, JSON.stringify(permissions));
  console.log(`[seed] ${role} 账号已创建 (${username}/${password})`);
}

const ALL_PERMS = ["chat","digital","trending","knowledge","skills","crm","inventory","hr","docs","channels","publish","model","security"];
seedUser('superadmin', '1qaz@WSX', '超级管理员', 'superadmin', ALL_PERMS);
seedUser('admin', 'admin123', '管理员', 'admin', ALL_PERMS);

// 种子安全设置默认值
const ssc = db.prepare('SELECT COUNT(*) AS c FROM security_settings').get();
if (ssc.c === 0) {
  const defaults = [
    ['login_max_attempts', '5'],
    ['login_lockout_minutes', '15'],
    ['session_timeout_hours', '24'],
  ];
  const insert = db.prepare('INSERT INTO security_settings (key, value) VALUES (?,?)');
  for (const [k, v] of defaults) insert.run(k, v);
}

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

function seedPPTSkill() {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_skills (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, desc TEXT, agent_id TEXT,
    tools TEXT, prompt_snippet TEXT, status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  const exists = db.prepare("SELECT id FROM agent_skills WHERE id='ppt-generator-builtin'").get();
  if (exists) return;
  const tools = JSON.stringify([{
    type: 'function',
    function: {
      name: 'generate_pptx',
      description: '根据结构化的幻灯片内容生成 PowerPoint 文件。需要指定主题和幻灯片列表。',
      parameters: {
        type: 'object',
        properties: {
          theme: { type: 'string', enum: ['business', 'modern', 'tech', 'minimal'], description: '主题：business商务蓝金 | modern科技紫 | tech深色科技 | minimal极简红黑' },
          slides: {
            type: 'array',
            description: '幻灯片列表',
            items: {
              type: 'object',
              properties: {
                layout: { type: 'string', enum: ['cover', 'section', 'content', 'bullets', 'two_col', 'ending'], description: '布局类型' },
                title: { type: 'string', description: '标题（cover布局用）' },
                subtitle: { type: 'string', description: '副标题（cover布局用）' },
                speaker: { type: 'string', description: '演讲者（cover布局用）' },
                date: { type: 'string', description: '日期（cover布局用）' },
                icon: { type: 'string', description: 'emoji图标（cover布局用）' },
                heading: { type: 'string', description: '页面标题（section/content/bullets/two_col布局用）' },
                body: { type: 'string', description: '正文内容（content布局用）' },
                items: { type: 'array', items: { type:'string' }, description: '要点列表（bullets布局用）' },
                left: { type: 'object', properties: { heading: { type:'string' }, items: { type:'array', items:{ type:'string' } } }, description: '左列内容（two_col布局用）' },
                right: { type: 'object', properties: { heading: { type:'string' }, items: { type:'array', items:{ type:'string' } } }, description: '右列内容（two_col布局用）' },
                text: { type: 'string', description: '结束语（ending布局用）' },
                subtext: { type: 'string', description: '结束副文本（ending布局用）' }
              },
              required: ['layout']
            }
          }
        },
        required: ['theme', 'slides']
      }
    }
  }]);
  db.prepare("INSERT INTO agent_skills (id,name,desc,agent_id,tools,prompt_snippet) VALUES ('ppt-generator-builtin',?,?,'',?,?)").run(
    'PPT 生成', '自动生成专业 PowerPoint 演示文稿',
    tools,
    `你是一个专业的 PPT 演示文稿设计师。当用户要求制作 PPT 时，请调用 generate_pptx 工具。

## 设计原则
- 每页只传达一个核心观点，信息不堆砌
- 标题简洁有力（≤15字），正文精炼（≤200字）
- 用词避免套话，直接说人话
- 结构遵循：引入→问题→方案→证据→行动

## 布局选择指南
- cover：封面，必须包含 title、subtitle、speaker
- section：章节过渡页，只有 heading
- content：正文页，heading + body（适合文字较多的说明）
- bullets：要点页，heading + items 数组（每个 item 一句话）
- two_col：对比页，left + right 各含 heading 和 items
- ending：结束页，text（默认"谢谢"）+ 可选 subtext

## 主题选择
- business：商务汇报、工作复盘、客户提案
- modern：产品发布、创业路演、市场分析
- tech：技术分享、AI/大数据专题、开发者演示
- minimal：简洁风格，适合任何场景

## 示例调用
{
  "theme": "business",
  "slides": [
    { "layout": "cover", "title": "Q3 营收复盘", "subtitle": "增长引擎与风险预警", "speaker": "张三", "date": "2026-06-01", "icon": "📈" },
    { "layout": "section", "heading": "核心发现" },
    { "layout": "bullets", "heading": "三大增长引擎", "items": ["海外业务同比增长 47%", "订阅收入占比突破 60%", "客户留存率升至 92%"] },
    { "layout": "content", "heading": "风险预警", "body": "Q4 需关注：1. 国内市场增速放缓至 8%，竞品 C 轮融资后价格战加剧。2. 供应链成本上升 12%，需提前锁价。3. 核心研发人员流失率抬头，建议启动留任激励。" },
    { "layout": "two_col", "heading": "Q4 策略", "left": {"heading":"守住","items":["维持海外投放 ROI > 3","客户成功团队扩编 5 人","供应链季度锁价"]}, "right": {"heading":"突破","items":["上线 AI 客服降低 30% 人力成本","进入东南亚市场","启动 B 轮融资"]} },
    { "layout": "ending", "text": "谢谢", "subtext": "问题与讨论" }
  ]
}

注意：每次调用至少包含 cover 和 ending，中间 3-8 页内容页。不要虚构数据，基于用户提供的真实信息生成。`
  );
  console.log('[seed] PPT 生成技能已创建');
}

function seedExcelSkill() {
  const exists = db.prepare("SELECT id FROM agent_skills WHERE id='excel-generator-builtin'").get();
  if (exists) return;
  const tools = JSON.stringify([{ type: 'function', function: { name: 'generate_excel', description: '生成专业 Excel 报表，支持多 Sheet、标题、表头样式、斑马纹、图表嵌入。', parameters: { type: 'object', properties: { title: { type: 'string', description: '报表标题' }, author: { type: 'string', description: '作者' }, sheets: { type: 'array', description: '工作表列表', items: { type: 'object', properties: { name: { type: 'string', description: 'Sheet名称' }, title: { type: 'string', description: '表格标题' }, subtitle: { type: 'string', description: '副标题' }, columns: { type: 'array', items: { type: 'object', properties: { header: { type: 'string' }, key: { type: 'string' }, width: { type: 'number' } } } }, rows: { type: 'array', items: { type: 'object' }, description: '数据行，key对应columns的key' }, merges: { type: 'array', items: { type: 'object', properties: { startRow: { type: 'number' }, startCol: { type: 'number' }, endRow: { type: 'number' }, endCol: { type: 'number' } } } }, chart: { type: 'object', properties: { type: { type: 'string' }, title: { type: 'string' }, catCol: { type: 'number' }, valCol: { type: 'number' } } } }, required: ['name'] } } }, required: ['sheets'] } } }]);
  db.prepare("INSERT INTO agent_skills (id,name,desc,agent_id,tools,prompt_snippet) VALUES ('excel-generator-builtin','Excel 报表','生成带样式和图表的 Excel 报表','',?,?)").run(tools, `你是专业 Excel 报表设计师，调用 generate_excel 工具生成报表。

## 设计原则
- 表头用深色背景白色字体，数据行斑马纹
- 标题行合并单元格居中
- 数值列右对齐，文本列左对齐
- 有数据对比需求时加入图表

## 示例
{"sheets":[{"name":"销售报表","title":"Q3 销售汇总","subtitle":"2026年7-9月","columns":[{"header":"月份","key":"month","width":12},{"header":"营收(万元)","key":"revenue","width":15},{"header":"利润(万元)","key":"profit","width":15},{"header":"环比增长","key":"growth","width":12}],"rows":[{"month":"7月","revenue":380,"profit":85,"growth":"+8%"},{"month":"8月","revenue":420,"profit":105,"growth":"+10.5%"},{"month":"9月","revenue":510,"profit":145,"growth":"+21.4%"}],"merges":[{"startRow":1,"startCol":1,"endRow":1,"endCol":4}],"chart":{"type":"bar","title":"月度营收趋势","catCol":1,"valCol":2}}]}

不虚构数据，基于用户提供的真实信息。`);
  console.log('[seed] Excel 技能已创建');
}

function seedPdfSkill() {
  const exists = db.prepare("SELECT id FROM agent_skills WHERE id='pdf-generator-builtin'").get();
  if (exists) return;
  const tools = JSON.stringify([{ type: 'function', function: { name: 'generate_pdf', description: '生成 PDF 文档，支持表格、列表、水印、页眉页脚。常用于合同、报价单、报告。', parameters: { type: 'object', properties: { title: { type: 'string', description: '文档标题' }, author: { type: 'string' }, page_size: { type: 'string', enum: ['A4', 'A3', 'LETTER'] }, orientation: { type: 'string', enum: ['portrait', 'landscape'] }, watermark: { type: 'string', description: '水印文字' }, content: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, style: { type: 'string' }, fontSize: { type: 'number' }, bold: { type: 'boolean' }, alignment: { type: 'string' }, ul: { type: 'array', items: { type: 'string' } }, table: { type: 'object', properties: { headers: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } } } } } }, required: ['content'] } } }]);
  db.prepare("INSERT INTO agent_skills (id,name,desc,agent_id,tools,prompt_snippet) VALUES ('pdf-generator-builtin','PDF 文档','生成含表格、页眉页脚、水印的 PDF 文档','',?,?)").run(tools, `你是专业 PDF 文档生成师，调用 generate_pdf 工具生成文档。

## 布局建议
- 标题用 header 样式（大号加粗深色）
- 正文用 body 样式
- 数据对比优先用 table
- 要点用 ul 列表
- 正式合同建议加水印

## 示例
{"title":"项目报价单","author":"MClaw","content":[{"text":"项目报价单","style":"header"},{"text":"客户：XX公司  日期：2026-06-02","style":"body"},{"table":{"headers":["项目","单价","数量","小计"],"rows":[["网站开发","50,000","1","50,000"],["服务器","8,000","4","32,000"],["运维","3,000","12","36,000"]]}},{"text":"合计：118,000 元","style":"body","bold":true},{"text":"以上报价30天内有效。","style":"small"}]}

不虚构数据，基于用户提供的真实信息。`);
  console.log('[seed] PDF 技能已创建');
}

function seedDocxSkill() {
  const exists = db.prepare("SELECT id FROM agent_skills WHERE id='docx-generator-builtin'").get();
  if (exists) return;
  const tools = JSON.stringify([{ type: 'function', function: { name: 'generate_docx', description: '生成 Word (.docx) 文档，支持多级标题、段落、要点列表、表格。常用于招聘JD、会议纪要、制度文件。', parameters: { type: 'object', properties: { title: { type: 'string', description: '文档标题' }, author: { type: 'string' }, footer: { type: 'string', description: '页脚文字' }, sections: { type: 'array', items: { type: 'object', properties: { heading: { type: 'string' }, level: { type: 'number', description: '标题级别1-3' }, paragraphs: { type: 'array', items: { type: 'string' } }, bullets: { type: 'array', items: { type: 'string' } }, table: { type: 'object', properties: { headers: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } } } } } }, required: ['sections'] } } }]);
  db.prepare("INSERT INTO agent_skills (id,name,desc,agent_id,tools,prompt_snippet) VALUES ('docx-generator-builtin','Word 文档','生成带标题、表格、要点的 Word 文档','',?,?)").run(tools, `你是专业文档撰写师，调用 generate_docx 工具生成 Word 文档。

## 结构建议
- title 作为文档大标题（居中加粗）
- 每个 sections 元素是一个章节
- level 1=一级标题, 2=二级标题, 3=三级标题
- 多级标题形成清晰文档结构
- 数据内容用 table，观点用 bullets

## 示例（招聘JD）
{"title":"高级前端工程师 JD","sections":[{"heading":"岗位职责","level":1,"bullets":["负责核心产品前端架构设计与开发","优化页面性能与用户体验","参与技术选型与 Code Review"]},{"heading":"任职要求","level":1,"bullets":["5年以上前端开发经验","精通 Vue3/TypeScript","有大型项目架构经验"]},{"heading":"薪酬福利","level":1,"table":{"headers":["项目","详情"],"rows":[["薪资","25-40K×16薪"],["福利","六险一金、餐补、健身房"]]}}],"footer":"期待您的加入！"}

不虚构信息。`);
  console.log('[seed] Word 技能已创建');
}

function seedDiagramSkill() {
  const exists = db.prepare("SELECT id FROM agent_skills WHERE id='diagram-generator-builtin'").get();
  if (exists) return;
  const tools = JSON.stringify([{ type: 'function', function: { name: 'generate_diagram', description: '使用 Mermaid 语法生成流程图、时序图、甘特图、类图、状态图等专业图表。', parameters: { type: 'object', properties: { code: { type: 'string', description: 'Mermaid 语法代码' }, theme: { type: 'string', enum: ['default', 'forest', 'dark', 'neutral'], description: '图表配色主题' }, format: { type: 'string', enum: ['png', 'svg'], description: '输出格式' } }, required: ['code'] } } }]);
  db.prepare("INSERT INTO agent_skills (id,name,desc,agent_id,tools,prompt_snippet) VALUES ('diagram-generator-builtin','Mermaid 图表','生成流程图、时序图、甘特图等专业图表','',?,?)").run(tools, `你是专业图表设计师，调用 generate_diagram 工具使用 Mermaid 语法生成图表。

## 支持的图表类型
- **flowchart** (graph TD/LR): 流程图/架构图
- **sequenceDiagram**: 时序图
- **gantt**: 甘特图/项目计划
- **classDiagram**: 类图
- **stateDiagram**: 状态图
- **pie**: 饼图
- **erDiagram**: ER 图

## 设计原则
- 节点名称用中文，清晰传达业务含义
- 流程图不超过 15 个节点，保持可读性
- 用不同形状区分角色/系统/操作
- 甘特图适合展示项目进度

## 示例

### 审批流程
\`\`\`mermaid
graph TD
  A[📝 提交申请] --> B{金额>1万?}
  B -->|是| C[👔 部门经理审批]
  B -->|否| D[✅ 自动通过]
  C --> E[💰 财务复核]
  E --> F[✅ 审批完成]
\`\`\`

### 项目甘特图
\`\`\`mermaid
gantt
  title Q3 项目计划
  dateFormat YYYY-MM-DD
  section 需求
  需求调研 :done, a1, 2026-07-01, 7d
  需求评审 :active, a2, after a1, 3d
  section 开发
  Sprint1 : b1, after a2, 14d
  Sprint2 : b2, after b1, 14d
  section 测试
  UAT : c1, after b2, 7d
\`\`\`

直接输出 Mermaid 代码给 generate_diagram 工具，不要用 markdown 代码块包裹。`);
  console.log('[seed] 图表技能已创建');
}

try { seedPerformanceReports(); } catch(e) { console.log('[seed] 绩效考核种子失败:', e.message); }
try { seedAttendanceReports(); } catch(e) { console.log('[seed] 考勤月报种子失败:', e.message); }
try { seedPPTSkill(); } catch(e) { console.log('[seed] PPT 技能种子失败:', e.message); }
try { seedExcelSkill(); } catch(e) { console.log('[seed] Excel 技能种子失败:', e.message); }
try { seedPdfSkill(); } catch(e) { console.log('[seed] PDF 技能种子失败:', e.message); }
try { seedDocxSkill(); } catch(e) { console.log('[seed] Word 技能种子失败:', e.message); }
try { seedDiagramSkill(); } catch(e) { console.log('[seed] 图表技能种子失败:', e.message); }

module.exports = db;
