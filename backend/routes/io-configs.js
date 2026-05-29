// 导入导出表配置
// field: 数据库字段名, header: Excel 列头, width: 列宽
// fk: { table, key, display } 外键映射（导入时用 display 值查 key，导出时显示 display）
// required: 导入时必填
// templateExclude: 模板中排除此列（如 id, created_at）

const TABLE_CONFIGS = {

  // ======================== CRM ========================
  customers: {
    table: 'customers',
    columns: [
      { field: 'name', header: '姓名', width: 15, required: true },
      { field: 'phone', header: '电话', width: 15 },
      { field: 'company', header: '公司', width: 20 },
      { field: 'source', header: '来源', width: 12 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  contacts: {
    table: 'contacts',
    columns: [
      { field: 'name', header: '姓名', width: 15, required: true },
      { field: 'customer_id', header: '所属客户', width: 20, fk: { table: 'customers', key: 'id', display: 'name' } },
      { field: 'position', header: '职位', width: 15 },
      { field: 'phone', header: '电话', width: 15 },
      { field: 'email', header: '邮箱', width: 20 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  opportunities: {
    table: 'opportunities',
    columns: [
      { field: 'title', header: '机会名称', width: 25, required: true },
      { field: 'customer_id', header: '客户', width: 15, fk: { table: 'customers', key: 'id', display: 'name' } },
      { field: 'stage', header: '阶段', width: 12 },
      { field: 'amount', header: '金额', width: 12 },
      { field: 'probability', header: '赢率(%)', width: 10 },
      { field: 'expected_close_date', header: '预计成交日', width: 14 },
      { field: 'owner', header: '负责人', width: 12 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  leads: {
    table: 'leads',
    columns: [
      { field: 'name', header: '姓名', width: 15, required: true },
      { field: 'phone', header: '电话', width: 15 },
      { field: 'company', header: '公司', width: 20 },
      { field: 'source', header: '来源', width: 12 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  campaigns: {
    table: 'marketing_campaigns',
    columns: [
      { field: 'name', header: '活动名', width: 20, required: true },
      { field: 'type', header: '类型', width: 12 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'budget', header: '预算', width: 12 },
      { field: 'start_date', header: '开始日期', width: 14 },
      { field: 'end_date', header: '结束日期', width: 14 },
      { field: 'description', header: '描述', width: 25 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  quotations: {
    table: 'quotations',
    columns: [
      { field: 'title', header: '标题', width: 25 },
      { field: 'customer_id', header: '客户', width: 15, fk: { table: 'customers', key: 'id', display: 'name' } },
      { field: 'total', header: '金额', width: 12 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'valid_until', header: '有效期至', width: 14 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  contracts: {
    table: 'contracts',
    columns: [
      { field: 'title', header: '合同名称', width: 30, required: true },
      { field: 'contract_no', header: '合同编号', width: 20 },
      { field: 'sales_owner', header: '所属销售', width: 12 },
      { field: 'contact_name', header: '客户联系人', width: 15 },
      { field: 'contact_phone', header: '联系电话', width: 15 },
      { field: 'content', header: '合同内容（产品/服务）', width: 35 },
      { field: 'amount', header: '合同金额', width: 12 },
      { field: 'signed_date', header: '合同签订时间', width: 15 },
      { field: 'warranty_period', header: '合同/质保期限', width: 15 },
      { field: 'prepaid_amount', header: '预付金额', width: 12 },
      { field: 'receivable_amount', header: '应收金额', width: 12 },
      { field: 'invoice', header: '发票开具', width: 12 },
      { field: 'delivery_progress', header: '合同交付进度', width: 15 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  tickets: {
    table: 'tickets',
    columns: [
      { field: 'title', header: '标题', width: 25, required: true },
      { field: 'customer_id', header: '客户', width: 15, fk: { table: 'customers', key: 'id', display: 'name' } },
      { field: 'description', header: '描述', width: 30 },
      { field: 'priority', header: '优先级', width: 10 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'assigned_to', header: '指派给', width: 12 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  feedback: {
    table: 'customer_feedback',
    columns: [
      { field: 'customer_id', header: '客户', width: 15, fk: { table: 'customers', key: 'id', display: 'name' } },
      { field: 'rating', header: '评分', width: 8 },
      { field: 'category', header: '类别', width: 12 },
      { field: 'content', header: '内容', width: 30 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  // ======================== 进销存 ========================
  products: {
    table: 'products',
    columns: [
      { field: 'name', header: '产品名', width: 20, required: true },
      { field: 'sku', header: 'SKU', width: 15 },
      { field: 'unit', header: '单位', width: 8 },
      { field: 'sale_price', header: '售价', width: 10 },
      { field: 'cost_price', header: '成本', width: 10 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  suppliers: {
    table: 'suppliers',
    columns: [
      { field: 'name', header: '名称', width: 20, required: true },
      { field: 'contact_person', header: '联系人', width: 12 },
      { field: 'phone', header: '电话', width: 15 },
      { field: 'email', header: '邮箱', width: 20 },
      { field: 'address', header: '地址', width: 25 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  purchase_orders: {
    table: 'purchase_orders',
    columns: [
      { field: 'supplier_id', header: '供应商', width: 20, required: true, fk: { table: 'suppliers', key: 'id', display: 'name' } },
      { field: 'total', header: '总额', width: 12 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'ordered_date', header: '下单日期', width: 14 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  sales_orders: {
    table: 'sales_orders',
    columns: [
      { field: 'customer_id', header: '客户', width: 20, fk: { table: 'customers', key: 'id', display: 'name' } },
      { field: 'total', header: '总额', width: 12 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'order_date', header: '下单日期', width: 14 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  stock_transactions: {
    table: 'stock_transactions',
    exportOnly: true,
    columns: [
      { field: 'product_id', header: '产品', width: 20, fk: { table: 'products', key: 'id', display: 'name' } },
      { field: 'warehouse_id', header: '仓库', width: 12, fk: { table: 'warehouses', key: 'id', display: 'name' } },
      { field: 'type', header: '类型', width: 8 },
      { field: 'quantity', header: '数量', width: 8 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'operator', header: '操作人', width: 12 },
      { field: 'created_at', header: '操作时间', width: 18 },
    ],
  },

  asset_ledger: {
    table: 'asset_ledger',
    columns: [
      { field: 'product_name', header: '产品名称', width: 20, required: true },
      { field: 'serial_no', header: '序列号', width: 20 },
      { field: 'deploy_date', header: '部署日期', width: 14 },
      { field: 'warranty_expire', header: '维保到期', width: 14 },
      { field: 'license_expire', header: '许可到期', width: 14 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  warehouses: {
    table: 'warehouses',
    columns: [
      { field: 'name', header: '仓库名', width: 20, required: true },
      { field: 'address', header: '地址', width: 25 },
      { field: 'manager', header: '负责人', width: 12 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  returns: {
    table: 'returns',
    columns: [
      { field: 'product_id', header: '产品', width: 20, fk: { table: 'products', key: 'id', display: 'name' } },
      { field: 'sales_order_id', header: '关联销售单', width: 20 },
      { field: 'quantity', header: '数量', width: 8 },
      { field: 'reason', header: '原因', width: 25 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  inventory_alerts: {
    table: 'inventory_alerts',
    columns: [
      { field: 'product_id', header: '产品', width: 20, required: true, fk: { table: 'products', key: 'id', display: 'name' } },
      { field: 'warehouse_id', header: '仓库', width: 15, fk: { table: 'warehouses', key: 'id', display: 'name' } },
      { field: 'min_quantity', header: '最低库存', width: 10 },
      { field: 'max_quantity', header: '最高库存', width: 10 },
      { field: 'enabled', header: '启用', width: 8 },
    ],
  },

  // ======================== HR ========================
  employees: {
    table: 'employees',
    columns: [
      { field: 'name', header: '姓名', width: 12, required: true },
      { field: 'department', header: '部门', width: 15 },
      { field: 'role', header: '职位', width: 15 },
      { field: 'phone', header: '电话', width: 15 },
      { field: 'email', header: '邮箱', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  departments: {
    table: 'departments',
    columns: [
      { field: 'name', header: '部门名', width: 20, required: true },
      { field: 'manager_id', header: '负责人', width: 15 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  recruitment: {
    table: 'recruitment',
    columns: [
      { field: 'position', header: '职位', width: 20, required: true },
      { field: 'department', header: '部门', width: 15 },
      { field: 'headcount', header: '人数', width: 8 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'requirements', header: '要求', width: 25 },
      { field: 'salary_range', header: '薪资范围', width: 15 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  candidates: {
    table: 'candidates',
    columns: [
      { field: 'name', header: '姓名', width: 12, required: true },
      { field: 'recruitment_id', header: '应聘职位', width: 20, fk: { table: 'recruitment', key: 'id', display: 'position' } },
      { field: 'phone', header: '电话', width: 15 },
      { field: 'email', header: '邮箱', width: 20 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'remark', header: '备注', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  leave_requests: {
    table: 'leave_requests',
    columns: [
      { field: 'employee_id', header: '员工', width: 12, required: true, fk: { table: 'employees', key: 'id', display: 'name' } },
      { field: 'start_date', header: '开始日期', width: 14, required: true },
      { field: 'end_date', header: '结束日期', width: 14, required: true },
      { field: 'reason', header: '事由', width: 25 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  clock_records: {
    table: 'clock_records',
    columns: [
      { field: 'employee_id', header: '员工', width: 12, required: true, fk: { table: 'employees', key: 'id', display: 'name' } },
      { field: 'clock_type', header: '类型(in/out)', width: 14, required: true },
      { field: 'clock_time', header: '打卡时间', width: 18, required: true },
      { field: 'source', header: '来源', width: 10 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
    // 导入时将 employee name 转为 id，将中文类型转为 in/out
  },

  attendance_rules: {
    table: 'attendance_rules',
    columns: [
      { field: 'name', header: '规则名', width: 20, required: true },
      { field: 'check_in_time', header: '上班时间', width: 12 },
      { field: 'check_out_time', header: '下班时间', width: 12 },
      { field: 'late_threshold', header: '迟到阈值(分)', width: 14 },
      { field: 'work_days', header: '工作日', width: 15 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  personnel_changes: {
    table: 'personnel_changes',
    columns: [
      { field: 'employee_id', header: '员工', width: 12, required: true, fk: { table: 'employees', key: 'id', display: 'name' } },
      { field: 'type', header: '类型', width: 10, required: true },
      { field: 'old_department', header: '原部门', width: 15 },
      { field: 'new_department', header: '新部门', width: 15 },
      { field: 'old_role', header: '原职位', width: 15 },
      { field: 'new_role', header: '新职位', width: 15 },
      { field: 'effective_date', header: '生效日期', width: 14 },
      { field: 'reason', header: '原因', width: 20 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  performance_schemes: {
    table: 'performance_schemes',
    columns: [
      { field: 'name', header: '方案名', width: 25, required: true },
      { field: 'period', header: '周期', width: 10 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  performance_items: {
    table: 'performance_items',
    columns: [
      { field: 'scheme_id', header: '考核方案', width: 20, required: true, fk: { table: 'performance_schemes', key: 'id', display: 'name' } },
      { field: 'employee_id', header: '员工', width: 12, required: true, fk: { table: 'employees', key: 'id', display: 'name' } },
      { field: 'indicator', header: '指标', width: 20, required: true },
      { field: 'weight', header: '权重', width: 8 },
      { field: 'target', header: '目标', width: 20 },
      { field: 'self_score', header: '自评', width: 8 },
      { field: 'leader_score', header: '上级评分', width: 10 },
      { field: 'comment', header: '评语', width: 20 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  // ======================== 文档 ========================
  documents: {
    table: 'documents',
    exportOnly: true,
    columns: [
      { field: 'title', header: '文件名', width: 30 },
      { field: 'file_type', header: '类型', width: 10 },
      { field: 'file_size', header: '大小(KB)', width: 12 },
      { field: 'category', header: '分类', width: 15 },
      { field: 'tags', header: '标签', width: 20 },
      { field: 'created_at', header: '上传时间', width: 18 },
    ],
  },

  document_folders: {
    table: 'document_folders',
    columns: [
      { field: 'name', header: '分类名', width: 30, required: true },
      { field: 'remark', header: '备注', width: 25 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  // ======================== 销售 ========================
  bid_sources: {
    table: 'bid_sources',
    columns: [
      { field: 'name', header: '名称', width: 25, required: true },
      { field: 'url', header: '网址', width: 35 },
      { field: 'interval_minutes', header: '采集间隔(分)', width: 14 },
      { field: 'enabled', header: '启用', width: 8 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  bid_keywords: {
    table: 'bid_keywords',
    columns: [
      { field: 'keyword', header: '关键词', width: 30, required: true },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  bid_items: {
    table: 'bid_items',
    columns: [
      { field: 'title', header: '项目名称', width: 35, required: true },
      { field: 'bid_type', header: '招投标方式', width: 14 },
      { field: 'submit_type', header: '投标方式', width: 10 },
      { field: 'url', header: '网址', width: 30 },
      { field: 'amount', header: '金额', width: 12 },
      { field: 'bid_time', header: '开标时间', width: 18 },
      { field: 'doc_deadline', header: '截标时间', width: 18 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },

  content_publish: {
    table: 'content_publish',
    columns: [
      { field: 'platform', header: '平台', width: 12, required: true },
      { field: 'content_type', header: '类型', width: 10 },
      { field: 'content', header: '内容', width: 35 },
      { field: 'scheduled_at', header: '计划时间', width: 18 },
      { field: 'status', header: '状态', width: 10 },
      { field: 'created_at', header: '创建时间', width: 18, templateExclude: true },
    ],
  },
};

module.exports = TABLE_CONFIGS;
