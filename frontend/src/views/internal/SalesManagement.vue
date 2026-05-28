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
        <el-menu-item index="content">内容发布</el-menu-item>
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
            <div class="tb"><el-button type="primary" @click="opDlg.visible=true">新增商机</el-button><el-button @click="handleExport('opportunities')">导出</el-button><el-button @click="handleImport('opportunities')">导入</el-button></div>
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
              <el-table-column label="操作" width="80"><template #default="{r}"><el-button size="small" type="danger" link @click="delOp(r.id)">删除</el-button></template></el-table-column>
            </el-table>
          </div>
          <!-- 合同订单 -->
          <div v-else-if="crmTab==='contracts'">
            <div class="tb"><el-button type="primary" @click="cnDlg.visible=true">新增合同</el-button><el-button @click="handleExport('contracts')">导出</el-button><el-button @click="handleImport('contracts')">导入</el-button></div>
            <el-empty v-if="!loadingCrm&&contracts.length===0" description="暂无合同"/>
            <el-table v-loading="loadingCrm" :data="contracts" stripe border row-key="id" style="width:100%">
              <el-table-column type="index" label="#" width="50"/>
              <el-table-column prop="title" label="合同名称" width="160"/>
              <el-table-column prop="contract_no" label="合同编号" width="130"/>
              <el-table-column prop="sales_owner" label="所属销售" width="100"/>
              <el-table-column prop="contact_name" label="客户联系人" width="110"/>
              <el-table-column prop="amount" label="合同金额" width="100"/>
              <el-table-column prop="signed_date" label="签订时间" width="110"/>
              <el-table-column prop="delivery_progress" label="交付进度" width="100"/>
              <el-table-column label="操作" width="80"><template #default="{r}"><el-button size="small" type="danger" link @click="delCn(r.id)">删除</el-button></template></el-table-column>
            </el-table>
          </div>
        </div>
        <!-- ===== 招投标采集 ===== -->
        <div v-else-if="tab==='bids'">
          <el-tabs v-model="bidTab" type="card" style="margin-bottom:12px">
            <el-tab-pane label="招标项目" name="items"></el-tab-pane>
            <el-tab-pane label="采集来源" name="sources"></el-tab-pane>
            <el-tab-pane label="关键词" name="keywords"></el-tab-pane>
          </el-tabs>
          <div v-if="bidTab==='items'">
            <div class="tb">
              <el-button type="primary" @click="collectDlg.visible=true">手动采集</el-button>
              <el-select v-model="bidFilter" placeholder="筛选状态" clearable style="width:120px;margin-left:8px" @change="loadBidItems">
                <el-option label="全部" value=""/><el-option label="新招标" value="new"/><el-option label="已通知" value="notified"/><el-option label="已忽略" value="ignored"/>
              </el-select>
              <el-button @click="handleExport('bid_items')">导出</el-button><el-button @click="handleImport('bid_items')">导入</el-button>
            </div>
            <el-table v-loading="loadingBids" :data="bidItems" stripe border row-key="id" style="width:100%">
              <el-table-column type="index" label="#" width="45"/>
              <el-table-column prop="title" label="项目名称" min-width="200" show-overflow-tooltip/>
              <el-table-column prop="project_no" label="项目编号" width="140"/>
              <el-table-column prop="amount" label="项目预算" width="100">
                <template #default="{row}"><span v-if="row.amount" style="font-weight:600;color:#e53e3e">{{ row.amount }}万</span><span v-else>-</span></template>
              </el-table-column>
              <el-table-column prop="bid_type" label="招标方式" width="110"/>
              <el-table-column prop="doc_deadline" label="报名截止时间" width="120"/>
              <el-table-column prop="purchase_requirements" label="采购需求" min-width="160" show-overflow-tooltip/>
              <el-table-column label="操作" width="200" fixed="right">
                <template #default="{row}">
                  <el-button size="small" type="primary" link @click="openDetail(row)">详情</el-button>
                  <el-button size="small" type="primary" link @click="openEditItem(row)">编辑</el-button>
                  <el-button size="small" type="danger" link @click="delBidItem(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div v-else-if="bidTab==='sources'">
            <div class="tb"><el-button type="primary" @click="srcDlg.visible=true">新增来源</el-button><el-button @click="handleExport('bid_sources')">导出</el-button><el-button @click="handleImport('bid_sources')">导入</el-button></div>
            <el-table :data="bidSources" stripe border row-key="id">
              <el-table-column type="index" label="序号" width="55"/>
              <el-table-column prop="name" label="名称" width="140"/>
              <el-table-column prop="url" label="网址" min-width="200" show-overflow-tooltip/>
              <el-table-column prop="source_type" label="类型" width="80"><template #default="{row}"><el-tag :type="row.source_type==='api'?'':'warning'" size="small">{{ row.source_type==='api'?'API':'网页' }}</el-tag></template></el-table-column>
              <el-table-column prop="interval_minutes" label="采集间隔(分)" width="100"/>
              <el-table-column prop="enabled" label="状态" width="70"><template #default="{row}"><el-switch :model-value="!!row.enabled" @change="toggleSource(row,$event)" size="small"/></template></el-table-column>
              <el-table-column label="操作" width="120"><template #default="{row}"><el-button size="small" type="primary" link @click="openEditSource(row)">编辑</el-button><el-button size="small" type="danger" link @click="delSource(row.id)">删除</el-button></template></el-table-column>
            </el-table>
          </div>
          <div v-else-if="bidTab==='keywords'">
            <div class="tb"><el-button type="primary" @click="kwDlg.visible=true">新增关键词</el-button><el-button @click="handleExport('bid_keywords')">导出</el-button><el-button @click="handleImport('bid_keywords')">导入</el-button></div>
            <el-tag v-for="k in bidKeywords" :key="k.id" closable @close="delKeyword(k.id)" style="margin:4px">{{ k.keyword }}</el-tag>
            <el-empty v-if="bidKeywords.length===0" description="暂无关键词"/>
          </div>
        </div>
        <!-- ===== 内容发布 ===== -->
        <div v-else-if="tab==='content'">
          <div class="tb"><el-button type="primary" @click="pubDlg.visible=true">新建发布计划</el-button><el-button @click="handleExport('content_publish')">导出</el-button><el-button @click="handleImport('content_publish')">导入</el-button></div>
          <el-table v-loading="loadingBids" :data="pubTasks" stripe border row-key="id">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="platform" label="平台" width="100"/>
            <el-table-column prop="content_type" label="类型" width="80"/>
            <el-table-column prop="content" label="内容" min-width="200"/>
            <el-table-column prop="scheduled_at" label="计划时间" width="160"/>
            <el-table-column prop="status" label="状态" width="80"/>
            <el-table-column label="操作" width="80"><template #default="{row}"><el-button size="small" type="danger" link @click="delPub(row.id)">删除</el-button></template></el-table-column>
          </el-table>
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
        <el-table-column label="操作" width="80"><template #default="{r}"><el-button size="small" type="danger" link @click="delCt(r.id)">删除</el-button></template></el-table-column>
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
    <el-dialog v-model="opDlg.visible" title="新增商机" width="650px">
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
    <el-dialog v-model="cnDlg.visible" title="新增合同" width="700px">
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
    <el-dialog v-model="srcDlg.visible" title="新增采集来源" width="500px"><el-form :model="srcDlg.form" label-width="100px"><el-form-item label="名称"><el-input v-model="srcDlg.form.name"/></el-form-item><el-form-item label="URL"><el-input v-model="srcDlg.form.url"/></el-form-item><el-form-item label="类型"><el-select v-model="srcDlg.form.source_type"><el-option label="API 接口" value="api"/><el-option label="网页爬虫" value="web"/></el-select></el-form-item><el-form-item label="采集间隔(分钟)"><el-input-number v-model="srcDlg.form.interval_minutes" :min="60" :max="1440"/></el-form-item></el-form><template #footer><el-button @click="srcDlg.visible=false">取消</el-button><el-button type="primary" @click="saveSource">保存</el-button></template></el-dialog>
    <el-dialog v-model="srcEditDlg.visible" title="编辑采集来源" width="500px"><el-form :model="srcEditDlg.form" label-width="100px"><el-form-item label="名称"><el-input v-model="srcEditDlg.form.name"/></el-form-item><el-form-item label="URL"><el-input v-model="srcEditDlg.form.url"/></el-form-item><el-form-item label="类型"><el-select v-model="srcEditDlg.form.source_type"><el-option label="API 接口" value="api"/><el-option label="网页爬虫" value="web"/></el-select></el-form-item><el-form-item label="采集间隔(分钟)"><el-input-number v-model="srcEditDlg.form.interval_minutes" :min="60" :max="1440"/></el-form-item><el-form-item label="状态"><el-switch v-model="srcEditDlg.form.enabled" active-text="启用" inactive-text="停用" :active-value="1" :inactive-value="0"/></el-form-item></el-form><template #footer><el-button @click="srcEditDlg.visible=false">取消</el-button><el-button type="primary" @click="saveEditSource">保存</el-button></template></el-dialog>
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
    <!-- 手动采集 -->
    <el-dialog v-model="collectDlg.visible" title="手动采集" width="550px">
      <el-form :model="collectDlg" label-width="80px">
        <el-form-item label="采集线路">
          <el-select v-model="collectDlg.method" style="width:100%" @change="onCollectMethodChange">
            <el-option label="API 采集 (ShowAPI)" value="api"/>
            <el-option label="网页爬虫 (Playwright)" value="web"/>
            <el-option label="浏览器自动化 (扫码登录)" value="browser"/>
            <el-option label="全部线路" value="all"/>
          </el-select>
        </el-form-item>
        <template v-if="collectDlg.method==='browser'">
          <el-form-item label="目标网址">
            <el-input v-model="collectDlg.browserUrl" placeholder="https://qiye.qianlima.com"/>
          </el-form-item>
          <!-- Browser status -->
          <div v-if="browserState" style="margin-bottom:12px">
            <el-alert
              :title="browserState.message || browserState.state"
              :type="browserState.state==='error'?'error':browserState.state==='done'?'success':'info'"
              :closable="false"
              show-icon
            >
              <template v-if="browserState.collected>0"><div style="margin-top:4px">已采集 <b>{{ browserState.collected }}</b> 条</div></template>
            </el-alert>
          </div>
          <el-form-item v-if="browserState?.state==='waiting_login'">
            <el-button type="primary" @click="confirmBrowserLogin" :loading="browserConfirming">我已登录，开始搜索</el-button>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="开始日期"><el-date-picker v-model="collectDlg.start" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item>
          <el-form-item label="结束日期"><el-date-picker v-model="collectDlg.end" type="date" value-format="YYYY-MM-DD" style="width:100%"/></el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="onCloseCollect">取消</el-button>
        <el-button v-if="collectDlg.method==='browser'&&!browserState" type="primary" :loading="browserStarting" @click="startBrowserCollect">启动浏览器</el-button>
        <el-button v-if="collectDlg.method==='browser'&&(browserState?.state==='done'||browserState?.state==='error')" type="primary" @click="onCloseCollect">关闭</el-button>
        <el-button v-if="collectDlg.method!=='browser'" type="primary" @click="doCollect">开始采集</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="pubDlg.visible" title="新建发布计划" width="500px"><el-form :model="pubDlg.form" label-width="80px"><el-form-item label="平台"><el-select v-model="pubDlg.form.platform"><el-option label="微信" value="wechat"/><el-option label="抖音" value="douyin"/><el-option label="小红书" value="xiaohongshu"/></el-select></el-form-item><el-form-item label="类型"><el-select v-model="pubDlg.form.content_type"><el-option label="图文" value="text"/><el-option label="视频" value="video"/></el-select></el-form-item><el-form-item label="内容"><el-input v-model="pubDlg.form.content" type="textarea"/></el-form-item><el-form-item label="计划时间"><el-date-picker v-model="pubDlg.form.scheduled_at" type="datetime" value-format="YYYY-MM-DD HH:mm" style="width:100%"/></el-form-item></el-form><template #footer><el-button @click="pubDlg.visible=false">取消</el-button><el-button type="primary" @click="savePub">保存</el-button></template></el-dialog>
    <ImportDialog v-model="importVisible" :ioKey="importKey" @done="onImportDone" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import { customerApi, contactApi, opportunityApi, contractApi } from '../../api/crm'
