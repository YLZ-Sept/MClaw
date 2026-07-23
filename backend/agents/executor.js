// 工具执行器 — 接收 tool name + arguments，直接操作 SQLite
const { randomUUID } = require('crypto');
const db = require('../db');
const { getExecutionContext } = require('../shared/execution-context');
const { needsApproval, requestApproval } = require('./tool-guard');
let _audit = null;
function audit() { if (!_audit) _audit = require('../services/audit'); return _audit; }

let _cachedNodeId = null;

// ── 工具名称规范化 ──
function normalizeToolName(name) {
  if (!name) return name;
  // Read_File → read_file, BrowserUseTool → browser_use
  // 只在小写字母后跟大写字母，或数字后跟大写字母的位置插入下划线
  let n = name.replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase();
  // 去除常见后缀
  n = n.replace(/_tool$/, '').replace(/_function$/, '');
  // 合并连续下划线
  n = n.replace(/_+/g, '_');
  return n;
}

// ── 只读工具集合 ──
const READ_ONLY_TOOLS = new Set([
  'list_customers', 'get_customer', 'search_customer',
  'list_contacts', 'list_opportunities', 'get_opportunity',
  'list_contracts', 'get_contract',
  'list_purchase_orders', 'get_purchase_order',
  'list_sales_orders', 'get_sales_order',
  'list_returns', 'get_return',
  'list_employees', 'get_employee', 'search_employee',
  'list_departments', 'list_recruitment', 'list_candidates',
  'list_documents', 'search_documents', 'list_document_folders',
  'list_tickets', 'get_ticket', 'list_feedback',
  'search_faq', 'match_faq',
  'list_hot_products', 'get_hot_product',
  'list_hot_contents', 'get_hot_content', 'list_hot_leads',
  'list_bid_items', 'search_bid_items', 'list_bid_sources', 'list_bid_keywords',
  'list_bid_statistics', 'list_finance_records', 'get_finance_summary',
  'get_dashboard_stats', 'get_dashboard_hot_stats',
  'list_asset_ledger', 'list_performance_reports', 'list_attendance_reports',
  'list_local_files', 'search_local_files', 'read_local_file',
  'search_documents', 'search_employee',
  'tool_recall'
]);

