<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><el-button text @click="router.push('/digital')"><el-icon><ArrowLeft/></el-icon></el-button><span class="pg-title" style="margin-bottom:0">销售管理</span></div>
      <div class="kpi-row">
        <div class="kpi" v-for="k in kpis" :key="k.label"><div class="kpi-val">{{ k.val }}</div><div class="kpi-lbl">{{ k.label }}</div></div>
      </div>
    </div>
    <div class="pg-body">
      <el-menu :default-active="tab" class="side-tabs" @select="handleTabSelect">
        <el-menu-item index="crm">客户关系管理</el-menu-item>
        <el-menu-item index="bids">招投标采集</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <!-- ===== 客户关系管理 ===== -->
        <div v-if="tab==='crm'">
          <el-tabs v-model="crmTab" type="card" style="margin-bottom:12px">
            <el-tab-pane label="客户信息" name="customers"></el-tab-pane>
            <el-tab-pane label="项目商机" name="opportunities"></el-tab-pane>
            <el-tab-pane label="合同订单" name="contracts"></el-tab-pane>
          </el-tabs>
          <!-- 客户信息 -->
          <div v-if="crmTab==='customers'">
            <div class="tb"><el-button type="primary" @click="openCusDlg()">新增客户</el-button><el-button @click="handleExport('customers')">导出</el-button><el-button @click="handleImport('customers')">导入</el-button></div>
            <el-empty v-if="!loadingCrm&&customers.length===0" description="暂无客户"/>
            <el-table v-loading="loadingCrm" :data="customers" stripe border row-key="id" style="width:100%">
              <el-table-column type="index" label="#" width="50"/>
              <el-table-column prop="name" label="客户名称" width="120"/>
              <el-table-column prop="phone" label="联系电话" width="130"/>
              <el-table-column prop="company" label="所属单位" min-width="160"/>
              <el-table-column prop="position" label="职务" width="100"/>
              <el-table-column prop="gender" label="性别" width="60"/>
              <el-table-column prop="age" label="年龄" width="60"/>
              <el-table-column prop="contact_frequency" label="接触频次" width="100"/>
              <el-table-column label="操作" width="240" fixed="right">
                <template #default="{row}">
                  <el-button size="small" type="primary" link @click="openCusDlg(row)">编辑</el-button>
                  <el-button size="small" type="primary" link @click="openContacts(row)">联系人</el-button>
                  <el-button size="small" type="primary" link @click="openFollow(row)">跟进</el-button>
                  <el-button size="small" type="danger" link @click="delCus(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <!-- 项目商机 -->
          <div v-else-if="crmTab==='opportunities'">
            <div class="tb"><el-button type="primary" @click="opDlg.ed=false;opDlg.visible=true">新增商机</el-button><el-button @click="handleExport('opportunities')">导出</el-button><el-button @click="handleImport('opportunities')">导入</el-button></div>
            <el-table v-loading="loadingCrm" :data="opportunities" stripe border row-key="id" style="width:100%">
              <el-table-column type="index" label="#" width="50"/>
              <el-table-column prop="title" label="商机名称" width="160"/>
              <el-table-column prop="sales_owner" label="所属销售" width="100"/>
              <el-table-column prop="contact_name" label="客户联系人" width="110"/>
              <el-table-column prop="contact_phone" label="联系电话" width="130"/>
              <el-table-column prop="amount" label="商机金额" width="100"/>
              <el-table-column prop="stage" label="阶段" width="90">
                <template #default="{row}"><el-tag :type="stageType(row.stage)" size="small">{{ stageLabel(row.stage) }}</el-tag></template>
              </el-table-column>
              <el-table-column label="操作" width="140"><template #default="{row}"><el-button size="small" type="primary" link @click="openOpDlg(row)">编辑</el-button><el-button size="small" type="danger" link @click="delOp(row.id)">删除</el-button></template></el-table-column>
            </el-table>
          </div>
          <!-- 合同订单 -->
          <div v-else-if="crmTab==='contracts'">
            <div class="tb"><el-button type="primary" @click="cnDlg.ed=false;cnDlg.visible=true">新增合同</el-button><el-button @click="handleExport('contracts')">导出</el-button><el-button @click="handleImport('contracts')">导入</el-button></div>
            <el-empty v-if="!loadingCrm&&contracts.length===0" description="暂无合同"/>
            <el-table v-loading="loadingCrm" :data="contracts" stripe border row-key="id" style="width:100%">
              <el-table-column type="index" label="#" width="45" fixed/>
              <el-table-column prop="title" label="合同名称" min-width="180" show-overflow-tooltip fixed/>
              <el-table-column prop="contract_no" label="合同编号" width="140"/>
              <el-table-column prop="sales_owner" label="所属销售" width="80"/>
              <el-table-column prop="contact_name" label="客户联系人" width="100"/>
              <el-table-column prop="contact_phone" label="联系电话" width="120"/>
              <el-table-column prop="content" label="合同内容（产品/服务）" min-width="180" show-overflow-tooltip/>
              <el-table-column prop="amount" label="合同金额" width="110" :formatter="fmtMoney"/>
              <el-table-column prop="signed_date" label="签订时间" width="110"/>
              <el-table-column prop="warranty_period" label="质保期限" width="100"/>
              <el-table-column prop="prepaid_amount" label="预付金额" width="100" :formatter="fmtMoney"/>
              <el-table-column prop="receivable_amount" label="应收金额" width="100" :formatter="fmtMoney"/>
              <el-table-column prop="invoice" label="发票开具" width="90"/>
              <el-table-column prop="delivery_progress" label="交付进度" width="90"/>
              <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip/>
              <el-table-column label="操作" width="140" fixed="right"><template #default="{row}"><el-button size="small" type="primary" link @click="openCnDlg(row)">编辑</el-button><el-button size="small" type="danger" link @click="delCn(row.id)">删除</el-button></template></el-table-column>
            </el-table>
          </div>
        </div>
        <!-- ===== 招投标采集 ===== -->
        <div v-else-if="tab==='bids'">
          <div style="background:#fef2f2;border:2px solid #ef4444;border-radius:8px;padding:8px 16px;margin-bottom:12px;font-size:13px;color:#dc2626;font-weight:700">✅ 新版招投标采集设置已加载 — 点击「采集设置」查看</div>
          <!-- 状态仪表盘 -->
          <div class="bid-dash">
            <div class="bid-card">
              <div class="bid-card-icon" style="background:#eff6ff"><span style="color:#3b82f6;font-size:18px">📋</span></div>
              <div class="bid-card-info">
                <div class="bid-card-label">招标项目</div>
                <div class="bid-card-val">{{ bidItems.length }} 条<span v-if="newBidCount" style="font-size:12px;color:#ef4444;font-weight:400;margin-left:4px">新{{ newBidCount }}</span></div>
              </div>
            </div>
            <div class="bid-card">
              <div class="bid-card-icon" style="background:#fef3c7"><span style="color:#d97706;font-size:18px">📡</span></div>
              <div class="bid-card-info">
                <div class="bid-card-label">采集来源</div>
                <div class="bid-card-val">{{ bidSources.length }} 个</div>
              </div>
            </div>
            <div class="bid-card">
              <div class="bid-card-icon" :style="{background: wyloggedIn ? '#ecfdf5' : '#fef2f2'}">
                <span :style="{color: wyloggedIn ? '#059669' : '#ef4444', fontSize:'18px'}">{{ wyloggedIn ? '✓' : '!' }}</span>
              </div>
              <div class="bid-card-info">
                <div class="bid-card-label">乙方宝</div>
                <div class="bid-card-val" :style="{color: wyloggedIn ? '#059669' : '#ef4444'}">{{ wyloggedIn ? '已登录' : '未登录' }}</div>
              </div>
            </div>
          </div>
          <!-- 子导航 -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div style="display:flex;gap:4px">
              <el-button :type="bidSubTab==='items'?'primary':''" size="small" @click="bidSubTab='items'">招标项目</el-button>
              <el-button :type="bidSubTab==='stats'?'primary':''" size="small" @click="bidSubTab='stats'">招标统计</el-button>
              <el-button :type="bidSubTab==='settings'?'primary':''" size="small" @click="bidSubTab='settings'">采集设置</el-button>
            </div>
            <el-select v-if="bidSubTab==='items'" v-model="bidFilter" placeholder="筛选" clearable size="small" style="width:100px" @change="loadBidItems">
              <el-option label="全部" value=""/><el-option label="新招标" value="new"/><el-option label="已通知" value="notified"/><el-option label="已忽略" value="ignored"/>
            </el-select>
          </div>
          <div v-if="bidSubTab==='items'">
            <div class="tb">
              <el-button size="small" @click="handleExport('bid_items')">导出</el-button>
              <el-button size="small" @click="handleImport('bid_items')">导入</el-button>
            </div>
            <el-table v-loading="loadingBids" :data="bidItems" stripe border row-key="id" style="width:100%" size="small">
              <el-table-column type="index" label="#" width="45"/>
              <el-table-column prop="title" label="项目名称" min-width="220" show-overflow-tooltip>
                <template #default="{row}">
                  <a v-if="row.url" :href="row.url" target="_blank" style="color:#7c3aed;text-decoration:none" @click.stop>{{ row.title }}</a>
                  <span v-else>{{ row.title }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="region" label="区域" width="80"/>
              <el-table-column prop="source_name" label="来源" width="90"/>
              <el-table-column prop="bid_type" label="招标方式" width="100"/>
              <el-table-column prop="amount" label="预算(万)" width="100">
                <template #default="{row}"><span v-if="row.amount" style="font-weight:600;color:#e53e3e">{{ row.amount }}</span><span v-else>-</span></template>
              </el-table-column>
              <el-table-column prop="doc_deadline" label="截止时间" width="110"/>
              <el-table-column prop="purchase_requirements" label="采购需求" min-width="160" show-overflow-tooltip/>
              <el-table-column label="操作" width="180" fixed="right">
                <template #default="{row}">
                  <el-button size="small" type="primary" link @click="openDetail(row)">详情</el-button>
                  <el-button size="small" type="primary" link @click="openEditItem(row)">编辑</el-button>
                  <el-button size="small" type="danger" link @click="delBidItem(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div v-else-if="bidSubTab==='settings'">
            <!-- 采集线路 -->
            <div class="section-label">采集线路</div>
            <div class="route-cards">
              <div class="route-card">
                <div class="route-card-left">
                  <div class="route-card-name">🤖 Crawl4AI</div>
                  <div class="route-card-desc">MCP 协议 + Playwright 浏览器 + LLM 结构化提取</div>
                </div>
                <el-tag size="small" type="success">运行中</el-tag>
              </div>
              <div class="route-card">
                <div class="route-card-left">
                  <div class="route-card-name">🦞 Scrapling</div>
                  <div class="route-card-desc">Python 子进程 + DynamicFetcher (Playwright) + Regex 提取</div>
                </div>
                <el-tag size="small" type="success">运行中</el-tag>
              </div>
              <div class="route-card">
                <div class="route-card-left">
                  <div class="route-card-name">🔗 乙方宝</div>
                  <div class="route-card-desc">Playwright 持久化登录 + API 遍历关键词 + 详情页补字段</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <el-tag :type="wyloggedIn?'success':'warning'" size="small">{{ wyloggedIn?'已登录':'未登录' }}</el-tag>
                  <el-button size="small" type="primary" :loading="wyCollecting" :disabled="!wyloggedIn" @click="doWyCollect">采集</el-button>
                </div>
              </div>
              <div class="route-card" style="background:#fafafe">
                <div class="route-card-left">
                  <div class="route-card-name" style="font-size:13px">网页爬虫（Crawl4AI + Scrapling 共用来源/关键词）</div>
                </div>
                <el-button size="small" type="primary" :loading="webCollecting" @click="doWebCollect">采集</el-button>
              </div>
            </div>

            <!-- 采集网址 -->
            <div class="section-label" style="margin-top:20px">采集网址</div>
            <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">
              <span class="engine-hint">{{ bidSources.length }} 个采集来源，共用关键词 {{ bidKeywords.length }} 个</span>
              <el-button size="small" text type="primary" @click="srcDlg.visible=true">新增来源</el-button>
              <el-button size="small" text type="primary" @click="kwDlg.visible=true">新增关键词</el-button>
            </div>
            <el-table v-if="bidSources.length" :data="bidSources" stripe size="small" row-key="id">
              <el-table-column type="index" label="#" width="40"/>
              <el-table-column prop="name" label="名称" width="110"/>
              <el-table-column prop="url" label="网址" min-width="200" show-overflow-tooltip/>
              <el-table-column prop="source_type" label="类型" width="85">
                <template #default="{row}"><el-tag size="small">{{ row.source_type==='web'?'网页爬虫':row.source_type==='crawl4ai'?'Crawl4AI':row.source_type }}</el-tag></template>
              </el-table-column>
              <el-table-column label="启用" width="55">
                <template #default="{row}"><el-switch :model-value="!!row.enabled" @change="toggleSource(row,$event)" size="small"/></template>
              </el-table-column>
              <el-table-column label="操作" width="110">
                <template #default="{row}">
                  <el-button size="small" type="primary" link @click="openEditSource(row)">编辑</el-button>
                  <el-button size="small" type="danger" link @click="delSource(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无采集来源，点击上方「新增来源」添加" :image-size="36"/>
            <div style="margin-top:8px">
              <el-tag v-for="k in bidKeywords" :key="k.id" closable @close="delKeyword(k.id)" size="small" style="margin:2px">{{ k.keyword }}</el-tag>
              <span v-if="!bidKeywords.length" class="engine-hint">暂无关键词</span>
            </div>

            <!-- 乙方宝设置 -->
            <div class="section-label" style="margin-top:20px">乙方宝设置</div>
            <div class="engine-panel">
              <div class="engine-body">
                <div class="engine-row">
                  <span class="engine-label">登录</span>
                  <span v-if="wyloggedIn" class="engine-hint">登录态有效，过期后点击重新扫码</span>
                  <el-button v-else size="small" type="warning" :loading="wyLoggingIn" @click="doWoyaobidLogin">扫码登录</el-button>
                  <el-button v-if="wyloggedIn" size="small" text type="primary" :loading="wyLoggingIn" @click="doWoyaobidLogin">重新登录</el-button>
                </div>
                <div class="engine-row">
                  <span class="engine-label">选项</span>
                  <el-checkbox v-model="wyOpts.headless" size="small">后台运行</el-checkbox>
                  <el-checkbox v-model="wyOpts.noDetail" size="small">仅列表（跳过详情，更快）</el-checkbox>
                </div>
                <div class="engine-row">
                  <span class="engine-label">关键词</span>
                  <span class="engine-hint">{{ itKeywords.length + securityKeywords.length }} 个内置关键词（IT {{ itKeywords.length }} + 安全 {{ securityKeywords.length }}），编辑 config.py 修改</span>
                  <el-popover placement="bottom" :width="520" trigger="click">
                    <template #reference><el-button size="small" text type="primary">查看全部</el-button></template>
                    <div style="font-weight:600;font-size:13px;margin-bottom:6px">IT / 信息化（{{ itKeywords.length }}个）</div>
                    <el-tag v-for="k in itKeywords" :key="k" size="small" style="margin:2px" effect="plain">{{ k }}</el-tag>
                    <div style="font-weight:600;font-size:13px;margin:10px 0 6px">网络安全（{{ securityKeywords.length }}个）</div>
                    <el-tag v-for="k in securityKeywords" :key="k" size="small" style="margin:2px" type="success" effect="plain">{{ k }}</el-tag>
                  </el-popover>
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="bidSubTab==='stats'">
            <BidStatsTable embedded/>
          </div>
        </div>
      </div>
    </div>
    <!-- ===== CRM 弹窗 ===== -->
    <!-- 客户 -->
    <el-dialog v-model="cusDlg.visible" :title="cusDlg.ed?'编辑客户':'新增客户'" width="650px">
      <el-form :model="cusDlg.form" label-width="80px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="客户名称"><el-input v-model="cusDlg.form.name"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="联系电话"><el-input v-model="cusDlg.form.phone"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="所属单位"><el-input v-model="cusDlg.form.company"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="职务"><el-input v-model="cusDlg.form.position"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="性别"><el-select v-model="cusDlg.form.gender"><el-option label="男" value="男"/><el-option label="女" value="女"/></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="年龄"><el-input-number v-model="cusDlg.form.age" :min="1" :max="120"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="接触频次"><el-input v-model="cusDlg.form.contact_frequency" placeholder="如：每周"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="个人特征"><el-input v-model="cusDlg.form.traits" type="textarea" :rows="2"/></el-form-item>
        <el-form-item label="个人喜好"><el-input v-model="cusDlg.form.preferences" type="textarea" :rows="2"/></el-form-item>
        <el-form-item label="地址"><el-input v-model="cusDlg.form.address"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="cusDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCus">保存</el-button></template>
    </el-dialog>
    <!-- 联系人 -->
    <el-dialog v-model="ctDlg.visible" :title="`${ctDlg.cusName} 的联系人`" width="600px">
      <div class="tb" style="margin-bottom:12px"><el-button size="small" type="primary" @click="ctAddDlg.visible=true">新增联系人</el-button></div>
      <el-table :data="ctDlg.list" stripe border row-key="id" size="small">
        <el-table-column prop="name" label="姓名" width="100"/><el-table-column prop="position" label="职位" width="120"/>
        <el-table-column prop="phone" label="电话" width="140"/><el-table-column prop="email" label="邮箱" min-width="160"/>
        <el-table-column label="操作" width="80"><template #default="{row}"><el-button size="small" type="danger" link @click="delCt(row.id)">删除</el-button></template></el-table-column>
      </el-table>
      <el-empty v-if="ctDlg.list.length===0" description="暂无联系人"/>
    </el-dialog>
    <el-dialog v-model="ctAddDlg.visible" title="新增联系人" width="450px">
      <el-form :model="ctAddDlg.form" label-width="80px">
        <el-form-item label="姓名"><el-input v-model="ctAddDlg.form.name"/></el-form-item>
        <el-form-item label="职位"><el-input v-model="ctAddDlg.form.position"/></el-form-item>
        <el-form-item label="电话"><el-input v-model="ctAddDlg.form.phone"/></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="ctAddDlg.form.email"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="ctAddDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCt">保存</el-button></template>
    </el-dialog>
    <!-- 跟进 -->
    <el-dialog v-model="flwDlg.visible" title="跟进记录" width="600px">
      <el-timeline><el-timeline-item v-for="f in flwDlg.list" :key="f.id" :timestamp="f.created_at">{{f.content}}</el-timeline-item></el-timeline>
      <el-empty v-if="flwDlg.list.length===0" description="暂无跟进"/>
      <div style="display:flex;gap:8px;margin-top:12px"><el-input v-model="flwDlg.txt" placeholder="添加跟进内容"/><el-button type="primary" @click="addFlw">添加</el-button></div>
    </el-dialog>
    <!-- 商机 -->
    <el-dialog v-model="opDlg.visible" :title="opDlg.ed?'编辑商机':'新增商机'" width="650px">
      <el-form :model="opDlg.form" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="商机名称"><el-input v-model="opDlg.form.title"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="所属销售"><el-input v-model="opDlg.form.sales_owner"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="客户联系人"><el-input v-model="opDlg.form.contact_name"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="联系电话"><el-input v-model="opDlg.form.contact_phone"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="需求描述"><el-input v-model="opDlg.form.description" type="textarea" :rows="2"/></el-form-item>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="商机金额"><el-input-number v-model="opDlg.form.amount" :min="0" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="阶段"><el-select v-model="opDlg.form.stage"><el-option label="初步接触" value="contact"/><el-option label="需求确认" value="demo"/><el-option label="方案报价" value="proposal"/><el-option label="商务谈判" value="negotiation"/><el-option label="签约" value="closed"/></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="竞争情况"><el-input v-model="opDlg.form.competition"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="商机进展"><el-input v-model="opDlg.form.progress" type="textarea" :rows="2"/></el-form-item>
        <el-form-item label="下一步计划"><el-input v-model="opDlg.form.next_plan" type="textarea" :rows="2"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="opDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveOp">保存</el-button></template>
    </el-dialog>
    <!-- 合同 -->
    <el-dialog v-model="cnDlg.visible" :title="cnDlg.ed?'编辑合同':'新增合同'" width="700px" destroy-on-close>
      <el-form :model="cnDlg.form" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="合同名称"><el-input v-model="cnDlg.form.title"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="合同编号"><el-input v-model="cnDlg.form.contract_no"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="所属销售"><el-input v-model="cnDlg.form.sales_owner"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="客户联系人"><el-input v-model="cnDlg.form.contact_name"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="联系电话"><el-input v-model="cnDlg.form.contact_phone"/></el-form-item>
        <el-form-item label="合同内容"><el-input v-model="cnDlg.form.content" type="textarea" :rows="3" placeholder="产品/服务描述"/></el-form-item>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="合同金额"><el-input-number v-model="cnDlg.form.amount" :min="0" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="预付金额"><el-input-number v-model="cnDlg.form.prepaid_amount" :min="0" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="应收金额"><el-input-number v-model="cnDlg.form.receivable_amount" :min="0" style="width:100%"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="签订时间"><el-date-picker v-model="cnDlg.form.signed_date" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="质保期限"><el-input v-model="cnDlg.form.warranty_period" placeholder="如：2年"/></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="发票开具"><el-input v-model="cnDlg.form.invoice"/></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="交付进度"><el-input v-model="cnDlg.form.delivery_progress"/></el-form-item></el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="cnDlg.form.remark" type="textarea" :rows="2"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="cnDlg.visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCn">保存</el-button></template>
    </el-dialog>
    <!-- ===== 招投标弹窗 ===== -->
    <el-dialog v-model="srcDlg.visible" title="新增采集来源" width="500px"><el-form :model="srcDlg.form" label-width="100px"><el-form-item label="名称"><el-input v-model="srcDlg.form.name"/></el-form-item><el-form-item label="URL"><el-input v-model="srcDlg.form.url"/></el-form-item><el-form-item label="类型"><el-select v-model="srcDlg.form.source_type"><el-option label="网页爬虫 (Crawl4AI)" value="web"/><el-option label="Crawl4AI MCP" value="crawl4ai"/></el-select></el-form-item><el-form-item label="采集间隔(分钟)"><el-input-number v-model="srcDlg.form.interval_minutes" :min="60" :max="1440"/></el-form-item></el-form><template #footer><el-button @click="srcDlg.visible=false">取消</el-button><el-button type="primary" @click="saveSource">保存</el-button></template></el-dialog>
    <el-dialog v-model="srcEditDlg.visible" title="编辑采集来源" width="500px"><el-form :model="srcEditDlg.form" label-width="100px"><el-form-item label="名称"><el-input v-model="srcEditDlg.form.name"/></el-form-item><el-form-item label="URL"><el-input v-model="srcEditDlg.form.url"/></el-form-item><el-form-item label="类型"><el-select v-model="srcEditDlg.form.source_type"><el-option label="网页爬虫 (Crawl4AI)" value="web"/><el-option label="Crawl4AI MCP" value="crawl4ai"/></el-select></el-form-item><el-form-item label="采集间隔(分钟)"><el-input-number v-model="srcEditDlg.form.interval_minutes" :min="60" :max="1440"/></el-form-item><el-form-item label="状态"><el-switch v-model="srcEditDlg.form.enabled" active-text="启用" inactive-text="停用" :active-value="1" :inactive-value="0"/></el-form-item></el-form><template #footer><el-button @click="srcEditDlg.visible=false">取消</el-button><el-button type="primary" @click="saveEditSource">保存</el-button></template></el-dialog>
    <el-dialog v-model="kwDlg.visible" title="新增关键词" width="400px"><el-form :model="kwDlg.form" label-width="80px"><el-form-item label="关键词"><el-input v-model="kwDlg.form.keyword"/></el-form-item></el-form><template #footer><el-button @click="kwDlg.visible=false">取消</el-button><el-button type="primary" @click="saveKeyword">保存</el-button></template></el-dialog>
    <!-- 编辑招标项目 -->
    <el-dialog v-model="editDlg.visible" title="编辑招标项目" width="650px"><el-form :model="editDlg.form" label-width="100px">
      <el-form-item label="项目名称"><el-input v-model="editDlg.form.title"/></el-form-item>
      <el-row :gutter="12">
        <el-col :span="8"><el-form-item label="项目编号"><el-input v-model="editDlg.form.project_no"/></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="项目预算(万)"><el-input-number v-model="editDlg.form.amount" :min="0" :precision="2" style="width:100%"/></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="招标方式"><el-select v-model="editDlg.form.bid_type"><el-option label="公开招标" value="公开招标"/><el-option label="邀请招标" value="邀请招标"/><el-option label="竞争性谈判" value="竞争性谈判"/><el-option label="询价" value="询价"/><el-option label="单一来源" value="单一来源"/></el-select></el-form-item></el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12"><el-form-item label="报名截止时间"><el-date-picker v-model="editDlg.form.doc_deadline" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="投标时间"><el-date-picker v-model="editDlg.form.bid_time" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item></el-col>
      </el-row>
      <el-form-item label="采购需求"><el-input v-model="editDlg.form.purchase_requirements" type="textarea" :rows="3" placeholder="采购内容/技术要求"/></el-form-item>
      <el-row :gutter="12">
        <el-col :span="12"><el-form-item label="评标办法"><el-input v-model="editDlg.form.evaluation" placeholder="如：综合评分法"/></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="网址"><el-input v-model="editDlg.form.url"/></el-form-item></el-col>
      </el-row>
    </el-form><template #footer><el-button @click="editDlg.visible=false">取消</el-button><el-button type="primary" @click="saveEditItem">保存</el-button></template></el-dialog>
    <!-- 项目详情 -->
    <el-dialog v-model="detailDlg.visible" title="招标项目详情" width="700px">
      <el-descriptions v-if="detailDlg.row" :column="2" border size="small">
        <el-descriptions-item label="项目名称" :span="2">{{ detailDlg.row.title }}</el-descriptions-item>
        <el-descriptions-item label="项目编号">{{ detailDlg.row.project_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="项目预算">{{ detailDlg.row.amount ? detailDlg.row.amount + '万元' : '-' }}</el-descriptions-item>
        <el-descriptions-item label="招标方式">{{ detailDlg.row.bid_type || '-' }}</el-descriptions-item>
        <el-descriptions-item label="区域">{{ detailDlg.row.region || '-' }}</el-descriptions-item>
        <el-descriptions-item label="报名截止时间">{{ detailDlg.row.doc_deadline || '-' }}</el-descriptions-item>
        <el-descriptions-item label="投标时间">{{ detailDlg.row.bid_time || '-' }}</el-descriptions-item>
        <el-descriptions-item label="投标方式">{{ detailDlg.row.submit_type || '-' }}</el-descriptions-item>
        <el-descriptions-item label="采购需求" :span="2">{{ detailDlg.row.purchase_requirements || '-' }}</el-descriptions-item>
        <el-descriptions-item label="评标办法">{{ detailDlg.row.evaluation || '-' }}</el-descriptions-item>
        <el-descriptions-item label="采集来源">{{ detailDlg.row.source_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="detailDlg.row.status==='new'?'danger':detailDlg.row.status==='notified'?'success':'info'" size="small">{{ detailDlg.row.status==='new'?'新招标':detailDlg.row.status==='notified'?'已通知':'已忽略' }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="网址" :span="2"><a v-if="detailDlg.row.url" :href="detailDlg.row.url" target="_blank" style="color:#7c3aed">{{ detailDlg.row.url }}</a><span v-else>-</span></el-descriptions-item>
      </el-descriptions>
      <template #footer><el-button @click="detailDlg.visible=false">关闭</el-button></template>
    </el-dialog>
    <ImportDialog v-model="importVisible" :ioKey="importKey" @done="onImportDone" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../api/index.js'
import { customerApi, contactApi, opportunityApi, contractApi } from '../../api/crm'
import ImportDialog from '../../components/ImportDialog.vue'
import BidStatsTable from './BidStatsTable.vue'
import { downloadFile } from '../../utils/download'
const router = useRouter()

const tab = ref('crm')
const crmTab = ref('customers')
const bidSubTab = ref('items')
const bidFilter = ref('')

function handleTabSelect(t) { tab.value = t }

// ─── CRM 数据 ───
const customers = ref([]), opportunities = ref([]), contracts = ref([])
const loadingCrm = ref(false)
const saving = ref(false)

// ─── 招投标数据 ───
const bidItems = ref([]), bidSources = ref([]), bidKeywords = ref([])
const loadingBids = ref(false)

// ─── KPI ───
const kpis = computed(() => {
  if (tab.value === 'crm') return [
    { val: customers.value.length, label: '客户总数' },
    { val: opportunities.value.filter(o => o.stage !== 'closed').length, label: '进行中机会' },
    { val: contracts.value.length, label: '合同总数' }
  ]
  return [
    { val: bidItems.value.filter(i=>i.status==='new').length, label: '新招标' },
    { val: bidSources.value.length, label: '采集源' }
  ]
})

// ─── CRM 客户 ───
const cusDlg = reactive({ visible: false, ed: false, form: {} })
function openCusDlg(r) { cusDlg.ed = !!r; cusDlg.form = r ? { ...r } : {}; cusDlg.visible = true }
async function saveCus() {
  saving.value = true
  const f = cusDlg.form
  cusDlg.ed ? await customerApi.update(f.id, f) : await customerApi.create(f)
  cusDlg.visible = false
  await loadCrm()
  saving.value = false
  ElMessage.success('OK')
}
async function delCus(id) { await ElMessageBox.confirm('确认删除?'); await customerApi.remove(id); await loadCrm() }

// ─── CRM 联系人 ───
const ctDlg = reactive({ visible: false, cid: '', cusName: '', list: [] })
const ctAddDlg = reactive({ visible: false, form: {} })
async function openContacts(r) {
  ctDlg.cid = r.id; ctDlg.cusName = r.name
  const res = await contactApi.list(r.id); ctDlg.list = res.data.data || []
  ctDlg.visible = true
}
async function saveCt() {
  await contactApi.create({ ...ctAddDlg.form, customer_id: ctDlg.cid })
  ctAddDlg.visible = false; ctAddDlg.form = {}
  const res = await contactApi.list(ctDlg.cid); ctDlg.list = res.data.data || []
  ElMessage.success('OK')
}
async function delCt(id) { await contactApi.remove(id); const res = await contactApi.list(ctDlg.cid); ctDlg.list = res.data.data || [] }

// ─── CRM 跟进 ───
const flwDlg = reactive({ visible: false, list: [], cid: '', txt: '' })
async function openFollow(r) {
  flwDlg.cid = r.id
  const res = await customerApi.followUps(r.id); flwDlg.list = res.data.data || []
  flwDlg.txt = ''; flwDlg.visible = true
}
async function addFlw() {
  if (!flwDlg.txt) return
  await customerApi.addFollowUp(flwDlg.cid, { content: flwDlg.txt })
  flwDlg.txt = ''
  const res = await customerApi.followUps(flwDlg.cid); flwDlg.list = res.data.data || []
  ElMessage.success('已添加')
}

// ─── CRM 机会 ───
const opDlg = reactive({ visible: false, ed: false, editId: '', form: {} })
const stageMap = { contact: '初步接触', demo: '需求确认', proposal: '方案报价', negotiation: '商务谈判', closed: '签约' }
function stageLabel(s) { return stageMap[s] || s }
function stageType(s) { return s === 'closed' ? 'success' : s === 'negotiation' ? 'warning' : 'info' }
function openOpDlg(r) { opDlg.ed = !!r; opDlg.editId = r?.id || ''; Object.keys(opDlg.form).forEach(k=>delete opDlg.form[k]); if(r) Object.assign(opDlg.form, r); opDlg.visible = true }
async function saveOp() {
  saving.value = true
  opDlg.ed ? await opportunityApi.update(opDlg.editId, opDlg.form) : await opportunityApi.create(opDlg.form)
  opDlg.visible = false; opDlg.form = {}
  await loadCrm(); saving.value = false
  ElMessage.success('OK')
}
async function delOp(id) { try { await ElMessageBox.confirm('确认删除?'); await opportunityApi.remove(id); await loadCrm() } catch {} }

// ─── CRM 合同 ───
const cnDlg = reactive({ visible: false, ed: false, editId: '', form: {} })
function openCnDlg(r) { cnDlg.ed = !!r; cnDlg.editId = r?.id || ''; Object.keys(cnDlg.form).forEach(k=>delete cnDlg.form[k]); if(r) Object.assign(cnDlg.form, r); cnDlg.visible = true }
async function saveCn() {
  saving.value = true
  cnDlg.ed ? await contractApi.update(cnDlg.editId, cnDlg.form) : await contractApi.create(cnDlg.form)
  cnDlg.visible = false; cnDlg.form = {}
  await loadCrm(); saving.value = false
  ElMessage.success('OK')
}
async function delCn(id) { try { await ElMessageBox.confirm('确认删除?'); await contractApi.remove(id); await loadCrm() } catch {} }

function fmtMoney(r,c,v) { if (v==null||v===0) return ''; return '¥'+Number(v).toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:2}) }

// ─── CRM 导入导出 ───
const importVisible = ref(false), importKey = ref('')
function handleImport(key) { importKey.value = key; importVisible.value = true }
function handleExport(key) {
  const token = localStorage.getItem('token')
  downloadFile(`/api/io/${key}/export?token=${encodeURIComponent(token)}`, '导出失败')
}
function onImportDone() { loadCrm(); loadBidData() }

// ─── 招投标 ───
const srcDlg = reactive({ visible: false, form: {} })
const kwDlg = reactive({ visible: false, form: {} })
const editDlg = reactive({ visible: false, form: {} })
const srcEditDlg = reactive({ visible: false, form: {} })
const wyOpts = reactive({ headless: true, noDetail: false })
const wyloggedIn = ref(false)
const wyLoggingIn = ref(false)
const newBidCount = computed(() => bidItems.value.filter(i => i.status === 'new').length)
const itKeywords = ['电脑', '计算机', '打印机', '办公设备', '复印机', '信息化', '信息系统', '软件开发', '系统集成', '软件', '视频监控', '安防', '监控', '门禁', '一卡通', '网络设备', '综合布线', '通信设备', '交换机', '路由器', '大屏', 'LED', '显示屏', '会议系统', '音响', '数据中心', '机房', '机房建设', '服务器', '存储', '云平台', '智慧', '数字化', '智能化', '教学设备', '多媒体', '录播', '弱电', 'UPS', '运维', '技术服务', '数据库']
const securityKeywords = ['网络安全', '信息安全', '数据安全', '等级保护', '等保测评', '防火墙', '入侵检测', '漏洞扫描', '安全服务', '安全审计', '安全运维', '安全防护', '应急响应', '安全管理', '身份认证', '堡垒机', '态势感知']
const wyCollecting = ref(false)
const webCollecting = ref(false)
const detailDlg = reactive({ visible: false, row: null })

async function loadBidItems() {
  const p = bidFilter.value ? { params: { status: bidFilter.value } } : {}
  bidItems.value = (await request.get('/bids/items', p)).data.data
}
async function loadBidSources() { bidSources.value = (await request.get('/bids/sources')).data.data }
async function loadBidKeywords() { bidKeywords.value = (await request.get('/bids/keywords')).data.data }
async function doWyCollect() {
  wyCollecting.value = true
  try {
    const res = await request.post('/bid-statistics/collect', { method: 'woyaobid', headless: wyOpts.headless, noDetail: wyOpts.noDetail })
    if (res.data.data?.needsLogin) { ElMessage({ message: res.data.data.message, type: 'info', duration: 8000 }); return }
    ElMessage.success(`乙方宝采集完成，新增 ${res.data.data?.inserted || 0} 条`)
    await loadBidData()
  } catch (e) { ElMessage.error('采集失败: ' + (e.response?.data?.message || e.message)) }
  wyCollecting.value = false
}

async function doWebCollect() {
  webCollecting.value = true
  try {
    const res = await request.post('/bid-statistics/collect', { method: 'web' })
    ElMessage.success(`网页爬虫采集完成，新增 ${res.data.data?.inserted || 0} 条`)
    await loadBidData()
  } catch (e) { ElMessage.error('采集失败: ' + (e.response?.data?.message || e.message)) }
  webCollecting.value = false
}
async function saveSource() { await request.post('/bids/sources', srcDlg.form); srcDlg.visible = false; srcDlg.form = {}; await loadBidData(); ElMessage.success('OK') }
function openEditSource(row) { srcEditDlg.form = { ...row }; srcEditDlg.visible = true }
async function toggleSource(row, val) { await request.put('/bids/sources/'+row.id, { enabled: val ? 1 : 0 }); await loadBidData() }
async function saveEditSource() { await request.put('/bids/sources/'+srcEditDlg.form.id, srcEditDlg.form); srcEditDlg.visible = false; await loadBidData(); ElMessage.success('OK') }
async function delSource(id) { await ElMessageBox.confirm('确认?'); await request.delete('/bids/sources/'+id); await loadBidData() }
async function saveKeyword() { try { await request.post('/bids/keywords', kwDlg.form); kwDlg.visible = false; kwDlg.form = {}; await loadBidData(); ElMessage.success('OK') } catch { ElMessage.error('关键词已存在') } }
async function delKeyword(id) { await request.delete('/bids/keywords/'+id); await loadBidData() }
function openDetail(row) { detailDlg.row = row; detailDlg.visible = true }
function openEditItem(row) { editDlg.form = { ...row }; editDlg.visible = true }
async function saveEditItem() { await request.put('/bids/items/'+editDlg.form.id, editDlg.form); editDlg.visible = false; await loadBidData(); ElMessage.success('OK') }
async function delBidItem(id) { await ElMessageBox.confirm('确认?'); await request.delete('/bids/items/'+id); await loadBidData() }
// ─── 数据加载 ───
async function loadCrm() {
  loadingCrm.value = true
  try { customers.value = (await customerApi.list()).data.data } catch {}
  try { opportunities.value = (await opportunityApi.list()).data.data } catch {}
  try { contracts.value = (await contractApi.list()).data.data } catch {}
  loadingCrm.value = false
}
async function loadBidData() {
  loadingBids.value = true
  await loadBidItems(); await loadBidSources(); await loadBidKeywords()
  loadingBids.value = false
}
async function checkWoyaobidStatus() {
  try {
    const res = await request.get('/bid-agent/woyaobid-status')
    wyloggedIn.value = res.data.data?.logged_in || false
  } catch {}
}
async function doWoyaobidLogin() {
  wyLoggingIn.value = true
  try {
    const res = await request.post('/bid-agent/woyaobid-login')
    if (res.data.data?.success) {
      wyloggedIn.value = true
      ElMessage.success('乙方宝登录成功')
    } else {
      ElMessage.error(res.data.data?.message || '登录失败，请检查浏览器窗口扫码')
    }
  } catch (e) {
    ElMessage.error('登录失败: ' + (e.response?.data?.message || e.message))
  }
  wyLoggingIn.value = false
}
async function refresh() { await loadCrm(); await loadBidData(); checkWoyaobidStatus() }
onMounted(refresh)
</script>

<style scoped>
.pg { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.pg-hd { padding: 20px 24px 0; background: #fff; border-bottom: 1px solid #f0ecfc; }
.pg-title { font-size: 20px; font-weight: 600; color: #4a3f5e; margin-bottom: 12px; }
.kpi-row { display: flex; gap: 16px; margin-bottom: 16px; }
.kpi { padding: 10px 20px; background: #f8f7ff; border-radius: 10px; text-align: center; min-width: 100px; }
.kpi-val { font-size: 22px; font-weight: 700; color: #7c3aed; }
.kpi-lbl { font-size: 12px; color: #b8aad0; margin-top: 2px; }
.pg-body { flex: 1; display: flex; overflow: hidden; }
.side-tabs { width: 140px; flex-shrink: 0; border-right: 1px solid #f0ecfc; padding-top: 4px; }
.side-tabs .el-menu-item { height: 40px; line-height: 40px; font-size: 13px; }
.tab-content { flex: 1; padding: 16px 24px; overflow-y: auto; }
.tb { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
.bid-dash { display: flex; gap: 12px; margin-bottom: 16px; }
.bid-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #fff; border: 1px solid #f0ecfc; border-radius: 10px; flex: 1; min-width: 0; }
.bid-card-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.bid-card-info { min-width: 0; }
.bid-card-label { font-size: 12px; color: #b8aad0; }
.bid-card-val { font-size: 14px; font-weight: 600; color: #4a3f5e; white-space: nowrap; }
.engine-panel { background: #fff; border: 1px solid #f0ecfc; border-radius: 10px; overflow: hidden; }
.engine-hd { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: #fafafe; border-bottom: 1px solid #f0ecfc; }
.engine-title { display: flex; align-items: center; font-size: 15px; font-weight: 600; color: #4a3f5e; }
.engine-icon { font-size: 18px; margin-right: 8px; }
.engine-body { padding: 14px 16px; }
.engine-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.engine-row:last-child { margin-bottom: 0; }
.engine-label { font-size: 13px; font-weight: 500; color: #7c3aed; min-width: 56px; flex-shrink: 0; }
.engine-hint { font-size: 12px; color: #b8aad0; }
.section-label { font-size: 14px; font-weight: 600; color: #4a3f5e; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #f0ecfc; }
.route-cards { display: flex; flex-direction: column; gap: 8px; }
.route-card { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #fff; border: 1px solid #f0ecfc; border-radius: 8px; }
.route-card-left { flex: 1; min-width: 0; }
.route-card-name { font-size: 14px; font-weight: 600; color: #4a3f5e; }
.route-card-desc { font-size: 12px; color: #b8aad0; margin-top: 2px; }
</style>