import ImportDialog from '../../components/ImportDialog.vue'
const req = axios.create({ baseURL: '/api' })
const router = useRouter()

const tab = ref('crm')
const crmTab = ref('customers')
const bidTab = ref('items')
const bidFilter = ref('')

function handleTabSelect(t) { tab.value = t }

// ─── CRM 数据 ───
const customers = ref([]), opportunities = ref([]), contracts = ref([])
const loadingCrm = ref(false)
const saving = ref(false)

// ─── 招投标数据 ───
const bidItems = ref([]), bidSources = ref([]), bidKeywords = ref([])
const pubTasks = ref([])
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
    { val: bidSources.value.length, label: '采集源' },
    { val: pubTasks.value.filter(t=>t.status==='scheduled').length, label: '待发布' }
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
const opDlg = reactive({ visible: false, form: {} })
const stageMap = { contact: '初步接触', demo: '需求确认', proposal: '方案报价', negotiation: '商务谈判', closed: '签约' }
function stageLabel(s) { return stageMap[s] || s }
function stageType(s) { return s === 'closed' ? 'success' : s === 'negotiation' ? 'warning' : 'info' }
async function saveOp() { await opportunityApi.create(opDlg.form); opDlg.visible = false; opDlg.form = {}; await loadCrm(); ElMessage.success('OK') }
async function delOp(id) { await opportunityApi.remove(id); await loadCrm() }