// ── 执行单个工具（含名称规范化） ──
async function exec(toolName, args, context) {
  // 规范化工具名称
  const normalizedName = normalizeToolName(toolName);
  if (normalizedName !== toolName) {
    console.log(`[executor] 工具名规范化: ${toolName} → ${normalizedName}`);
  }

  try {
    // 安全审批栅栏
    const risk = needsApproval(normalizedName);
    if (risk.needed) {
      // 检查是否已批准（通过 args 中的 _approval_id）
      if (args._approval_id) {
        const { approve, pendingApprovals } = require('./tool-guard');
        const result = approve(args._approval_id);
        if (!result.success) return { error: `审批 ${args._approval_id} 已过期，请重新发起操作` };
        // 审批通过，继续执行（去掉 _approval_id）
        delete args._approval_id;
        // 审计：审批通过后执行危险工具
        audit().recordAudit({
          eventType: 'tool_executed',
          toolName: normalizedName,
          argsSummary: JSON.stringify(args).slice(0, 500),
          approvalId: result.entry?.id || ''
        });
      } else {
        const approval = requestApproval(normalizedName, args);
        console.log(`[guard] ${normalizedName} 需要审批: ${approval.id}`);
        return {
          approval_required: true,
          approval_id: approval.id,
          tool: normalizedName,
          args_summary: JSON.stringify(args).slice(0, 300),
          level: risk.level,
          desc: risk.desc,
          message: `⚠️ 危险操作需要审批\n工具: ${normalizedName}\n级别: ${risk.level}\n说明: ${risk.desc}\n参数: ${JSON.stringify(args).slice(0, 200)}\n\n审批ID: ${approval.id}\n请用户确认后，使用 _approval_id 参数重新调用此工具。`
        };
      }
    }

    // 插件注册表优先：动态注册的工具
    const { get: getPluginTool } = require('./tool-registry');
    const pluginTool = getPluginTool(normalizedName);
    if (pluginTool) {
      const result = await pluginTool.handler(args, context);
      return result;
    }

    switch (normalizedName) {

      // ─── CRM ───
      case 'list_customers':
        return db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();

      case 'get_customer': {
        const cus = db.prepare('SELECT * FROM customers WHERE id=?').get(args.customer_id);
        if (!cus) return { error: '客户不存在' };
        const followUps = db.prepare('SELECT * FROM follow_ups WHERE customer_id=? ORDER BY created_at DESC').all(args.customer_id);
        return { ...cus, follow_ups: followUps };
      }

      case 'create_customer': {
        const id = randomUUID();
        db.prepare('INSERT INTO customers (id,name,phone,company,position,gender,age,traits,preferences,contact_frequency,address) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, args.name, args.phone || null, args.company || null, args.position || null, args.gender || null, args.age || null, args.traits || null, args.preferences || null, args.contact_frequency || null, args.address || null);
        return { id, name: args.name, message: '客户创建成功' };
      }

      case 'update_customer': {
        const cur = db.prepare('SELECT * FROM customers WHERE id=?').get(args.customer_id);
        if (!cur) return { error: '客户不存在' };
        db.prepare('UPDATE customers SET name=?,phone=?,company=?,position=?,gender=?,age=?,traits=?,preferences=?,contact_frequency=?,address=? WHERE id=?')
          .run(args.name ?? cur.name, args.phone ?? cur.phone, args.company ?? cur.company, args.position ?? cur.position, args.gender ?? cur.gender, args.age ?? cur.age, args.traits ?? cur.traits, args.preferences ?? cur.preferences, args.contact_frequency ?? cur.contact_frequency, args.address ?? cur.address, args.customer_id);
        return { id: args.customer_id, message: '客户更新成功' };
      }

      case 'delete_customer':
        db.prepare('DELETE FROM follow_ups WHERE customer_id=?').run(args.customer_id);
        db.prepare('DELETE FROM contacts WHERE customer_id=?').run(args.customer_id);
        db.prepare('DELETE FROM customers WHERE id=?').run(args.customer_id);
        return { message: '客户已删除' };

      case 'add_follow_up': {
        const id = randomUUID();
        db.prepare('INSERT INTO follow_ups (id,customer_id,content,next_contact_date) VALUES (?,?,?,?)')
          .run(id, args.customer_id, args.content, args.next_contact_date || null);
        return { id, message: '跟进记录添加成功' };
      }

      case 'search_customer':
        return db.prepare('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name').all(`%${args.keyword}%`, `%${args.keyword}%`);

      case 'list_contacts':
        if (args.customer_id)
          return db.prepare('SELECT * FROM contacts WHERE customer_id=? ORDER BY created_at DESC').all(args.customer_id);
        return db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();

      case 'list_opportunities':
        return db.prepare('SELECT * FROM opportunities ORDER BY created_at DESC').all();

      case 'create_opportunity': {
        const id = randomUUID();
        db.prepare('INSERT INTO opportunities (id,title,sales_owner,contact_name,contact_phone,description,amount,stage,competition,progress,next_plan) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, args.title, args.sales_owner || null, args.contact_name || null, args.contact_phone || null, args.description || null, args.amount || 0, args.stage || 'contact', args.competition || null, args.progress || null, args.next_plan || null);
        return { id, message: '销售机会创建成功' };
      }

      case 'get_opportunity': {
        const op = db.prepare('SELECT * FROM opportunities WHERE id=?').get(args.opportunity_id);
        if (!op) return { error: '销售机会不存在' };
        return op;
      }

      case 'update_opportunity': {
        const cur = db.prepare('SELECT * FROM opportunities WHERE id=?').get(args.opportunity_id);
        if (!cur) return { error: '销售机会不存在' };
        db.prepare('UPDATE opportunities SET title=?,sales_owner=?,contact_name=?,contact_phone=?,description=?,amount=?,stage=?,competition=?,progress=?,next_plan=? WHERE id=?')
          .run(args.title ?? cur.title, args.sales_owner ?? cur.sales_owner, args.contact_name ?? cur.contact_name, args.contact_phone ?? cur.contact_phone, args.description ?? cur.description, args.amount ?? cur.amount, args.stage ?? cur.stage, args.competition ?? cur.competition, args.progress ?? cur.progress, args.next_plan ?? cur.next_plan, args.opportunity_id);
        return { id: args.opportunity_id, message: '销售机会更新成功' };
      }

      case 'delete_opportunity': {
        const cur = db.prepare('SELECT * FROM opportunities WHERE id=?').get(args.opportunity_id);
        if (!cur) return { error: '销售机会不存在' };
        db.prepare('DELETE FROM opportunities WHERE id=?').run(args.opportunity_id);
        return { message: `销售机会「${cur.title}」已删除` };
      }

      case 'list_contracts':
        return db.prepare('SELECT * FROM contracts ORDER BY created_at DESC').all();

      case 'create_contract': {
        const id = randomUUID();
        db.prepare('INSERT INTO contracts (id,title,contract_no,sales_owner,contact_name,contact_phone,content,amount,signed_date,warranty_period,prepaid_amount,receivable_amount,invoice,delivery_progress,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, args.title, args.contract_no || null, args.sales_owner || null, args.contact_name || null, args.contact_phone || null, args.content || null, args.amount || 0, args.signed_date || null, args.warranty_period || null, args.prepaid_amount || 0, args.receivable_amount || 0, args.invoice || null, args.delivery_progress || null, args.remark || null);
        return { id, message: '合同创建成功' };
      }

      case 'get_contract': {
        const ct = db.prepare('SELECT * FROM contracts WHERE id=?').get(args.contract_id);
        if (!ct) return { error: '合同不存在' };
        return ct;
      }

      case 'update_contract': {
        const cur = db.prepare('SELECT * FROM contracts WHERE id=?').get(args.contract_id);
        if (!cur) return { error: '合同不存在' };
        db.prepare('UPDATE contracts SET title=?,contract_no=?,sales_owner=?,contact_name=?,contact_phone=?,content=?,amount=?,signed_date=?,warranty_period=?,prepaid_amount=?,receivable_amount=?,invoice=?,delivery_progress=?,remark=? WHERE id=?')
          .run(
            args.title ?? cur.title, args.contract_no ?? cur.contract_no, args.sales_owner ?? cur.sales_owner,
            args.contact_name ?? cur.contact_name, args.contact_phone ?? cur.contact_phone, args.content ?? cur.content,
            args.amount ?? cur.amount, args.signed_date ?? cur.signed_date, args.warranty_period ?? cur.warranty_period,
            args.prepaid_amount ?? cur.prepaid_amount, args.receivable_amount ?? cur.receivable_amount,
            args.invoice ?? cur.invoice, args.delivery_progress ?? cur.delivery_progress, args.remark ?? cur.remark,
            args.contract_id
          );
        return { id: args.contract_id, message: '合同更新成功' };
      }

      case 'delete_contract': {
        const cur = db.prepare('SELECT * FROM contracts WHERE id=?').get(args.contract_id);
        if (!cur) return { error: '合同不存在' };
        db.prepare('DELETE FROM contracts WHERE id=?').run(args.contract_id);
        return { message: `合同「${cur.title}」已删除` };
      }

      case 'list_asset_ledger':
        return db.prepare('SELECT * FROM asset_ledger ORDER BY created_at DESC').all();

      // ─── 进销存 ───
      case 'list_purchase_orders':
        return db.prepare('SELECT * FROM purchase_orders ORDER BY created_at DESC').all();

      case 'list_sales_orders':
        return db.prepare('SELECT * FROM sales_orders ORDER BY created_at DESC').all();

      case 'list_returns':
        return db.prepare('SELECT * FROM returns ORDER BY created_at DESC').all();

      case 'create_return': {
        const id = randomUUID();
        db.prepare('INSERT INTO returns (id,order_type,order_id,product_name,model,quantity,reason,type,exchange_product) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(id, args.order_type || 'sales', args.order_id || '', args.product_name, args.model || '', args.quantity || 1, args.reason || '', args.type || 'return', args.exchange_product || '');
        return { id, message: '退换货记录创建成功' };
      }

      case 'get_return': {
        const ret = db.prepare('SELECT * FROM returns WHERE id=?').get(args.return_id);
        if (!ret) return { error: '退换货记录不存在' };
        return ret;
      }

      case 'update_return': {
        const cur = db.prepare('SELECT * FROM returns WHERE id=?').get(args.return_id);
        if (!cur) return { error: '退换货记录不存在' };
        db.prepare('UPDATE returns SET order_type=?,order_id=?,product_name=?,model=?,quantity=?,reason=?,type=?,exchange_product=? WHERE id=?')
          .run(args.order_type ?? cur.order_type, args.order_id ?? cur.order_id, args.product_name ?? cur.product_name, args.model ?? cur.model, args.quantity ?? cur.quantity, args.reason ?? cur.reason, args.type ?? cur.type, args.exchange_product ?? cur.exchange_product, args.return_id);
        return { id: args.return_id, message: '退换货记录更新成功' };
      }

      // ─── 采购入库 ───
      case 'create_purchase_order': {
        const id = randomUUID();
        db.prepare('INSERT INTO purchase_orders (id,supplier_id,total,status,ordered_date,received_date,remark) VALUES (?,?,?,?,?,?,?)')
          .run(id, args.supplier_id || null, args.total || 0, args.status || 'draft', args.ordered_date || null, args.received_date || null, args.remark || null);
        return { id, message: '采购单创建成功' };
      }

      case 'get_purchase_order': {
        const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(args.purchase_order_id);
        if (!po) return { error: '采购单不存在' };
        return po;
      }

      case 'update_purchase_order': {
        const cur = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(args.purchase_order_id);
        if (!cur) return { error: '采购单不存在' };
        db.prepare('UPDATE purchase_orders SET supplier_id=?,total=?,status=?,ordered_date=?,received_date=?,remark=? WHERE id=?')
          .run(args.supplier_id ?? cur.supplier_id, args.total ?? cur.total, args.status ?? cur.status, args.ordered_date ?? cur.ordered_date, args.received_date ?? cur.received_date, args.remark ?? cur.remark, args.purchase_order_id);
        return { id: args.purchase_order_id, message: '采购单更新成功' };
      }

      // ─── 销售出库 ───
      case 'create_sales_order': {
        const id = randomUUID();
        db.prepare('INSERT INTO sales_orders (id,customer_id,total,status,order_date,remark) VALUES (?,?,?,?,?,?)')
          .run(id, args.customer_id || null, args.total || 0, args.status || 'draft', args.order_date || null, args.remark || null);
        return { id, message: '销售单创建成功' };
      }

      case 'get_sales_order': {
        const so = db.prepare('SELECT * FROM sales_orders WHERE id=?').get(args.sales_order_id);
        if (!so) return { error: '销售单不存在' };
        return so;
      }

      case 'update_sales_order': {
        const cur = db.prepare('SELECT * FROM sales_orders WHERE id=?').get(args.sales_order_id);
        if (!cur) return { error: '销售单不存在' };
        db.prepare('UPDATE sales_orders SET customer_id=?,total=?,status=?,order_date=?,remark=? WHERE id=?')
          .run(args.customer_id ?? cur.customer_id, args.total ?? cur.total, args.status ?? cur.status, args.order_date ?? cur.order_date, args.remark ?? cur.remark, args.sales_order_id);
        return { id: args.sales_order_id, message: '销售单更新成功' };
      }

      // ─── 人事 ───
      case 'list_employees':
        return db.prepare('SELECT * FROM employees ORDER BY created_at DESC').all();

      case 'create_employee': {
        const id = randomUUID();
        db.prepare('INSERT INTO employees (id,name,gender,department,role,phone,hire_date,contract_end,email) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(id, args.name, args.gender||null, args.department||null, args.role||null, args.phone||null, args.hire_date||null, args.contract_end||null, args.email||null);
        return { id, name: args.name, message: '员工创建成功' };
      }

      case 'get_employee': {
        const emp = db.prepare('SELECT * FROM employees WHERE id=?').get(args.employee_id);
        if (!emp) return { error: '员工不存在' };
        return emp;
      }

      case 'update_employee': {
        const cur = db.prepare('SELECT * FROM employees WHERE id=?').get(args.employee_id);
        if (!cur) return { error: '员工不存在' };
        db.prepare('UPDATE employees SET name=?,gender=?,department=?,role=?,phone=?,hire_date=?,contract_end=?,email=? WHERE id=?')
          .run(args.name ?? cur.name, args.gender ?? cur.gender, args.department ?? cur.department, args.role ?? cur.role, args.phone ?? cur.phone, args.hire_date ?? cur.hire_date, args.contract_end ?? cur.contract_end, args.email ?? cur.email, args.employee_id);
        return { id: args.employee_id, message: '员工更新成功' };
      }

      case 'delete_employee': {
        const cur = db.prepare('SELECT * FROM employees WHERE id=?').get(args.employee_id);
        if (!cur) return { error: '员工不存在' };
        db.prepare('DELETE FROM employees WHERE id=?').run(args.employee_id);
        return { message: `员工「${cur.name}」已删除` };
      }

      case 'list_departments':
        return db.prepare(`SELECT d.*, e.name AS manager_name FROM departments d LEFT JOIN employees e ON d.manager_id=e.id ORDER BY d.name`).all();

      case 'list_performance_reports': {
        const month = args.month || new Date().toISOString().slice(0, 7);
        const list = db.prepare('SELECT * FROM performance_reports WHERE month=? ORDER BY employee_name').all(month);
        return list.map(r => {
          try { r.dims = JSON.parse(r.dims); } catch { r.dims = []; }
          return r;
        });
      }

      case 'list_attendance_reports': {
        const month = args.month || new Date().toISOString().slice(0, 7);
        return db.prepare('SELECT * FROM attendance_reports WHERE month=? ORDER BY employee_name').all(month);
      }

      // ─── 招聘 ───
      case 'list_recruitment': {
        const status = args.status;
        if (status) return db.prepare('SELECT * FROM recruitment WHERE status=? ORDER BY created_at DESC').all(status);
        return db.prepare('SELECT * FROM recruitment ORDER BY created_at DESC').all();
      }

      case 'create_recruitment': {
        const id = randomUUID();
        db.prepare('INSERT INTO recruitment (id,department,position,headcount,salary_range,requirements,status) VALUES (?,?,?,?,?,?,?)')
          .run(id, args.department||null, args.position, args.headcount||1, args.salary_range||null, args.requirements||null, 'open');
        return { id, position: args.position, message: '招聘职位创建成功' };
      }

      case 'update_recruitment': {
        const cur = db.prepare('SELECT * FROM recruitment WHERE id=?').get(args.recruitment_id);
        if (!cur) return { error: '职位不存在' };
        db.prepare('UPDATE recruitment SET position=?,department=?,headcount=?,salary_range=?,requirements=?,status=? WHERE id=?')
          .run(args.position ?? cur.position, args.department ?? cur.department, args.headcount ?? cur.headcount, args.salary_range ?? cur.salary_range, args.requirements ?? cur.requirements, args.status ?? cur.status, args.recruitment_id);
        return { id: args.recruitment_id, message: '招聘职位更新成功' };
      }

      case 'delete_recruitment': {
        const cur = db.prepare('SELECT * FROM recruitment WHERE id=?').get(args.recruitment_id);
        if (!cur) return { error: '职位不存在' };
        db.prepare('DELETE FROM candidates WHERE recruitment_id=?').run(args.recruitment_id);
        db.prepare('DELETE FROM recruitment WHERE id=?').run(args.recruitment_id);
        return { message: `招聘职位「${cur.position}」及其候选人已删除` };
      }

      case 'list_candidates': {
        let sql = 'SELECT c.*, r.position AS position_name FROM candidates c LEFT JOIN recruitment r ON c.recruitment_id=r.id WHERE 1=1';
        const params = [];
        if (args.recruitment_id) { sql += ' AND c.recruitment_id=?'; params.push(args.recruitment_id); }
        if (args.status) { sql += ' AND c.status=?'; params.push(args.status); }
        sql += ' ORDER BY c.created_at DESC';
        return db.prepare(sql).all(...params);
      }

      case 'create_candidate': {
        const id = randomUUID();
        db.prepare('INSERT INTO candidates (id,recruitment_id,name,phone,email,status,remark) VALUES (?,?,?,?,?,?,?)')
          .run(id, args.recruitment_id, args.name, args.phone||null, args.email||null, 'pending', args.remark||null);
        return { id, name: args.name, message: '候选人添加成功' };
      }

      case 'update_candidate_status': {
        const cur = db.prepare('SELECT * FROM candidates WHERE id=?').get(args.candidate_id);
        if (!cur) return { error: '候选人不存在' };
        db.prepare('UPDATE candidates SET status=?, remark=? WHERE id=?')
          .run(args.status, args.remark ?? cur.remark, args.candidate_id);
        return { id: args.candidate_id, status: args.status, message: '候选人状态更新成功' };
      }

      // ─── 文档 ───
      case 'list_documents':
        return db.prepare('SELECT id, title, file_type, file_size, category, tags, created_at FROM documents ORDER BY created_at DESC').all();

      case 'search_documents':
        return db.prepare('SELECT id, title, file_type, file_size, created_at FROM documents WHERE title LIKE ? ORDER BY created_at DESC').all(`%${args.q}%`);

      case 'list_document_folders':
        return db.prepare('SELECT * FROM document_folders ORDER BY name').all();

      case 'search_employee':
        return db.prepare('SELECT * FROM employees WHERE name LIKE ? ORDER BY name').all(`%${args.name}%`);

      case 'search_faq': {
        // 简易中文分词 + 匹配
        const tokenize = (t) => {
          const c = t.replace(/[，,。.！!？?、；;：:（）()【】\[\]""''\s]/g, '');
          const toks = [];
          for (let len = 2; len <= 4; len++) for (let i = 0; i <= c.length - len; i++) toks.push(c.substring(i, i + len));
          return [...new Set(toks)];
        };
        const qTokens = tokenize(args.q);
        const faqs = db.prepare('SELECT * FROM faq').all();
        return faqs.map(f => {
          const fTokens = tokenize(f.question + f.tags);
          return { ...f, score: qTokens.filter(t => fTokens.some(ft => ft.includes(t) || t.includes(ft))).length };
        }).filter(f => f.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
      }

      // ─── 工单 ───
      case 'list_tickets':
        return db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all();

      case 'get_ticket': {
        const tk = db.prepare('SELECT * FROM tickets WHERE id=?').get(args.ticket_id);
        if (!tk) return { error: '工单不存在' };
        return tk;
      }

      case 'create_ticket': {
        const id = randomUUID();
        db.prepare('INSERT INTO tickets (id,customer_id,title,description,priority,status,assigned_to) VALUES (?,?,?,?,?,?,?)')
          .run(id, args.customer_id || null, args.title, args.description || null, args.priority || 'medium', args.status || 'open', args.assigned_to || null);
        return { id, title: args.title, message: '工单创建成功' };
      }

      case 'update_ticket': {
        const cur = db.prepare('SELECT * FROM tickets WHERE id=?').get(args.ticket_id);
        if (!cur) return { error: '工单不存在' };
        db.prepare('UPDATE tickets SET status=?,assigned_to=?,title=?,description=?,priority=? WHERE id=?')
          .run(args.status ?? cur.status, args.assigned_to ?? cur.assigned_to, args.title ?? cur.title, args.description ?? cur.description, args.priority ?? cur.priority, args.ticket_id);
        return { id: args.ticket_id, message: '工单更新成功' };
      }

      case 'delete_ticket': {
        const cur = db.prepare('SELECT * FROM tickets WHERE id=?').get(args.ticket_id);
        if (!cur) return { error: '工单不存在' };
        db.prepare('DELETE FROM tickets WHERE id=?').run(args.ticket_id);
        return { message: `工单「${cur.title}」已删除` };
      }

      // ─── 反馈 ───
      case 'list_feedback':
        return db.prepare('SELECT * FROM customer_feedback ORDER BY created_at DESC').all();

      case 'create_feedback': {
        const id = randomUUID();
        db.prepare('INSERT INTO customer_feedback (id,customer_id,rating,category,content) VALUES (?,?,?,?,?)')
          .run(id, args.customer_id || null, args.rating || null, args.category || null, args.content || null);
        return { id, message: '反馈记录成功' };
      }

      case 'delete_feedback': {
        const cur = db.prepare('SELECT * FROM customer_feedback WHERE id=?').get(args.feedback_id);
        if (!cur) return { error: '反馈不存在' };
        db.prepare('DELETE FROM customer_feedback WHERE id=?').run(args.feedback_id);
        return { message: '反馈已删除' };
      }

      // ─── 转人工 ───
      case 'handoff_to_human': {
        const id = randomUUID();
        db.prepare('INSERT INTO tickets (id,customer_id,title,description,priority,status) VALUES (?,?,?,?,?,?)')
          .run(id, args.customer_id || null, '【转人工】AI 客服无法解决的问题',
            '对话摘要：\n' + (args.summary || '用户请求转人工处理'),
            args.priority || 'high', 'open');
        return { id, message: '已转人工，工单 ' + id + ' 创建成功', priority: args.priority || 'high' };
      }

      // ─── 仪表盘统计 ───
      case 'get_dashboard_stats': {
        const counts = {
          customers: db.prepare('SELECT COUNT(*) AS c FROM customers').get().c,
          purchase_orders: db.prepare('SELECT COUNT(*) AS c FROM purchase_orders').get().c,
          employees: db.prepare('SELECT COUNT(*) AS c FROM employees').get().c,
          documents: db.prepare('SELECT COUNT(*) AS c FROM documents').get().c,

          opportunities: db.prepare('SELECT COUNT(*) AS c FROM opportunities').get().c,
          tickets: db.prepare('SELECT COUNT(*) AS c FROM tickets WHERE status != \'resolved\'').get().c,
          contracts: db.prepare('SELECT COUNT(*) AS c FROM contracts').get().c
        };
        return counts;
      }

      // ─── 爆款视频 ───
      case 'list_hot_products':
        return db.prepare('SELECT * FROM hot_products ORDER BY created_at DESC').all();

      case 'get_hot_product': {
        const hp = db.prepare('SELECT * FROM hot_products WHERE id=?').get(args.product_id);
        if (!hp) return { error: '产品不存在' };
        return hp;
      }

      case 'create_hot_product': {
        const id = randomUUID();
        db.prepare('INSERT INTO hot_products (id,brand_name,description,selling_points,contact_info,target_audience,industry_tags) VALUES (?,?,?,?,?,?,?)')
          .run(id, args.brand_name, args.description || '', args.selling_points || '[]', args.contact_info || '', args.target_audience || '', args.industry_tags || '');
        return { id, message: '爆款产品创建成功' };
      }

      case 'update_hot_product': {
        const cur = db.prepare('SELECT * FROM hot_products WHERE id=?').get(args.product_id);
        if (!cur) return { error: '产品不存在' };
        db.prepare('UPDATE hot_products SET brand_name=?,description=?,selling_points=?,contact_info=?,target_audience=?,industry_tags=? WHERE id=?')
          .run(args.brand_name ?? cur.brand_name, args.description ?? cur.description, args.selling_points ?? cur.selling_points, args.contact_info ?? cur.contact_info, args.target_audience ?? cur.target_audience, args.industry_tags ?? cur.industry_tags, args.product_id);
        return { id: args.product_id, message: '产品更新成功' };
      }

      case 'delete_hot_product': {
        const cur = db.prepare('SELECT * FROM hot_products WHERE id=?').get(args.product_id);
        if (!cur) return { error: '产品不存在' };
        db.prepare('DELETE FROM hot_products WHERE id=?').run(args.product_id);
        return { message: `产品「${cur.brand_name}」已删除` };
      }

      case 'list_hot_contents': {
        const status = args.status;
        if (status) return db.prepare('SELECT * FROM hot_contents WHERE status=? ORDER BY generated_at DESC').all(status);
        return db.prepare('SELECT * FROM hot_contents ORDER BY generated_at DESC').all();
      }

      case 'get_hot_content': {
        const hc = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(args.content_id);
        if (!hc) return { error: '内容不存在' };
        return hc;
      }

      case 'create_hot_content': {
        const id = randomUUID();
        db.prepare('INSERT INTO hot_contents (id,title,body,tags,platforms,status) VALUES (?,?,?,?,?,?)')
          .run(id, args.title, args.body || '', args.tags || '', args.platforms || '', args.status || 'draft');
        return { id, message: '内容创建成功' };
      }

      case 'update_hot_content': {
        const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(args.content_id);
        if (!cur) return { error: '内容不存在' };
        db.prepare('UPDATE hot_contents SET title=?,body=?,tags=?,platforms=?,status=?,publish_url=? WHERE id=?')
          .run(args.title ?? cur.title, args.body ?? cur.body, args.tags ?? cur.tags, args.platforms ?? cur.platforms, args.status ?? cur.status, args.publish_url ?? cur.publish_url, args.content_id);
        return { id: args.content_id, message: '内容更新成功' };
      }

      case 'delete_hot_content': {
        const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(args.content_id);
        if (!cur) return { error: '内容不存在' };
        db.prepare('DELETE FROM hot_contents WHERE id=?').run(args.content_id);
        return { message: `内容「${cur.title}」已删除` };
      }

      case 'update_hot_lead': {
        const cur = db.prepare('SELECT * FROM hot_leads WHERE id=?').get(args.lead_id);
        if (!cur) return { error: '线索不存在' };
        db.prepare('UPDATE hot_leads SET status=?,summary=?,pushed=? WHERE id=?')
          .run(args.status ?? cur.status, args.summary ?? cur.summary, args.pushed ?? cur.pushed, args.lead_id);
        return { id: args.lead_id, message: '线索更新成功' };
      }

      case 'list_hot_leads':
        return db.prepare('SELECT * FROM hot_leads ORDER BY created_at DESC').all();

      case 'get_dashboard_hot_stats': {
        const contents = db.prepare("SELECT COUNT(*) AS c FROM hot_contents WHERE status='published'").get().c || 0;
        const drafts = db.prepare("SELECT COUNT(*) AS c FROM hot_contents WHERE status='draft'").get().c || 0;
        const leads = db.prepare('SELECT COUNT(*) AS c FROM hot_leads').get().c || 0;
        const videos = db.prepare("SELECT COUNT(*) AS c FROM hot_contents WHERE video_status='done'").get().c || 0;
        const generating = db.prepare("SELECT COUNT(*) AS c FROM hot_contents WHERE video_status='generating'").get().c || 0;
        return { published_contents: contents, draft_contents: drafts, total_leads: leads, videos_generated: videos, videos_generating: generating };
      }

      // ─── 文档生成已迁移到 OpenClaw Skills ───
      // generate_pptx → mclaw-pptx-gen  |  generate_excel → mclaw-excel-gen
      // generate_pdf  → mclaw-pdf-gen   |  generate_docx  → mclaw-docx-gen
      // 这些工具现在通过 execute_command 调用 Python 脚本，不再走本地 Node.js

      // ─── 定时任务创建 ───
      case 'create_scheduled_task': {
        const wsClient = require('../openclaw/ws-client');
        const { parseSchedule } = require('../shared/schedule');
        const ctx = context || getExecutionContext();
        const params = {
          name: args.name,
          description: args.description || '',
          enabled: args.enabled !== false,
          schedule: parseSchedule(args.schedule),
          sessionTarget: 'isolated',
          wakeMode: 'now',
          payload: { kind: 'agentTurn', message: args.message }
        };
        // 优先用 LLM 指定的 agent_id，其次用当前对话的 Agent
        if (args.agent_id) params.agentId = args.agent_id;
        else if (ctx?.agentId) params.agentId = ctx.agentId;
        const result = await wsClient.request('cron.add', params);
        return { success: true, message: `定时任务「${args.name}」创建成功`, task_id: result.id, schedule: args.schedule };
      }

      // ─── OpenClaw 命令执行 ───
      case 'execute_command': {
        const wsClient = require('../openclaw/ws-client');
        const command = args.command;
        if (!command || typeof command !== 'string') return { error: '缺少 command 参数' };

        // 获取本地节点 ID（缓存）
        if (!_cachedNodeId) {
          try {
            const nodes = await wsClient.request('node.list');
            const local = (nodes?.nodes || nodes || []).find(n =>
              n.connected && (n.commands || []).includes('system.run')
            );
            if (local) _cachedNodeId = local.nodeId || local.id;
          } catch {}
        }
        if (!_cachedNodeId) return { error: '无法找到可用的 OpenClaw 节点，请确认 OpenClaw 已启动并连接' };

        const argv = process.platform === 'win32'
          ? ['cmd.exe', '/d', '/s', '/c', command]
          : ['/bin/sh', '-lc', command];

        const result = await wsClient.request('node.invoke', {
          nodeId: _cachedNodeId,
          command: 'system.run',
          params: { command: argv, rawCommand: command, timeoutMs: 60000 },
          idempotencyKey: randomUUID()
        }, 120000);

        const payload = result?.payload;
        if (payload && typeof payload === 'object') {
          const stdout = typeof payload.stdout === 'string' ? payload.stdout : '';
          const stderr = typeof payload.stderr === 'string' ? payload.stderr : '';
          const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : null;
          const success = payload.success === true;

          let output = '';
          if (stdout) output += stdout;
          if (stderr) output += (output ? '\n\n[stderr]\n' : '[stderr]\n') + stderr;
          if (!output) output = success ? '命令执行成功（无输出）' : `命令执行失败，退出码: ${exitCode ?? '未知'}`;

          // 记录使用日志
          try {
            const ctx = context || getExecutionContext();
            if (ctx?.agentId) {
              db.prepare('INSERT INTO skill_usage_log (agent_id, command) VALUES (?,?)').run(ctx.agentId, command);
            }
          } catch {}

          return { success, exitCode, output };
        }

        return { error: '命令执行返回异常: ' + JSON.stringify(result).slice(0, 500) };
      }

      // ─── 技能发现：搜索可用技能 ───
      case 'search_skills': {
        const query = (args.query || '').toLowerCase();
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const searchDirs = [
          path.join(os.homedir(), '.openclaw', 'workspace', 'skills'),
          path.join(os.homedir(), '.openclaw', 'skills'),
          path.join(os.homedir(), '.agents', 'skills'),
        ];

        const results = [];
        for (const dir of searchDirs) {
          if (!fs.existsSync(dir)) continue;
          try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              if (!entry.isDirectory()) continue;
              const name = entry.name.toLowerCase();
              const mdPath = path.join(dir, entry.name, 'SKILL.md');
              if (!fs.existsSync(mdPath)) continue;

              // 匹配技能名或读取描述
              let description = '';
              try {
                const content = fs.readFileSync(mdPath, 'utf8');
                const descMatch = content.match(/^description:\s*(.+)$/m);
                if (descMatch) description = descMatch[1].trim();
              } catch {}

              const matchText = name + ' ' + description.toLowerCase();
              if (!query || matchText.includes(query)) {
                results.push({
                  name: entry.name,
                  description: description || '(无描述)',
                  source: dir.includes('workspace') ? 'workspace' : dir.includes('.agents') ? 'legacy' : 'managed'
                });
              }
            }
          } catch {}
        }

        return { skills: results.slice(0, 20), total: results.length };
      }

      // ─── 技能发现：加载单个技能完整内容 ───
      case 'load_skill': {
        const skillName = args.name;
        if (!skillName) return { error: '缺少 name 参数' };
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const searchDirs = [
          path.join(os.homedir(), '.openclaw', 'workspace', 'skills', skillName),
          path.join(os.homedir(), '.openclaw', 'skills', skillName),
          path.join(os.homedir(), '.agents', 'skills', skillName),
        ];

        for (const dir of searchDirs) {
          const mdPath = path.join(dir, 'SKILL.md');
          if (!fs.existsSync(mdPath)) continue;
          try {
            let content = fs.readFileSync(mdPath, 'utf8');
            // 去掉 YAML frontmatter
            content = content.replace(/^---[\s\S]*?---\n*/, '');
            return {
              name: skillName,
              content: content.substring(0, 8000),
              path: mdPath
            };
          } catch (e) {
            return { error: '读取失败: ' + e.message };
          }
        }

        return { error: `技能 "${skillName}" 未找到` };
      }

      // ─── 财务管理 ───
      case 'list_finance_records': {
        const ftype = args.type || 'receivable';
        return db.prepare('SELECT * FROM finance_records WHERE type=? ORDER BY created_at DESC').all(ftype);
      }
      case 'get_finance_summary': {
        const stats = (type) => {
          const rows = db.prepare('SELECT * FROM finance_records WHERE type=?').all(type);
          return {
            count: rows.length,
            total_receivable: rows.reduce((s, r) => s + (r.receivable_amount || 0), 0),
            total_received: rows.reduce((s, r) => s + (r.received_amount || 0), 0),
            total_unreceived: rows.reduce((s, r) => s + (r.unreceived_amount || 0), 0),
          };
        };
        return { receivable: stats('receivable'), payable: stats('payable') };
      }

      // ─── 招投标统计 ───
      case 'list_bid_statistics': {
        const { keyword, region, industry, page = 1, pageSize = 50 } = args || {};
        let sql = 'SELECT * FROM bid_statistics WHERE 1=1';
        const params = [];
        if (keyword) { sql += ' AND (project_name LIKE ? OR bidder LIKE ? OR win_company LIKE ? OR project_content LIKE ?)';
          params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
        if (region) { sql += ' AND region=?'; params.push(region); }
        if (industry) { sql += ' AND industry=?'; params.push(industry); }
        sql += ' ORDER BY created_at DESC';
        const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) AS cnt')).get(...params)?.cnt || 0;
        const offset = (Number(page) - 1) * Number(pageSize);
        const rows = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, Number(pageSize), offset);
        return { rows, total, page: Number(page) };
      }

      // ─── 招投标 ───
      case 'list_bid_items': {
        const { status, keyword } = args || {};
        let sql = 'SELECT bi.*, bs.name AS source_name FROM bid_items bi LEFT JOIN bid_sources bs ON bi.source_id=bs.id WHERE 1=1';
        const params = [];
        if (status) { sql += ' AND bi.status=?'; params.push(status); }
        if (keyword) { sql += ' AND bi.title LIKE ?'; params.push(`%${keyword}%`); }
        sql += ' ORDER BY bi.created_at DESC LIMIT 100';
        return db.prepare(sql).all(...params);
      }
      case 'search_bid_items': {
        const kw = args.keyword || '';
        return db.prepare('SELECT bi.*, bs.name AS source_name FROM bid_items bi LEFT JOIN bid_sources bs ON bi.source_id=bs.id WHERE bi.title LIKE ? ORDER BY bi.fetch_time DESC LIMIT 50').all(`%${kw}%`);
      }
      case 'list_bid_sources':
        return db.prepare('SELECT * FROM bid_sources ORDER BY name').all();
      case 'list_bid_keywords':
        return db.prepare('SELECT * FROM bid_keywords ORDER BY keyword').all();
      case 'trigger_bid_collect': {
        const { runCollect: crawl4aiCollect } = require('../services/crawl4ai-collector');
        const { runCollect: scraplingCollect } = require('../services/scrapling-collector');
        const { runCollect: woyaobidCollect } = require('../services/woyaobid-crawler');
        const [r1, r2, r3] = await Promise.allSettled([
          crawl4aiCollect().catch(e => ({ engine: 'crawl4ai', found: 0, inserted: 0, error: e.message })),
          scraplingCollect().catch(e => ({ engine: 'scrapling', found: 0, inserted: 0, error: e.message })),
          woyaobidCollect().catch(e => ({ engine: 'woyaobid', found: 0, inserted: 0, error: e.message }))
        ]);
        const c4 = r1.value || { engine: 'crawl4ai', found: 0, inserted: 0 };
        const sp = r2.value || { engine: 'scrapling', found: 0, inserted: 0 };
        const wy = r3.value || { engine: 'woyaobid', found: 0, inserted: 0 };
        const totalFound = c4.found + sp.found + wy.found;
        const totalInserted = c4.inserted + sp.inserted + wy.inserted;
        const parts = [
          `Crawl4AI: 发现 ${c4.found} 新增 ${c4.inserted}`,
          `Scrapling: 发现 ${sp.found} 新增 ${sp.inserted}`,
          `乙方宝: 发现 ${wy.found} 新增 ${wy.inserted}`
        ];
        if (c4.error) parts[0] += ` (${c4.error})`;
        if (sp.error) parts[1] += ` (${sp.error})`;
        if (wy.error) parts[2] += ` (${wy.error})`;
        return { success: true, message: `采集完成：共发现 ${totalFound} 个项目，新增 ${totalInserted} 个\n${parts.join('\n')}` };
      }

      case 'list_local_files': {
        const { listLocalFiles } = require('../channels/agent-bridge');
        const ctx = getExecutionContext();
        return listLocalFiles(ctx.agentId);
      }

      case 'search_local_files': {
        const { searchLocalFiles } = require('../channels/agent-bridge');
        const ctx = getExecutionContext();
        return await searchLocalFiles(args.query, ctx.agentId);
      }

      case 'read_local_file': {
        const { readLocalFile } = require('../channels/agent-bridge');
        const ctx = getExecutionContext();
        return await readLocalFile(args.filePath, ctx.agentId);
      }

      // ─── 网页内容提取 ───
      case 'stealth_extract': {
        if (!args.url) return { error: '缺少 url 参数' };
        try { new URL(args.url); } catch { return { error: '无效的 URL 格式' }; }
        const { chromium } = require('playwright');
        let browser;
        try {
          browser = await chromium.launch({ headless: true });
          const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            viewport: { width: 1366, height: 768 }
          });
          const page = await context.newPage();
          // 隐藏 webdriver 特征
          await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            window.chrome = { runtime: {} };
          });
          await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          const content = await page.evaluate(() => {
            const title = document.title || '';
            const article = document.querySelector('article, [role="main"], .rich_media_content, #js_content, .article-content, main');
            const body = article || document.body;
            // 提取文本，保留标题和图片说明
            let text = '';
            const extract = (node) => {
              for (const child of node.childNodes) {
                if (child.nodeType === 3) {
                  const t = child.textContent.trim();
                  if (t) text += t + '\n';
                } else if (child.nodeType === 1) {
                  const tag = child.tagName?.toLowerCase();
                  if (['script', 'style', 'noscript', 'nav', 'footer', 'iframe'].includes(tag)) continue;
                  if (/^h[1-6]$/.test(tag)) text += '\n## ' + child.textContent.trim() + '\n\n';
                  else if (tag === 'img') { const a = child.getAttribute('alt'); if (a) text += '[图片: ' + a + ']\n'; }
                  else if (tag === 'a') { const h = child.getAttribute('href'); const t = child.textContent.trim(); if (h && t) text += '[' + t + '](' + h + ')'; }
                  else if (tag === 'br') text += '\n';
                  else extract(child);
                }
              }
            };
            extract(body);
            return { title, text: text.replace(/\n{3,}/g, '\n\n').trim().substring(0, 8000) };
          });
          await browser.close();
          return { url: args.url, title: content.title, content: content.text, format: 'text' };
        } catch (err) {
          if (browser) await browser.close().catch(() => {});
          return { error: `页面提取失败: ${err.message}` };
        }
      }

      // ─── 多 Agent 委派 ───
      case 'delegate_to_agent':
        const { delegateToAgent } = require('./delegate');
        return await delegateToAgent(args.agent_id || args.agentId, args.task || args.prompt, {
          depth: args._depth || 0
        });

      case 'delegate_parallel':
        const { delegateParallel } = require('./delegate');
        return await delegateParallel(args.tasks || [], {
          depth: args._depth || 0
        });

      // ─── 记忆系统 ───
      case 'tool_remember':
        const { toolRemember } = require('../services/memory');
        return await toolRemember(
          args.agent_id || context?.agentId || getExecutionContext(),
          args.content,
          args.source || 'agent'
        );

      case 'tool_recall':
        const { toolRecall } = require('../services/memory');
        return await toolRecall(
          args.agent_id || context?.agentId || getExecutionContext(),
          args.query
        );

      default:
        return { error: `未知工具: ${normalizedName}` };
    }
  } catch (err) {
    console.error(`[executor] ${normalizedName || toolName} error:`, err.message);
    return { error: `操作失败: ${err.message}` };
  }
}

