<template>
  <div class="page-container">
    <div class="page-hd">
      <div>
        <span class="page-title">应用智能体管理</span>
        <span class="page-sub">AI Agent 配置与技能管理</span>
      </div>
      <el-button type="primary" @click="showWizard = true">✨ AI 创建智能体</el-button>
    </div>

    <!-- 统计 -->
    <div class="stat-row">
      <div class="stat-card" style="--glow:#7c3aed">
        <div class="stat-icon"><el-icon :size="20"><Cpu /></el-icon></div>
        <div class="stat-num">{{ agents.length }}</div>
        <div class="stat-label">智能体总数</div>
      </div>
      <div class="stat-card" style="--glow:#22c55e">
        <div class="stat-icon"><el-icon :size="20"><Check /></el-icon></div>
        <div class="stat-num">{{ agents.filter(a=>a.builtin).length }}</div>
        <div class="stat-label">系统内置</div>
      </div>
      <div class="stat-card" style="--glow:#f59e0b">
        <div class="stat-icon"><el-icon :size="20"><Setting /></el-icon></div>
        <div class="stat-num">{{ agents.filter(a=>!a.builtin).length }}</div>
        <div class="stat-label">自定义</div>
      </div>
    </div>

    <div class="agent-grid">
      <div v-for="agent in agents" :key="agent.id" class="agent-card">
        <div class="agent-header">
          <div class="agent-icon" :style="{ background: agent.bg || agent.color || '#7c3aed' }">
            <span v-if="agent.emoji" class="agent-emoji">{{ agent.emoji }}</span>
            <el-icon v-else :size="28"><Avatar /></el-icon>
          </div>
          <el-tag v-if="agent.builtin" size="small" type="success" effect="plain">系统</el-tag>
          <el-tag v-else size="small" type="warning" effect="plain">自定义</el-tag>
        </div>
        <div class="agent-name">{{ agent.name }}</div>
        <div class="agent-desc" :title="agent.desc">{{ agent.desc }}</div>
        <div class="agent-meta">
          <span v-if="agent.base_agent" class="agent-base">基于 {{ agent.base_agent }}</span>
          <span class="agent-id">ID: {{ agent.id }}</span>
        </div>
        <div class="agent-action">
          <el-button v-if="agent.builtin && agent.id !== 'customer-service-agent'" type="primary" size="small" round @click="startChat(agent)">对话</el-button>
          <el-button v-if="agent.id==='bid-agent'" size="small" round @click="openBidSettings">设置</el-button>
          <el-button v-if="agent.id==='customer-service-agent'" type="primary" size="small" round @click="openCustomerServiceChat">对话</el-button>
          <el-button v-if="agent.id==='customer-service-agent'" size="small" round @click="openCustomerServiceSettings">设置</el-button>
          <el-button v-if="agent.id==='customer-service-agent'" size="small" round @click="csEditDlg.visible = true; loadCustomerServiceUrl()">编辑</el-button>
          <el-button v-if="hasPanel(agent)" type="success" size="small" round @click="openManagement(agent)">管理面板</el-button>
          <el-button v-if="!agent.builtin" size="small" round @click="manageSkills(agent)">技能</el-button>
          <el-button v-if="!agent.builtin && !agent.is_digital_employee" size="small" round @click="openEdit(agent)">编辑</el-button>
          <el-button v-if="!agent.builtin && !agent.is_digital_employee" size="small" round type="danger" @click="delAgent(agent.id)">删除</el-button>
        </div>
      </div>
    </div>

    <!-- 技能选择对话框 -->
    <el-dialog v-model="skillDlg.visible" :title="'技能分配 - ' + skillDlg.agentName" width="620px" :close-on-click-modal="false">
      <div v-if="openclawSkills.length === 0" style="text-align:center;padding:40px 0">
        <el-empty description="OpenClaw 服务不可用或无已安装技能">
          <span style="color:#909399;font-size:12px">请确认 OpenClaw 已启动并已安装技能</span>
        </el-empty>
      </div>
      <div v-else class="skill-check-list">
        <div v-for="s in openclawSkills" :key="s.name" class="skill-check-item" :class="{ checked: openclawChecked.includes(s.name) }" @click="toggleOpenClawCheck(s.name)">
          <el-checkbox :model-value="openclawChecked.includes(s.name)" @click.stop @change="toggleOpenClawCheck(s.name)"/>
          <div class="sci-body">
            <div class="sci-name">{{ s.nameZh || s.name }} <el-tag v-if="s.source" size="small" type="info" style="margin-left:6px">{{ s.source }}</el-tag></div>
            <div class="sci-desc">{{ s.descZh || s.description || '无描述' }}</div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="skillDlg.visible=false">取消</el-button>
        <el-button type="primary" :loading="skillSaving" @click="saveSkillBinding">保存</el-button>
      </template>
    </el-dialog>

    <!-- 目录浏览对话框 -->
    <el-dialog v-model="browseDlg.visible" title="浏览文件夹/文件" width="520px" :close-on-click-modal="false">
      <div style="margin-bottom:8px;font-size:12px;color:#909399">
        当前：{{ browseDlg.current || '—' }}
        <el-button v-if="browseDlg.parent !== null" size="small" text @click="browsePath(browseDlg.parent)">⬆ 上级目录</el-button>
      </div>
      <div style="max-height:360px;overflow-y:auto;border:1px solid #f0ecfc;border-radius:6px">
        <div v-if="browseDlg.loading" style="text-align:center;padding:40px"><el-icon class="is-loading"><Loading /></el-icon></div>
        <div v-else-if="browseDlg.items.length===0" style="text-align:center;padding:40px;color:#b8aad0">空目录</div>
        <div v-for="item in browseDlg.items" :key="item.path" class="browse-item"
          @dblclick="item.type==='dir' ? browsePath(item.path) : selectBrowseItem(item.path)"
          :style="{ cursor: item.type==='dir' ? 'pointer' : 'default' }">
          <el-icon :size="16" :color="item.type==='dir'?'#7c3aed':'#909399'">
            <FolderOpened v-if="item.type==='dir'" /><Document v-else />
          </el-icon>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ item.name }}</span>
          <el-button v-if="item.type==='dir'" size="small" text @click="browsePath(item.path)">进入</el-button>
          <el-button v-if="item.type==='file'" size="small" text type="primary" @click="selectBrowseItem(item.path)">选择</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="browseDlg.visible=false">取消</el-button>
        <el-button type="primary" @click="selectBrowseItem(browseDlg.current)">选择当前目录</el-button>
      </template>
    </el-dialog>

    <!-- 招投标采集设置对话框 -->
    <el-dialog v-model="bidSettingsDlg.visible" title="招投标采集设置" width="720px" :close-on-click-modal="false">
      <el-tabs v-model="bidSettingsDlg.tab" type="card">
        <el-tab-pane label="采集线路" name="routes">
          <div v-loading="bidSettingsDlg.loading" style="min-height:120px">
            <div v-for="r in bidSettingsDlg.routes" :key="r.engine" class="bid-route-card">
              <div class="brc-header">
                <span class="brc-name">{{ r.label }}</span>
                <el-tag size="small" :type="r.status==='active'?'success':'info'">{{ r.status==='active'?'运行中':'待命' }}</el-tag>
              </div>
              <div class="brc-desc">{{ r.desc }}</div>
              <!-- 乙方宝登录管理 -->
              <div v-if="r.engine==='woyaobid'" style="margin-top:12px">
                <div class="woyaobid-status" :style="{ color: bidSettingsDlg.woyaobid.has_cookies ? '#22c55e' : '#e74c3c' }">
                  <el-icon :size="16"><CircleCheck v-if="bidSettingsDlg.woyaobid.has_cookies" /><WarningFilled v-else /></el-icon>
                  <span style="font-weight:600;font-size:13px">{{ bidSettingsDlg.woyaobid.has_cookies ? '已登录' : '未登录' }}</span>
                  <span v-if="bidSettingsDlg.woyaobid.has_cookies" style="font-size:11px;color:#909399;margin-left:8px">
                    {{ bidSettingsDlg.woyaobid.count }} 条 · {{ new Date(bidSettingsDlg.woyaobid.updated_at).toLocaleString('zh-CN') }}
                  </span>
                </div>
                <div style="margin-top:8px;padding:10px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
                  <div style="font-size:13px;font-weight:600;color:#166534;margin-bottom:6px">自动获取 Cookie</div>
                  <div style="font-size:11px;color:#4a3f5e;margin-bottom:8px">点击按钮自动打开浏览器，扫码登录后 Cookie 自动保存</div>
                  <el-button type="success" size="small" :loading="bidSettingsDlg.woyaobidLogging" @click="autoWoyaobidLogin">
                    自动登录并获取 Cookie
                  </el-button>
                  <span v-if="bidSettingsDlg.woyaobidLogging" style="margin-left:8px;font-size:11px;color:#909399">等待扫码登录中...</span>
                </div>
                <el-collapse style="margin-top:8px">
                  <el-collapse-item title="手动输入 Cookie（备用）" name="manual">
                    <div style="font-size:11px;color:#909399;line-height:1.6;margin-bottom:6px">
                      1. 点击「打开登录页」→ 浏览器中扫码登录<br/>
                      2. F12 → 控制台(Console) → 粘贴以下脚本 → 复制输出结果：
                    </div>
                    <div style="background:#1e1e2e;color:#cdd6f4;padding:8px;border-radius:6px;font-size:10px;font-family:monospace;margin-bottom:8px;white-space:pre-wrap;word-break:break-all">JSON.stringify(document.cookie.split('; ').map(c => { const [k,v] = c.split('='); return {name:k,value:v,domain:location.hostname,path:'/'} }))</div>
                    <el-input v-model="bidSettingsDlg.woyaobidInput" type="textarea" :rows="2" placeholder="粘贴 Cookie JSON" style="margin-bottom:6px" />
                    <div style="display:flex;gap:8px">
                      <el-button size="small" @click="openWoyaobidLogin">打开登录页</el-button>
                      <el-button type="primary" size="small" :loading="bidSettingsDlg.woyaobidSaving" @click="saveWoyaobidCookies">保存 Cookie</el-button>
                    </div>
                  </el-collapse-item>
                </el-collapse>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="采集网址" name="sources">
          <div style="margin-bottom:10px">
            <el-button type="primary" size="small" @click="openSourceEdit(null)">添加网址</el-button>
          </div>
          <el-table :data="bidSettingsDlg.sources" size="small" max-height="280" stripe>
            <el-table-column prop="name" label="名称" width="130" />
            <el-table-column prop="url" label="URL" min-width="180" show-overflow-tooltip />
            <el-table-column prop="source_type" label="类型" width="80" />
            <el-table-column prop="interval_minutes" label="间隔(分)" width="75" />
            <el-table-column prop="collect_range" label="采集范围" width="90">
              <template #default="{row}">
                <el-tag size="small" type="info">{{ rangeLabel(row.collect_range) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="enabled" label="启用" width="60">
              <template #default="{row}">
                <el-switch :model-value="row.enabled===1" size="small" @change="toggleSourceEnabled(row)" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{row}">
                <el-button size="small" text type="primary" @click="openSourceEdit(row)">编辑</el-button>
                <el-button size="small" text type="danger" @click="deleteSource(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="采集结果" name="results">
          <div v-loading="bidSettingsDlg.loading" style="min-height:120px">
            <div class="bid-time-filter">
              <el-button v-for="t in timeRangeOptions" :key="t.value" size="small"
                :type="bidSettingsDlg.timeRange === t.value ? 'primary' : ''"
                @click="bidSettingsDlg.timeRange = t.value; refreshBidSettings()">{{ t.label }}</el-button>
            </div>
            <div class="bid-summary-row">
              <div class="bid-summary-card">
                <div class="bsc-num">{{ bidSettingsDlg.summary.total_items }}</div>
                <div class="bsc-label">{{ timeRangeLabel }}采集项目</div>
              </div>
              <div class="bid-summary-card">
                <div class="bsc-num" style="color:#e67e22">{{ bidSettingsDlg.summary.new_items }}</div>
                <div class="bsc-label">未处理</div>
              </div>
              <div class="bid-summary-card">
                <div class="bsc-num" style="color:#22c55e">{{ bidSettingsDlg.summary.recent_7d }}</div>
                <div class="bsc-label">{{ timeRangeLabel }}新增</div>
              </div>
            </div>
            <el-tabs v-model="bidSettingsDlg.resultTab" type="border-card" size="small" style="margin-top:16px">
              <el-tab-pane label="中标信息统计" name="zhongbiao">
                <el-table :data="bidSettingsDlg.summary.zhongbiao_items" size="small" max-height="300" stripe>
                  <el-table-column prop="bid_time" label="中标时间" width="100" />
                  <el-table-column prop="doc_deadline" label="开标时间" width="100" />
                  <el-table-column prop="bid_type" label="投标方式" width="90" />
                  <el-table-column prop="region" label="类型" width="70" />
                  <el-table-column prop="industry" label="一级行业" width="80" />
                  <el-table-column prop="bidder" label="招标方" width="100" show-overflow-tooltip />
                  <el-table-column prop="win_company" label="中标公司" width="100" show-overflow-tooltip />
                  <el-table-column prop="title" label="项目名称" min-width="150" show-overflow-tooltip />
                  <el-table-column prop="purchase_requirements" label="项目产品及服务" min-width="100" show-overflow-tooltip />
                  <el-table-column prop="amount" label="金额(万元)" width="85" />
                  <el-table-column prop="url" label="链接" width="65">
                    <template #default="{row}">
                      <a v-if="row.url" :href="row.url" target="_blank" style="color:#7c3aed">查看</a>
                    </template>
                  </el-table-column>
                </el-table>
                <div v-if="!bidSettingsDlg.summary.zhongbiao_items?.length" style="text-align:center;padding:20px;color:#909399">暂无中标信息</div>
              </el-tab-pane>
              <el-tab-pane label="采购意向" name="caiyou">
                <el-table :data="bidSettingsDlg.summary.caiyou_items" size="small" max-height="300" stripe>
                  <el-table-column prop="region" label="省份" width="70" />
                  <el-table-column prop="industry" label="一级行业" width="80" />
                  <el-table-column prop="bidder" label="招标方" width="100" show-overflow-tooltip />
                  <el-table-column prop="title" label="项目名称" min-width="150" show-overflow-tooltip />
                  <el-table-column prop="amount" label="金额(万元)" width="85" />
                  <el-table-column prop="purchase_requirements" label="采购需求" min-width="100" show-overflow-tooltip />
                  <el-table-column prop="doc_deadline" label="预计采购时间" width="100" />
                  <el-table-column prop="notice_time" label="发布时间" width="100" />
                  <el-table-column prop="url" label="链接" width="65">
                    <template #default="{row}">
                      <a v-if="row.url" :href="row.url" target="_blank" style="color:#7c3aed">查看</a>
                    </template>
                  </el-table-column>
                </el-table>
                <div v-if="!bidSettingsDlg.summary.caiyou_items?.length" style="text-align:center;padding:20px;color:#909399">暂无采购意向</div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </el-tab-pane>
        <el-tab-pane label="地区过滤" name="regions">
          <div style="min-height:120px;padding:8px 0">
            <div style="margin-bottom:12px;display:flex;align-items:center;gap:12px">
              <span style="font-size:13px;color:#606266">启用地区过滤：</span>
              <el-switch v-model="bidSettingsDlg.regionEnabled" size="small" @change="saveRegionFilter" />
              <span style="font-size:12px;color:#909399">{{ bidSettingsDlg.regionEnabled ? '仅采集下列地区' : '不限制地区' }}</span>
            </div>
            <div v-if="bidSettingsDlg.regionEnabled" style="margin-bottom:12px">
              <el-tag v-for="(city, idx) in bidSettingsDlg.regionList" :key="idx" closable :disable-transitions="false"
                size="default" style="margin:3px 6px 3px 0" @close="removeRegion(idx)">{{ city }}</el-tag>
              <div style="display:flex;gap:8px;margin-top:8px">
                <el-input v-model="bidSettingsDlg.regionInput" placeholder="输入城市名" size="small" style="width:180px"
                  @keyup.enter="addRegion" />
                <el-button size="small" type="primary" @click="addRegion">添加</el-button>
                <el-button size="small" @click="resetRegions">重置默认</el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="行业筛选" name="industryTerms">
          <div style="min-height:120px;padding:8px 0">
            <div style="margin-bottom:12px;display:flex;align-items:center;gap:12px">
              <span style="font-size:13px;color:#606266">启用行业筛选：</span>
              <el-switch v-model="bidSettingsDlg.industryEnabled" size="small" @change="saveIndustryTerms" />
              <span style="font-size:12px;color:#909399">{{ bidSettingsDlg.industryEnabled ? '仅采集含以下关键词的项目（乙方宝引擎）' : '不限制行业' }}</span>
            </div>
            <div v-if="bidSettingsDlg.industryEnabled" style="margin-bottom:12px">
              <el-tag v-for="(term, idx) in bidSettingsDlg.industryList" :key="idx" closable :disable-transitions="false"
                size="default" style="margin:3px 6px 3px 0" @close="removeIndustryTerm(idx)">{{ term }}</el-tag>
              <div style="display:flex;gap:8px;margin-top:8px">
                <el-input v-model="bidSettingsDlg.industryInput" placeholder="输入关键词" size="small" style="width:220px"
                  @keyup.enter="addIndustryTerm" />
                <el-button size="small" type="primary" @click="addIndustryTerm">添加</el-button>
                <el-button size="small" @click="resetIndustryTerms">重置默认</el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="采集日志" name="logs">
          <div style="min-height:120px">
            <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px">
              <el-select v-model="bidSettingsDlg.logEngine" size="small" placeholder="引擎筛选" clearable style="width:130px" @change="loadCollectLogs">
                <el-option label="全部" value="" />
                <el-option label="Crawl4AI" value="crawl4ai" />
                <el-option label="Scrapling" value="scrapling" />
                <el-option label="乙方宝" value="woyaobid" />
              </el-select>
              <el-button size="small" @click="loadCollectLogs">刷新</el-button>
            </div>
            <el-table :data="bidSettingsDlg.collectLogs" size="small" max-height="280" stripe>
              <el-table-column prop="engine" label="引擎" width="100">
                <template #default="{row}">
                  <el-tag size="small" :type="row.engine==='crawl4ai'?'primary':row.engine==='scrapling'?'warning':'success'">
                    {{ row.engine==='crawl4ai'?'Crawl4AI':row.engine==='scrapling'?'Scrapling':'乙方宝' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="found" label="发现" width="65" />
              <el-table-column prop="inserted" label="新增" width="65" />
              <el-table-column prop="status" label="状态" width="75">
                <template #default="{row}">
                  <el-tag size="small" :type="row.status==='success'?'success':'danger'">{{ row.status==='success'?'成功':'失败' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="error_detail" label="错误" min-width="120" show-overflow-tooltip>
                <template #default="{row}">
                  <span v-if="row.error_detail" style="color:#e74c3c;font-size:12px">{{ row.error_detail }}</span>
                  <span v-else style="color:#909399">-</span>
                </template>
              </el-table-column>
              <el-table-column prop="duration_ms" label="耗时" width="85">
                <template #default="{row}">
                  <span v-if="row.duration_ms">{{ row.duration_ms > 60000 ? Math.round(row.duration_ms/60000)+'分' : Math.round(row.duration_ms/1000)+'秒' }}</span>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column prop="created_at" label="时间" width="145" />
              <el-table-column label="操作" width="60">
                <template #default="{row}">
                  <el-button size="small" text type="danger" @click="deleteCollectLog(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="!bidSettingsDlg.collectLogs?.length" style="text-align:center;padding:20px;color:#909399">暂无采集日志</div>
            <div style="margin-top:8px;display:flex;justify-content:center">
              <el-pagination small layout="prev, pager, next" :total="bidSettingsDlg.collectLogTotal" :page-size="20"
                v-model:current-page="bidSettingsDlg.collectLogPage" @current-change="loadCollectLogs" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="bidSettingsDlg.visible=false">关闭</el-button>
        <el-button type="primary" @click="refreshBidSettings">刷新</el-button>
      </template>
    </el-dialog>

    <!-- 采集网址编辑弹窗 -->
    <el-dialog v-model="sourceEditDlg.visible" :title="sourceEditDlg.isEdit ? '编辑采集网址' : '添加采集网址'" width="500px" :close-on-click-modal="false">
      <el-form :model="sourceEditDlg.form" label-width="90px" size="default">
        <el-form-item label="名称"><el-input v-model="sourceEditDlg.form.name" placeholder="如：云南省政府采购网" /></el-form-item>
        <el-form-item label="URL"><el-input v-model="sourceEditDlg.form.url" placeholder="https://..." /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="sourceEditDlg.form.source_type" style="width:100%">
            <el-option label="通用网页 (自动分配引擎)" value="web" />
            <el-option label="Crawl4AI 专用" value="crawl4ai" />
            <el-option label="Scrapling 专用" value="scrapling" />
            <el-option label="乙方宝" value="woyaobid" />
            <el-option label="API接口" value="api" />
          </el-select>
        </el-form-item>
        <el-form-item label="采集间隔(分)">
          <el-input-number v-model="sourceEditDlg.form.interval_minutes" :min="10" :max="10080" style="width:100%" />
        </el-form-item>
        <el-form-item label="采集范围">
          <el-select v-model="sourceEditDlg.form.collect_range" style="width:100%">
            <el-option label="最近1周" value="7d" />
            <el-option label="最近1月" value="30d" />
            <el-option label="最近3月" value="90d" />
            <el-option label="最近1年" value="365d" />
            <el-option label="不限" value="all" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="sourceEditDlg.form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sourceEditDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="sourceEditDlg.saving" @click="saveSource">保存</el-button>
      </template>
    </el-dialog>

    <!-- 智能客服链接编辑对话框 -->
    <el-dialog v-model="csEditDlg.visible" title="智能客服链接设置" width="480px" :close-on-click-modal="false">
      <el-form label-width="80px" size="default">
        <el-form-item label="客服链接">
          <el-input v-model="csEditDlg.url" placeholder="请输入智能客服链接，如 https://yuanqi.tencent.com/..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="csEditDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="csEditDlg.saving" @click="saveCustomerServiceUrl">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加/编辑智能体对话框 -->
    <el-dialog v-model="dlg.visible" :title="dlg.isEdit ? '编辑智能体' : '添加智能体'" width="820px" :close-on-click-modal="false">
      <div class="agent-dlg">
        <!-- 左侧表单 -->
        <div class="agent-dlg-form">
          <el-form :model="dlg.form" label-width="85px" size="default">
            <el-form-item label="名称"><el-input v-model="dlg.form.name" placeholder="如：智能客服"/></el-form-item>
            <el-form-item label="描述"><el-input v-model="dlg.form.desc" type="textarea" :rows="2" placeholder="简要描述智能体的用途..."/></el-form-item>

            <!-- 外观设置 -->
            <el-form-item label="外观">
              <div class="look-row">
                <div class="look-col">
                  <div class="look-label">图标</div>
                  <div class="icon-grid">
                    <div v-for="ic in icons" :key="ic" class="icon-cell" :class="{ sel: dlg.form.icon === ic }" @click="dlg.form.icon = ic" :title="ic">
                      <el-icon :size="18"><component :is="ic" /></el-icon>
                    </div>
                  </div>
                </div>
                <div class="look-col">
                  <div class="look-label">Emoji</div>
                  <div class="emoji-grid">
                    <span v-for="em in emojis" :key="em" class="emoji-cell" :class="{ sel: dlg.form.emoji === em }" @click="dlg.form.emoji = em">{{ em }}</span>
                  </div>
                </div>
              </div>
              <div class="look-label" style="margin-top:8px">背景色</div>
              <el-color-picker v-model="dlg.form.color" size="default" style="margin-top:4px"/>
            </el-form-item>

            <el-form-item label="基础 Agent">
              <el-select v-model="dlg.form.base_agent" multiple style="width:100%" clearable placeholder="不继承（纯自定义提示词）">
                <el-option label="企业经营管理 Agent (完整工具集)" value="internal-agent"/>
                <el-option label="售后管理 Agent (客服工具集)" value="support-agent"/>
                <el-option label="销售管理 Agent (CRM 工具集)" value="sales-agent"/>
              </el-select>
            </el-form-item>

            <el-form-item label="系统提示词">
              <el-input v-model="dlg.form.system_prompt" type="textarea" :rows="4" placeholder="留空继承基础Agent，或点击右侧 AI 生成自动填写..."/>
              <div style="display:flex;justify-content:flex-end;margin-top:6px">
                <el-button size="small" type="primary" :loading="promptGenerating" @click="generatePrompt">
                  <el-icon style="margin-right:4px"><MagicStick /></el-icon>AI 生成提示词
                </el-button>
              </div>
            </el-form-item>

            <el-form-item label="知识库">
              <el-select v-model="dlg.form.kb_article_ids" multiple filterable placeholder="选择知识库文章" style="width:100%">
                <el-option v-for="a in kbArticles" :key="a.id" :label="a.title" :value="a.id">
                  <span>{{ a.title }}</span>
                  <span style="float:right;color:#b8aad0;font-size:11px">{{ a.category }}</span>
                </el-option>
              </el-select>
            </el-form-item>

            <el-form-item label="本地引用">
              <div class="folder-list">
                <div v-for="(fp, idx) in dlg.form.kb_folder_paths" :key="idx" class="folder-row">
                  <el-input v-model="dlg.form.kb_folder_paths[idx]" placeholder="文件夹路径，或上传本地文件到服务器" size="small" style="flex:1" />
                  <el-button size="small" @click="openBrowse(idx)">浏览</el-button>
                  <el-upload
                    :auto-upload="true"
                    :show-file-list="false"
                    :http-request="(opts) => handleKbUpload(opts, idx)"
                    multiple
                    style="display:inline-flex"
                  >
                    <el-button size="small" :loading="kbUploading === idx">📤 上传</el-button>
                  </el-upload>
                  <el-button size="small" type="danger" :icon="Delete" circle @click="dlg.form.kb_folder_paths.splice(idx,1)" />
                </div>
                <el-button size="small" type="primary" text @click="dlg.form.kb_folder_paths.push('')">
                  <el-icon><Plus /></el-icon> 添加
                </el-button>
              </div>
            </el-form-item>
          </el-form>
        </div>

        <!-- 右侧预览卡片 -->
        <div class="agent-dlg-preview">
          <div class="preview-label">实时预览</div>
          <div class="agent-card mini" :style="{ '--card-bg': dlg.form.color || '#7c3aed' }">
            <div class="agent-header">
              <div class="agent-icon" :style="{ background: dlg.form.color || '#7c3aed' }">
                <span v-if="dlg.form.emoji" class="agent-emoji">{{ dlg.form.emoji }}</span>
                <el-icon v-else :size="22"><component :is="dlg.form.icon || 'Avatar'" /></el-icon>
              </div>
              <el-tag size="small" type="warning" effect="plain">自定义</el-tag>
            </div>
            <div class="agent-name">{{ dlg.form.name || '智能体名称' }}</div>
            <div class="agent-desc">{{ dlg.form.desc || '智能体描述预览...' }}</div>
            <div class="agent-meta" v-if="dlg.form.base_agent?.length">
              <span class="agent-base">基于 {{ dlg.form.base_agent.join(', ') }}</span>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="dlg.visible=false">取消</el-button>
        <el-button type="primary" @click="saveAgent">保存</el-button>
      </template>
    </el-dialog>

    <!-- AI 创建向导 -->
    <AgentCreateWizard v-model="showWizard" @created="loadAgents" />

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Avatar, Cpu, Check, Setting, Plus, Delete, FolderOpened, Document, Loading, MagicStick, CircleCheck, WarningFilled } from '@element-plus/icons-vue'
import request from '../api/index.js'
import AgentCreateWizard from '../components/agent/AgentCreateWizard.vue'
const router = useRouter()

const agents = ref([])
const kbArticles = ref([])
const dlg = reactive({ visible: false, isEdit: false, form: {} })
const showWizard = ref(false)
const promptGenerating = ref(false)
const browseDlg = reactive({ visible: false, loading: false, current: '', parent: null, items: [], editIdx: -1 })
const icons = ['Avatar', 'Coin', 'Headset', 'Lock', 'ChatDotSquare', 'DataAnalysis', 'Cpu', 'Setting', 'Promotion', 'List', 'FolderOpened', 'Document']
const emojis = ['🤖', '🤝', '📋', '🔧', '🛡️', '💻', '💬', '📢', '🎯', '🧠', '👔', '📊']

// 技能分配
const skillDlg = reactive({ visible: false, agentId: '', agentName: '' })
const openclawSkills = ref([])
const openclawChecked = ref([])
const skillSaving = ref(false)
const kbUploading = ref(-1)  // 当前正在上传的本地引用行索引，-1 表示无

async function loadAgents() {
  try { const { data } = await request.get('/agents'); agents.value = data.data || [] } catch { agents.value = [] }
}
async function loadKB() {
  try { const { data } = await request.get('/knowledge-base', { params: { status: 'published' } }); kbArticles.value = data.data || [] } catch { kbArticles.value = [] }
}

function startChat(agent) {
  router.push({ path: '/chat', query: { agent: agent.id, agentName: agent.name } })
}

function hasPanel(agent) {
  if (!agent.builtin) return false
  const map = { 'internal-agent': true, 'sales-agent': true, 'support-agent': true }
  return map[agent.id]
}
function openManagement(agent) {
  const id = agent.base_agent || agent.id
  const map = { 'internal-agent': '/internal', 'sales-agent': '/internal/sales', 'support-agent': '/support' }
  if (map[id]) router.push(map[id])
}

// ----- 技能 -----
async function manageSkills(agent) {
  skillDlg.agentId = agent.id; skillDlg.agentName = agent.name
  try {
    const [allRes, checkedRes] = await Promise.all([
      request.get('/agent-openclaw-skills'),
      request.get('/agent-openclaw-skills/' + agent.id)
    ])
    openclawSkills.value = allRes.data?.data || []
    openclawChecked.value = checkedRes.data?.data || []
  } catch { openclawSkills.value = []; openclawChecked.value = [] }
  skillDlg.visible = true
}
async function saveSkillBinding() {
  skillSaving.value = true
  try {
    await request.put('/agent-openclaw-skills/' + skillDlg.agentId, { skills: openclawChecked.value })
    ElMessage.success('技能分配已保存')
    skillDlg.visible = false
  } catch (e) {
    ElMessage.error('保存失败')
  }
  skillSaving.value = false
}

// ----- OpenClaw 技能 -----
function toggleOpenClawCheck(skillName) {
  const idx = openclawChecked.value.indexOf(skillName)
  if (idx >= 0) openclawChecked.value.splice(idx, 1)
  else openclawChecked.value.push(skillName)
}

// ----- 浏览本地目录 -----
async function browsePath(p) {
  browseDlg.loading = true
  try {
    const { data } = await request.post('/knowledge-base/browse', { filePath: p || '' })
    if (data.code === 200) {
      browseDlg.current = data.data.current
      browseDlg.parent = data.data.parent
      browseDlg.items = data.data.items || []
    }
  } catch (e) {
    ElMessage.error('浏览失败')
  }
  browseDlg.loading = false
}
function openBrowse(idx) {
  browseDlg.editIdx = idx
  browseDlg.visible = true
  const p = dlg.form.kb_folder_paths[idx] || ''
  browsePath(p)
}
function selectBrowseItem(p) {
  if (browseDlg.editIdx >= 0) {
    dlg.form.kb_folder_paths[browseDlg.editIdx] = p
  }
  browseDlg.visible = false
}

// 上传本地文件到服务器，返回服务器路径自动填入
async function handleKbUpload(opts, idx) {
  kbUploading.value = idx
  try {
    const formData = new FormData()
    formData.append('files', opts.file)
    const { data } = await request.post('/knowledge-base/upload-kb', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    if (data.code === 200) {
      dlg.form.kb_folder_paths[idx] = data.data.serverPath
      ElMessage.success(data.message)
    } else {
      ElMessage.error(data.message || '上传失败')
    }
  } catch (e) {
    ElMessage.error('上传失败: ' + (e.response?.data?.message || e.message))
  }
  kbUploading.value = -1
}

// ----- 智能体 -----
function openAdd() {
  dlg.isEdit = false
  dlg.form = { name: '', desc: '', icon: 'Avatar', emoji: '🤖', color: '#7c3aed', base_agent: [], system_prompt: '', kb_article_ids: [], kb_folder_paths: [] }
  dlg.visible = true
}
function openEdit(agent) {
  dlg.isEdit = true
  const ids = agent.kb_article_ids ? agent.kb_article_ids.split(',').filter(Boolean) : []
  const fps = agent.kb_folder_paths ? agent.kb_folder_paths.split(',').filter(Boolean) : []
  const bas = agent.base_agent ? agent.base_agent.split(',').filter(Boolean) : []
  dlg.form = { ...agent, color: agent.bg || agent.color || '#7c3aed', base_agent: bas, kb_article_ids: ids, kb_folder_paths: fps.length ? fps : [] }
  dlg.visible = true
}
async function saveAgent() {
  if (!dlg.form.name) return ElMessage.warning('请输入名称')
  const payload = {
    ...dlg.form,
    base_agent: (dlg.form.base_agent || []).join(','),
    kb_article_ids: (dlg.form.kb_article_ids || []).join(','),
    kb_folder_paths: (dlg.form.kb_folder_paths || []).filter(Boolean).join(',')
  }
  if (dlg.isEdit) { await request.put('/agent-apps/' + dlg.form.id, payload) }
  else { await request.post('/agent-apps', payload) }
  dlg.visible = false; await loadAgents(); ElMessage.success('OK')
}
async function generatePrompt() {
  if (!dlg.form.name) return ElMessage.warning('请先填写智能体名称')
  promptGenerating.value = true
  try {
    const { data } = await request.post('/agent-apps/generate-prompt', {
      name: dlg.form.name,
      desc: dlg.form.desc || '',
      base_agent: dlg.form.base_agent || ''
    })
    if (data.code === 200 && data.data?.system_prompt) {
      dlg.form.system_prompt = data.data.system_prompt
      ElMessage.success('提示词已生成')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '生成失败')
  }
  promptGenerating.value = false
}

async function delAgent(id) {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除该智能体？', '删除确认', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await request.delete('/agent-apps/' + id)
    await loadAgents()
    ElMessage.success('已删除')
  } catch (e) {
    if (e !== 'cancel' && e?.action !== 'cancel') {
      ElMessage.error(e.response?.data?.message || '删除失败')
    }
  }
}

// ── 招投标采集设置 ──
const timeRangeOptions = [
  { label: '最近1周', value: '7' },
  { label: '最近1月', value: '30' },
  { label: '最近3月', value: '90' },
  { label: '最近1年', value: '365' },
  { label: '全部', value: '' }
]
const timeRangeLabel = computed(() => {
  const opt = timeRangeOptions.find(t => t.value === bidSettingsDlg.timeRange)
  return opt ? opt.label : '全部'
})

const bidSettingsDlg = reactive({
  visible: false, loading: false, tab: 'routes', resultTab: 'zhongbiao', timeRange: '7',
  routes: [], sources: [],
  summary: { total_items: 0, new_items: 0, recent_7d: 0, zhongbiao_items: [], caiyou_items: [], txt_files: [] },
  woyaobid: { has_cookies: false, count: 0, updated_at: null },
  woyaobidInput: '', woyaobidSaving: false, woyaobidLogging: false,
  // 地区过滤
  regionList: [], regionEnabled: true, regionInput: '',
  // 行业筛选
  industryList: [], industryEnabled: true, industryInput: '',
  // 采集日志
  collectLogs: [], collectLogTotal: 0, collectLogPage: 1, logEngine: ''
})

const sourceEditDlg = reactive({
  visible: false, isEdit: false, saving: false,
  form: { name: '', url: '', source_type: 'web', interval_minutes: 360, collect_range: '30d', enabled: true }
})

async function openBidSettings() {
  bidSettingsDlg.visible = true
  bidSettingsDlg.loading = true
  const results = await Promise.allSettled([
    request.get('/bid-agent/settings', { params: { timeRange: bidSettingsDlg.timeRange } }),
    request.get('/bid-agent/woyaobid-cookies'),
    request.get('/bid-agent/region-filter'),
    request.get('/bid-agent/industry-terms')
  ])
  if (results[0].status === 'fulfilled' && results[0].value.data.code === 200) {
    const d = results[0].value.data.data
    bidSettingsDlg.routes = d.routes || []
    bidSettingsDlg.sources = d.sources || []
    bidSettingsDlg.summary = d.summary || { total_items: 0, new_items: 0, recent_7d: 0, zhongbiao_items: [], caiyou_items: [], txt_files: [] }
  }
  if (results[1].status === 'fulfilled' && results[1].value.data.code === 200) {
    bidSettingsDlg.woyaobid = results[1].value.data.data
  }
  if (results[2].status === 'fulfilled' && results[2].value.data.code === 200) {
    const rd = results[2].value.data.data
    bidSettingsDlg.regionList = rd.regions || []
    bidSettingsDlg.regionEnabled = rd.enabled
  }
  if (results[3].status === 'fulfilled' && results[3].value.data.code === 200) {
    const id = results[3].value.data.data
    bidSettingsDlg.industryList = id.terms || []
    bidSettingsDlg.industryEnabled = id.enabled
  }
  bidSettingsDlg.loading = false
  loadCollectLogs()
}
async function refreshBidSettings() {
  bidSettingsDlg.loading = true
  const results = await Promise.allSettled([
    request.get('/bid-agent/settings', { params: { timeRange: bidSettingsDlg.timeRange } }),
    request.get('/bid-agent/woyaobid-cookies'),
    request.get('/bid-agent/region-filter'),
    request.get('/bid-agent/industry-terms')
  ])
  if (results[0].status === 'fulfilled' && results[0].value.data.code === 200) {
    const d = results[0].value.data.data
    bidSettingsDlg.routes = d.routes || []
    bidSettingsDlg.sources = d.sources || []
    bidSettingsDlg.summary = d.summary || { total_items: 0, new_items: 0, recent_7d: 0, zhongbiao_items: [], caiyou_items: [], txt_files: [] }
  }
  if (results[1].status === 'fulfilled' && results[1].value.data.code === 200) {
    bidSettingsDlg.woyaobid = results[1].value.data.data
  }
  if (results[2].status === 'fulfilled' && results[2].value.data.code === 200) {
    const rd = results[2].value.data.data
    bidSettingsDlg.regionList = rd.regions || []
    bidSettingsDlg.regionEnabled = rd.enabled
  }
  if (results[3].status === 'fulfilled' && results[3].value.data.code === 200) {
    const id = results[3].value.data.data
    bidSettingsDlg.industryList = id.terms || []
    bidSettingsDlg.industryEnabled = id.enabled
  }
  bidSettingsDlg.loading = false
  loadCollectLogs()
}

// ── 地区过滤 ──
async function saveRegionFilter() {
  try {
    await request.put('/bid-agent/region-filter', { regions: bidSettingsDlg.regionEnabled ? bidSettingsDlg.regionList : [] })
  } catch (e) { ElMessage.error('保存失败') }
}
async function addRegion() {
  const v = bidSettingsDlg.regionInput.trim()
  if (!v) return
  if (bidSettingsDlg.regionList.includes(v)) { ElMessage.warning('已存在'); return }
  bidSettingsDlg.regionList.push(v)
  bidSettingsDlg.regionInput = ''
  await saveRegionFilter()
}
async function removeRegion(idx) {
  bidSettingsDlg.regionList.splice(idx, 1)
  await saveRegionFilter()
}
async function resetRegions() {
  bidSettingsDlg.regionList = ['昆明','曲靖','玉溪','保山','昭通','丽江','普洱','临沧','楚雄','红河','文山','版纳','大理','德宏','怒江','迪庆','云南']
  bidSettingsDlg.regionEnabled = true
  await saveRegionFilter()
}

// ── 行业筛选 ──
async function saveIndustryTerms() {
  try {
    await request.put('/bid-agent/industry-terms', { terms: bidSettingsDlg.industryEnabled ? bidSettingsDlg.industryList : [] })
  } catch (e) { ElMessage.error('保存失败') }
}
async function addIndustryTerm() {
  const v = bidSettingsDlg.industryInput.trim()
  if (!v) return
  if (bidSettingsDlg.industryList.includes(v)) { ElMessage.warning('已存在'); return }
  bidSettingsDlg.industryList.push(v)
  bidSettingsDlg.industryInput = ''
  await saveIndustryTerms()
}
async function removeIndustryTerm(idx) {
  bidSettingsDlg.industryList.splice(idx, 1)
  await saveIndustryTerms()
}
async function resetIndustryTerms() {
  bidSettingsDlg.industryList = ['网络安全','信息安全','数据安全','终端安全','系统集成','等级保护','等保测评','安全审计','安全运维','安全防护','应急响应','态势感知','渗透测试','漏洞扫描','入侵检测','身份认证','服务器','交换机','路由器','防火墙','堡垒机','加密机','信息系统','数据库','网络设备','硬件采购','软件采购','信息化设备','信息化平台','信息化系统','信息化建设','全光纤','智慧安防','安防系统','机房建设','数据中心','云平台','IT运维','网络安全建设','网络安全设备','智慧校园','智慧医院','智慧监管','智慧监所','智慧园区','智慧工厂','智慧体育','智慧种植','通信网','虚拟专网','信息发布系统','科技管控','调度系统','办公自动化','运维服务']
  bidSettingsDlg.industryEnabled = true
  await saveIndustryTerms()
}

// ── 采集日志 ──
async function loadCollectLogs() {
  try {
    const { data } = await request.get('/bid-agent/collect-logs', {
      params: { page: bidSettingsDlg.collectLogPage, engine: bidSettingsDlg.logEngine || undefined }
    })
    if (data.code === 200) {
      bidSettingsDlg.collectLogs = data.data.rows || []
      bidSettingsDlg.collectLogTotal = data.data.total || 0
    }
  } catch {}
}
async function deleteCollectLog(id) {
  try {
    await request.delete('/bid-agent/collect-logs/' + id)
    loadCollectLogs()
  } catch (e) { ElMessage.error('删除失败') }
}

// ── 采集网址 CRUD ──
function openSourceEdit(row) {
  if (row) {
    sourceEditDlg.isEdit = true
    sourceEditDlg.form = { id: row.id, name: row.name, url: row.url, source_type: row.source_type, interval_minutes: row.interval_minutes || 360, collect_range: row.collect_range || '30d', enabled: row.enabled === 1 }
  } else {
    sourceEditDlg.isEdit = false
    sourceEditDlg.form = { name: '', url: '', source_type: 'web', interval_minutes: 360, collect_range: '30d', enabled: true }
  }
  sourceEditDlg.visible = true
}

async function saveSource() {
  if (!sourceEditDlg.form.name || !sourceEditDlg.form.url) return ElMessage.warning('名称和URL必填')
  sourceEditDlg.saving = true
  try {
    if (sourceEditDlg.isEdit) {
      await request.put('/bid-agent/sources/' + sourceEditDlg.form.id, sourceEditDlg.form)
    } else {
      await request.post('/bid-agent/sources', sourceEditDlg.form)
    }
    ElMessage.success('已保存')
    sourceEditDlg.visible = false
    refreshBidSettings()
  } catch (e) { ElMessage.error(e.response?.data?.message || e.message || '保存失败') }
  sourceEditDlg.saving = false
}

async function deleteSource(id) {
  try {
    await ElMessageBox.confirm('删除该网址将同时删除关联的采集数据，确认？', '删除确认', { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' })
    await request.delete('/bid-agent/sources/' + id)
    ElMessage.success('已删除')
    refreshBidSettings()
  } catch (e) {
    if (e !== 'cancel' && e?.action !== 'cancel') ElMessage.error('删除失败')
  }
}

function rangeLabel(v) {
  const map = { '7d': '最近1周', '30d': '最近1月', '90d': '最近3月', '365d': '最近1年', 'all': '不限' }
  return map[v] || v || '最近1月'
}

async function toggleSourceEnabled(row) {
  try {
    await request.put('/bid-agent/sources/' + row.id, { enabled: row.enabled ? 0 : 1 })
    refreshBidSettings()
  } catch { ElMessage.error('操作失败') }
}
function openWoyaobidLogin() {
  window.open('https://qiye.qianlima.com', '_blank')
}
async function saveWoyaobidCookies() {
  if (!bidSettingsDlg.woyaobidInput.trim()) return ElMessage.warning('请先粘贴 Cookie JSON')
  bidSettingsDlg.woyaobidSaving = true
  try {
    const { data } = await request.post('/bid-agent/woyaobid-cookies', { cookies: bidSettingsDlg.woyaobidInput })
    if (data.code === 200) {
      ElMessage.success(`Cookie 已保存 (${data.data.count} 条)`)
      bidSettingsDlg.woyaobidInput = ''
      const { data: d2 } = await request.get('/bid-agent/woyaobid-cookies')
      if (d2.code === 200) bidSettingsDlg.woyaobid = d2.data
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '保存失败')
  }
  bidSettingsDlg.woyaobidSaving = false
}
async function autoWoyaobidLogin() {
  bidSettingsDlg.woyaobidLogging = true
  try {
    const { data } = await request.post('/bid-agent/woyaobid-login', {}, { timeout: 3 * 60 * 1000 })
    if (data.code === 200) {
      ElMessage.success(`登录成功！已自动保存 ${data.data.count} 条 Cookie`)
      const { data: d2 } = await request.get('/bid-agent/woyaobid-cookies')
      if (d2.code === 200) bidSettingsDlg.woyaobid = d2.data
    } else {
      ElMessage.warning(data.message || '登录失败')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '自动登录失败，请检查 Playwright 是否安装或尝试手动输入')
  }
  bidSettingsDlg.woyaobidLogging = false
}

// ── 智能客服系统 ──
const csEditDlg = reactive({ visible: false, url: '', saving: false })

async function loadCustomerServiceUrl() {
  try {
    const { data } = await request.get('/customer-service/url')
    csEditDlg.url = data.data?.url || ''
  } catch { csEditDlg.url = '' }
}

async function saveCustomerServiceUrl() {
  csEditDlg.saving = true
  try {
    await request.put('/customer-service/url', { url: csEditDlg.url })
    ElMessage.success('已保存')
    csEditDlg.visible = false
  } catch { ElMessage.error('保存失败') }
  csEditDlg.saving = false
}

function openCustomerServiceChat() {
  if (!csUrlCache.value) {
    loadAndOpenCustomerService()
  } else {
    window.open(csUrlCache.value, '_blank')
  }
}

const csUrlCache = ref('')

async function loadAndOpenCustomerService() {
  try {
    const { data } = await request.get('/customer-service/url')
    const url = data.data?.url
    if (url) {
      csUrlCache.value = url
      window.open(url, '_blank')
    } else {
      ElMessage.warning('请先设置智能客服链接')
      csEditDlg.visible = true
      loadCustomerServiceUrl()
    }
  } catch {
    ElMessage.warning('请先设置智能客服链接')
    csEditDlg.visible = true
  }
}

function openCustomerServiceSettings() {
  window.open('https://yuanqi.tencent.com/', '_blank')
}

onMounted(() => { loadAgents(); loadKB() })
</script>

<style scoped>
.page-container { padding: 20px 24px; height: 100%; overflow-y: auto; background: #fafafe; }
.page-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.page-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }

/* stats */
.stat-row { display: flex; gap: 12px; margin-bottom: 20px; }
.stat-card {
  flex: 1;
  display: flex; align-items: center; gap: 12px;
  background: rgba(255,255,255,.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(124,58,237,.12);
  border-radius: 12px;
  padding: 12px 18px;
  transition: all .3s;
}
.stat-card:hover {
  background: rgba(255,255,255,.85);
  border-color: color-mix(in srgb, var(--glow, #7c3aed) 40%, transparent);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--glow, #7c3aed) 10%, transparent);
  transform: translateY(-1px);
}
.stat-icon {
  width: 38px; height: 38px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--glow, #7c3aed) 12%, transparent);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  color: var(--glow, #7c3aed);
}
.stat-num {
  font-size: 22px; font-weight: 700; color: #303133; line-height: 1;
}
.stat-label {
  font-size: 12px; color: #909399; margin-left: auto;
}
.agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
.agent-card {
  background: #fff; border: 1px solid #f0ecfc; border-radius: 16px; padding: 24px;
  transition: all 0.25s; display: flex; flex-direction: column;
  box-shadow: 0 1px 4px rgba(139, 92, 246, 0.04);
}
.agent-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(139, 92, 246, 0.1); border-color: #c4b5fd; }
.agent-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.agent-icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #fff; }
.agent-emoji { font-size: 28px; }
.agent-name { font-size: 17px; font-weight: 600; color: #4a3f5e; margin-bottom: 8px; }
.agent-desc { font-size: 13px; color: #b8aad0; line-height: 1.5; margin-bottom: 12px; flex: 1; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.agent-meta { margin-bottom: 16px; display: flex; flex-direction: column; gap: 2px; }
.agent-id { font-size: 11px; color: #d0c8e0; font-family: monospace; }
.agent-base { font-size: 11px; color: #b8aad0; }
.agent-action { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }

/* 技能复选框列表 */
.skill-check-list { max-height: 50vh; overflow-y: auto; }
.skill-check-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px 14px; border-radius: 8px; cursor: pointer;
  transition: background .15s;
}
.skill-check-item:hover { background: #f8f7ff; }
.skill-check-item.checked { background: #f5f3ff; }
.sci-body { flex: 1; min-width: 0; }
.sci-name { font-size: 14px; font-weight: 600; color: #4a3f5e; }
.sci-desc { font-size: 12px; color: #909399; margin-top: 2px; }

.browse-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px; transition: background .15s;
}
.browse-item:hover { background: #f5f3ff; }

/* ── 添加/编辑对话框 ── */
.agent-dlg { display: flex; gap: 24px; }
.agent-dlg-form { flex: 1; min-width: 0; overflow-y: auto; max-height: 65vh; padding-right: 4px; }
.agent-dlg-preview { width: 220px; flex-shrink: 0; }
.preview-label { font-size: 11px; color: #b8aad0; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; text-align: center; }

/* 预览卡片（缩小版） */
.agent-card.mini { padding: 16px; border-radius: 12px; }
.agent-card.mini .agent-icon { width: 40px; height: 40px; border-radius: 10px; }
.agent-card.mini .agent-emoji { font-size: 22px; }
.agent-card.mini .agent-name { font-size: 14px; margin-bottom: 4px; }
.agent-card.mini .agent-desc { font-size: 11px; margin-bottom: 8px; -webkit-line-clamp: 2; }
.agent-card.mini .agent-meta { margin-bottom: 0; }
.agent-card.mini .agent-header { margin-bottom: 10px; }

/* 外观设置 */
.look-row { display: flex; gap: 12px; }
.look-col { flex: 1; min-width: 0; }
.look-label { font-size: 11px; color: #909399; margin-bottom: 4px; }
.icon-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.icon-cell {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; cursor: pointer; color: #909399; border: 1px solid transparent;
  transition: all .15s;
}
.icon-cell:hover { color: #7c3aed; background: #f5f3ff; }
.icon-cell.sel { color: #7c3aed; background: #ede9fe; border-color: #7c3aed; }
.emoji-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.emoji-cell {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; cursor: pointer; font-size: 18px; border: 1px solid transparent;
  transition: all .15s;
}
.emoji-cell:hover { background: #f5f3ff; }
.emoji-cell.sel { background: #ede9fe; border-color: #7c3aed; }
.folder-list { width: 100%; }
.folder-row { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }

/* bid settings dialog */
.bid-route-card {
  background: #fafafe; border: 1px solid #f0ecfc; border-radius: 10px;
  padding: 14px 18px; margin-bottom: 10px;
}
.brc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.brc-name { font-size: 15px; font-weight: 600; color: #4a3f5e; }
.brc-desc { font-size: 12px; color: #909399; }
.brc-interval { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: #4a3f5e; }
.bid-time-filter { display: flex; gap: 8px; margin-bottom: 14px; }
.bid-summary-row { display: flex; gap: 12px; }
.bid-summary-card {
  flex: 1; text-align: center;
  background: #fafafe; border: 1px solid #f0ecfc; border-radius: 10px;
  padding: 16px 12px;
}
.bsc-num { font-size: 28px; font-weight: 700; color: #7c3aed; }
.bsc-label { font-size: 12px; color: #909399; margin-top: 4px; }
.bid-latest-item {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 0; border-bottom: 1px solid #f5f3ff;
  font-size: 13px;
}
.bli-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #4a3f5e; }
.bli-source { font-size: 11px; color: #b8aad0; flex-shrink: 0; }
.bid-txt-file {
  display: flex; align-items: center; gap: 10px;
  padding: 4px 0; font-size: 12px; color: #4a3f5e;
}
.woyaobid-status { display: flex; align-items: center; gap: 8px; font-size: 16px; }
</style>