// ─── CRM 合同 ───
const cnDlg = reactive({ visible: false, form: {} })
async function saveCn() { await contractApi.create(cnDlg.form); cnDlg.visible = false; cnDlg.form = {}; await loadCrm(); ElMessage.success('OK') }
async function delCn(id) { await contractApi.remove(id); await loadCrm() }

// ─── CRM 导入导出 ───
const importVisible = ref(false), importKey = ref('')
function handleImport(key) { importKey.value = key; importVisible.value = true }
function handleExport(key) { window.open(`/api/io/${key}/export`) }
function onImportDone() { loadCrm(); loadBidData() }

// ─── 招投标 ───
const srcDlg = reactive({ visible: false, form: {} })
const kwDlg = reactive({ visible: false, form: {} })
const pubDlg = reactive({ visible: false, form: {} })
const editDlg = reactive({ visible: false, form: {} })
const srcEditDlg = reactive({ visible: false, form: {} })
const collectDlg = reactive({ visible: false, method: 'api', start: '', end: '', browserUrl: 'https://qiye.qianlima.com' })
const browserState = ref(null), browserStarting = ref(false), browserConfirming = ref(false), browserPollTimer = ref(null)
const detailDlg = reactive({ visible: false, row: null })

async function loadBidItems() {
  const p = bidFilter.value ? { params: { status: bidFilter.value } } : {}
  bidItems.value = (await req.get('/bids/items', p)).data.data
}
async function loadBidSources() { bidSources.value = (await req.get('/bids/sources')).data.data }
async function loadBidKeywords() { bidKeywords.value = (await req.get('/bids/keywords')).data.data }
async function loadPubTasks() { pubTasks.value = (await req.get('/content-publish')).data.data }
async function doCollect() {
  const methodLabel = collectDlg.method === 'api' ? 'API' : collectDlg.method === 'web' ? '网页爬虫' : collectDlg.method === 'all' ? '全部线路' : '采集'
  await req.post('/bids/collect', { method: collectDlg.method, start: collectDlg.start, end: collectDlg.end })
  collectDlg.visible = false; collectDlg.start = ''; collectDlg.end = ''; collectDlg.method = 'api'
  ElMessage.success(`${methodLabel} 采集完成`); await loadBidData()
}