// ── 工具并发执行 ──

const MAX_TOOL_CALLS_PER_RESPONSE = 16; // 防止 LLM 一次性发送过量 tool_calls

/**
 * 批量执行工具调用，并发安全的工具并行执行
 * @param {Array} toolCalls - [{ id, function: { name, arguments } }]
 * @param {Object} context - 执行上下文
 * @returns {Array} - 与 toolCalls 位置对齐的结果数组
 */
async function execBatch(toolCalls, context) {
  if (!toolCalls || !toolCalls.length) return [];

  // 工具洪泛上限：超过 16 个只执行前 16 个，其余返回错误
  if (toolCalls.length > MAX_TOOL_CALLS_PER_RESPONSE) {
    console.warn(`[executor] 工具洪泛: ${toolCalls.length} 个 tool_calls, 上限 ${MAX_TOOL_CALLS_PER_RESPONSE}`);
    const truncated = toolCalls.slice(0, MAX_TOOL_CALLS_PER_RESPONSE);
    const overflow = toolCalls.slice(MAX_TOOL_CALLS_PER_RESPONSE);
    const results = await _execBatchInternal(truncated, context);
    for (const tc of overflow) {
      results.push({ error: `工具调用被限流（单轮最多 ${MAX_TOOL_CALLS_PER_RESPONSE} 个）。请分批执行。` });
    }
    return results;
  }

  return _execBatchInternal(toolCalls, context);
}

