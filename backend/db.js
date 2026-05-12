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
    company TEXT, source TEXT, remark TEXT,
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

  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, company TEXT,
    source TEXT, status TEXT DEFAULT 'new',
    assigned_to TEXT, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT,
    status TEXT DEFAULT 'draft', budget REAL,
    start_date TEXT, end_date TEXT, description TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
    title TEXT, total REAL, status TEXT DEFAULT 'draft',
    valid_until TEXT, remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS quotation_items (
    id TEXT PRIMARY KEY, quotation_id TEXT NOT NULL REFERENCES quotations(id),
    product_id TEXT REFERENCES products(id),
    description TEXT, quantity REAL DEFAULT 1,
    unit_price REAL DEFAULT 0, total REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
    title TEXT NOT NULL, total REAL, status TEXT DEFAULT 'draft',
    start_date TEXT, end_date TEXT, content TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY, customer_id TEXT,
    title TEXT NOT NULL, description TEXT,
    priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open',
    assigned_to TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS customer_feedback (
    id TEXT PRIMARY KEY, customer_id TEXT,
    rating INTEGER, category TEXT, content TEXT,
    status TEXT DEFAULT 'pending',
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

module.exports = db;