// ─── 浏览器自动化采集 ───
function onCollectMethodChange(method) {
  if (method === 'browser') { browserState.value = null; stopPolling() }
}
async function startBrowserCollect() {
  browserStarting.value = true
  try {
    const res = await req.post('/bids/browser/start', { url: collectDlg.browserUrl })
    browserState.value = res.data.data
    if (res.data.data.state !== 'error') startPolling()
  } catch (e) { ElMessage.error(e.response?.data?.message || '启动失败') }
  browserStarting.value = false
}
async function confirmBrowserLogin() {
  browserConfirming.value = true
  try {
    const res = await req.post('/bids/browser/confirm-login')
    browserState.value = res.data.data
    if (res.data.data.state === 'done') { stopPolling(); await loadBidData() }
  } catch (e) { ElMessage.error(e.response?.data?.message || '搜索失败') }
  browserConfirming.value = false
}
function startPolling() {
  stopPolling()
  browserPollTimer.value = setInterval(async () => {
    try {
      const res = await req.get('/bids/browser/status')
      browserState.value = res.data.data
      if (res.data.data.state === 'done' || res.data.data.state === 'error') { stopPolling(); if (res.data.data.state === 'done') await loadBidData() }
    } catch {}
  }, 2000)
}
function stopPolling() {
  if (browserPollTimer.value) { clearInterval(browserPollTimer.value); browserPollTimer.value = null }
}
function onCloseCollect() {
  stopPolling()
  collectDlg.visible = false
  collectDlg.method = 'api'
  browserState.value = null
}
async function saveSource() { await req.post('/bids/sources', srcDlg.form); srcDlg.visible = false; srcDlg.form = {}; await loadBidData(); ElMessage.success('OK') }
function openEditSource(row) { srcEditDlg.form = { ...row }; srcEditDlg.visible = true }
async function toggleSource(row, val) { await req.put('/bids/sources/'+row.id, { enabled: val ? 1 : 0 }); await loadBidData() }
async function saveEditSource() { await req.put('/bids/sources/'+srcEditDlg.form.id, srcEditDlg.form); srcEditDlg.visible = false; await loadBidData(); ElMessage.success('OK') }
async function delSource(id) { await ElMessageBox.confirm('确认?'); await req.delete('/bids/sources/'+id); await loadBidData() }
async function saveKeyword() { try { await req.post('/bids/keywords', kwDlg.form); kwDlg.visible = false; kwDlg.form = {}; await loadBidData(); ElMessage.success('OK') } catch { ElMessage.error('关键词已存在') } }
async function delKeyword(id) { await req.delete('/bids/keywords/'+id); await loadBidData() }
function openDetail(row) { detailDlg.row = row; detailDlg.visible = true }
function openEditItem(row) { editDlg.form = { ...row }; editDlg.visible = true }
async function saveEditItem() { await req.put('/bids/items/'+editDlg.form.id, editDlg.form); editDlg.visible = false; await loadBidData(); ElMessage.success('OK') }
async function delBidItem(id) { await ElMessageBox.confirm('确认?'); await req.delete('/bids/items/'+id); await loadBidData() }
async function savePub() { await req.post('/content-publish', pubDlg.form); pubDlg.visible = false; pubDlg.form = {}; await loadBidData(); ElMessage.success('OK') }
async function delPub(id) { await ElMessageBox.confirm('确认?'); await req.delete('/content-publish/'+id); await loadBidData() }

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
  await loadBidItems(); await loadBidSources(); await loadBidKeywords(); await loadPubTasks()
  loadingBids.value = false
}
async function refresh() { await loadCrm(); await loadBidData() }
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
</style>