async function _execBatchInternal(toolCalls, context) {
  if (!toolCalls || !toolCalls.length) return [];

  // 日志
  console.log(`[executor] batch ${toolCalls.length} tools: ${toolCalls.map(tc => normalizeToolName(tc.function?.name || '?')).join(', ')}`);

  // 按并发安全性分组
  const groups = [];
  let currentGroup = { safe: true, calls: [], indices: [] };

  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i];
    const name = normalizeToolName(tc.function?.name || '');
    const isReadOnly = READ_ONLY_TOOLS.has(name);
    const isSafe = isReadOnly; // 只有只读工具可以并发

    if (isSafe === currentGroup.safe) {
      currentGroup.calls.push(tc);
      currentGroup.indices.push(i);
    } else {
      if (currentGroup.calls.length) groups.push(currentGroup);
      currentGroup = { safe: isSafe, calls: [tc], indices: [i] };
    }
  }
  if (currentGroup.calls.length) groups.push(currentGroup);

  // 分段执行
  const results = new Array(toolCalls.length);

  for (const group of groups) {
    if (group.safe) {
      // 并发安全组：并行执行
      const batch = await Promise.all(
        group.calls.map(async (tc, idx) => {
          let args;
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
          const startTime = Date.now();
          try {
            const result = await exec(tc.function.name, args, context);
            const duration = Date.now() - startTime;
            if (duration > 1000) {
              console.log(`[executor] ${tc.function.name} took ${duration}ms`);
            }
            // 指标记录
            try {
              const metrics = require('../services/tool-metrics');
              metrics.record(tc.function.name, duration, !!(result && !result.error), result?.error || '', context?.agentId || '');
            } catch {}
            // 事件推送
            try {
              require('../channels/event-bus').broadcast({
                type: 'tool_executed',
                tool: tc.function.name,
                duration_ms: duration,
                success: !!(result && !result.error),
                time: Date.now()
              });
            } catch {}
            return result;
          } catch (err) {
            return { error: `工具执行异常: ${err.message}` };
          }
        })
      );
      // 按原始位置放回
      group.indices.forEach((originalIdx, batchIdx) => {
        results[originalIdx] = batch[batchIdx];
      });
    } else {
      // 写工具组：顺序执行（避免数据竞争）
      for (let j = 0; j < group.calls.length; j++) {
        const tc = group.calls[j];
        let args;
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
        const sTime = Date.now();
        try {
          const r = await exec(tc.function.name, args, context);
          const dur = Date.now() - sTime;
          if (dur > 1000) console.log(`[executor] ${tc.function.name} took ${dur}ms`);
          try { require('../services/tool-metrics').record(tc.function.name, dur, !!(r && !r.error), r?.error || '', context?.agentId || ''); } catch {}
          results[group.indices[j]] = r;
        } catch (err) {
          results[group.indices[j]] = { error: `工具执行异常: ${err.message}` };
        }
      }
    }
  }

  return results;
}

/**
 * 判断工具是否只读（并发安全）
 */
function isReadOnlyTool(toolName) {
  return READ_ONLY_TOOLS.has(normalizeToolName(toolName));
}

module.exports = { exec, execBatch, normalizeToolName, isReadOnlyTool };
