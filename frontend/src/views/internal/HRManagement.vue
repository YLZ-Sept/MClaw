<template>
  <div class="pg">
    <div class="pg-hd">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><el-button text @click="router.push('/internal')"><el-icon><ArrowLeft/></el-icon></el-button><span class="pg-title" style="margin-bottom:0">人力资源管理</span></div>
      <div class="kpi-row">
        <div class="kpi" v-for="k in kpis" :key="k.label"><div class="kpi-val">{{ k.val }}</div><div class="kpi-lbl">{{ k.label }}</div></div>
      </div>
    </div>
    <div class="pg-body">
      <el-menu :default-active="tab" class="side-tabs" @select="t=>tab=t">
        <el-menu-item index="departments">组织架构</el-menu-item>
        <el-menu-item index="employees">员工档案</el-menu-item>
        <el-menu-item index="attReport">考勤月报</el-menu-item>
        <el-menu-item index="performance">绩效管理</el-menu-item>
        <el-menu-item index="recruitment">招聘管理</el-menu-item>
      </el-menu>
      <div class="tab-content">
        <!-- 员工档案 -->
        <div v-if="tab==='employees'">
          <div class="tb"><el-button type="primary" @click="openEmp()">新增员工</el-button><el-button @click="handleExport('employees')">导出</el-button><el-button @click="handleImport('employees')">导入</el-button></div>
          <el-table v-loading="loading" :data="employees" stripe border row-key="id"><el-table-column type="index" label="#" width="50"/><el-table-column prop="name" label="姓名" width="80"/><el-table-column prop="gender" label="性别" width="60"/><el-table-column prop="department" label="部门" width="100"/><el-table-column prop="role" label="职位" width="100"/><el-table-column prop="phone" label="电话" width="130"/><el-table-column prop="hire_date" label="入职时间" width="110"/><el-table-column prop="contract_end" label="合同到期" width="110"/><el-table-column prop="email" label="邮箱" min-width="150"/><el-table-column label="操作" width="120"><template #default="{row}"><el-button size="small" type="primary" link @click="openEmp(row)">编辑</el-button><el-button size="small" type="danger" link @click="delEmp(row.id)">删除</el-button></template></el-table-column></el-table>
        </div>
        <!-- 组织架构 -->
        <div v-else-if="tab==='departments'">
          <div class="tb" style="flex-wrap:wrap;gap:6px">
            <el-upload :auto-upload="false" :limit="1" :accept="orgChartFormats" :on-change="onOrgChartFile" :show-file-list="false">
              <el-button type="primary">上传架构图</el-button>
            </el-upload>
            <span class="upload-hint">支持 PNG/JPG/PDF/PPT/DOCX/VSDX/XLSX</span>
            <el-button @click="showDepDlg=true" style="margin-left:auto">新增部门</el-button>
          </div>
          <!-- 架构图网格 -->
          <div v-if="orgCharts.length" class="oc-grid">
            <div v-for="oc in orgCharts" :key="oc.id" class="oc-card">
              <div class="oc-thumb" @click="viewOrgChart(oc)">
                <img v-if="isImageType(oc.file_type)" :src="orgChartApi.previewUrl(oc.id)" class="oc-img" />
                <div v-else class="oc-icon-box">
                  <span class="oc-icon">{{ fileTypeIcon(oc.file_type) }}</span>
                  <span class="oc-ext">.{{ oc.file_type }}</span>
                </div>
              </div>
              <div class="oc-body">
                <div class="oc-title" :title="oc.title">{{ oc.title }}</div>
                <div class="oc-meta">{{ fmtSize(oc.file_size) }} · {{ oc.created_at?.slice(0,10) }}</div>
                <div class="oc-actions">
                  <el-button size="small" text type="primary" @click="viewOrgChart(oc)">查看</el-button>
                  <el-button size="small" text @click="window.open(orgChartApi.downloadUrl(oc.id))">下载</el-button>
                  <el-button v-if="oc.file_type==='xlsx'||oc.file_type==='xls'" size="small" text type="success" @click="importDeptsFromOrgChart(oc)">导入为部门</el-button>
                  <el-button size="small" text type="danger" @click="delOrgChart(oc.id)">删除</el-button>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无架构图，上传一个吧" :image-size="80"/>
          <!-- 部门表格 -->
          <el-divider v-if="departments.length" content-position="left">部门列表</el-divider>
          <el-table v-if="departments.length" :data="departments" stripe border row-key="id" style="margin-top:8px">
            <el-table-column type="index" label="#" width="50"/>
            <el-table-column prop="name" label="部门名" width="140"/>
            <el-table-column prop="manager_name" label="负责人" width="100"/>
            <el-table-column label="操作" width="100">
              <template #default="{row}"><el-button size="small" type="danger" link @click="delDep(row.id)">删除</el-button></template>
            </el-table-column>
          </el-table>
        </div>
        <!-- 考勤月报 -->
        <div v-else-if="tab==='attReport'">
          <div class="tb">
            <el-select v-model="rptMonth" style="width:130px" @change="loadReports"><el-option v-for="m in monthOptions" :key="m" :label="m" :value="m"/></el-select>
            <el-button @click="loadReports" style="margin-left:8px">查询</el-button>
            <el-upload :auto-upload="false" :limit="1" accept=".xlsx,.xls" :on-change="onAttReportFile" :show-file-list="false" style="margin-left:8px">
              <el-button>导入Excel</el-button>
            </el-upload>
            <el-button @click="window.open(attendanceApi.exportUrl(rptMonth))" style="margin-left:4px" :disabled="!reportData.length">导出</el-button>
            <span v-if="attImportMsg" style="font-size:12px;color:#7c3aed;margin-left:8px">{{ attImportMsg }}</span>
          </div>
          <el-table v-loading="loading" :data="reportData" stripe border row-key="id" style="width:100%">
            <el-table-column type="index" label="#" width="40" fixed="left"/>
            <el-table-column prop="employee_name" label="姓名" width="70" fixed="left"/>
            <el-table-column prop="department" label="部门" width="90"/>
            <el-table-column prop="position" label="职务" width="90"/>
            <el-table-column label="考勤概况" header-align="center">
              <el-table-column prop="should_work_days" label="应出勤" width="65"/>
              <el-table-column prop="actual_work_days" label="实际" width="55"/>
              <el-table-column prop="rest_days" label="休息" width="55"/>
              <el-table-column prop="normal_days" label="正常" width="55"/>
              <el-table-column prop="abnormal_days" label="异常" width="55"/>
              <el-table-column prop="standard_hours" label="标准(h)" width="65"/>
              <el-table-column prop="actual_hours" label="实际(h)" width="65"/>
            </el-table-column>
            <el-table-column label="异常统计" header-align="center">
              <el-table-column prop="late_count" label="迟到次" width="60"/>
              <el-table-column prop="late_minutes" label="迟到分" width="60"/>
              <el-table-column prop="absent_count" label="旷工次" width="60"/>
              <el-table-column prop="absent_minutes" label="旷工分" width="60"/>
              <el-table-column prop="missing_clock_count" label="缺卡" width="45"/>
              <el-table-column prop="location_abnormal" label="地点异" width="55"/>
            </el-table-column>
            <el-table-column label="假勤统计" header-align="center">
              <el-table-column prop="out_hours" label="外出(h)" width="65"/>
              <el-table-column prop="travel_days" label="出差" width="50"/>
              <el-table-column prop="personal_leave" label="事假" width="50"/>
              <el-table-column prop="sick_leave" label="病假" width="50"/>
              <el-table-column prop="comp_leave" label="调休" width="50"/>
              <el-table-column prop="annual_leave" label="年假" width="50"/>
              <el-table-column prop="other_leave" label="其他" width="50"/>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{row}"><el-button size="small" type="primary" link @click="openAttEdit(row)">编辑</el-button><el-button size="small" type="danger" link @click="delAttReport(row.id)">删</el-button></template>
            </el-table-column>
          </el-table>
        </div>
        <!-- 绩效管理 -->
        <div v-else-if="tab==='performance'">
          <div class="tb" style="margin-bottom:2px">
            <el-radio-group v-model="perfTab" size="small" @change="loadPerfData">
              <el-radio-button value="finance">财务</el-radio-button>
              <el-radio-button value="tech">商务/技术中心</el-radio-button>
              <el-radio-button value="monthly">月度考核</el-radio-button>
            </el-radio-group>
          </div>
          <div class="tb">
            <el-select v-model="perfMonth" style="width:130px" @change="loadPerfData"><el-option v-for="m in monthOptions" :key="m" :label="m" :value="m"/></el-select>
            <el-button @click="loadPerfData" style="margin-left:8px">查询</el-button>
            <el-upload v-if="perfTab!=='monthly'" :auto-upload="false" :limit="1" accept=".xlsx,.xls" :on-change="onPerfFile" :show-file-list="false" style="margin-left:8px">
              <el-button type="primary">导入</el-button>
            </el-upload>
            <el-button v-if="perfTab==='monthly'" type="success" @click="aggregateMonthly" :loading="aggregating" style="margin-left:8px">汇总</el-button>
            <el-button @click="window.open(performanceApi.exportUrl(perfMonth, perfTab))" style="margin-left:4px" :disabled="!perfData.length">导出</el-button>
            <span v-if="perfMsg" style="font-size:12px;color:#7c3aed;margin-left:8px">{{ perfMsg }}</span>
          </div>
          <el-table v-loading="loading" :data="perfData" stripe border row-key="id" style="width:100%">
            <el-table-column type="index" label="序号" width="50" fixed="left"/>
            <el-table-column prop="employee_name" label="姓名" width="75" fixed="left"/>
            <el-table-column prop="department" label="部门" width="100"/>
            <el-table-column prop="position" label="职位" width="100"/>
            <el-table-column v-if="perfTab!=='monthly'" v-for="(d,di) in perfDynDims" :key="'d'+di" :label="d.name+'('+d.weight+'%)'" min-width="110">
              <template #default="{row}">
                <span>{{ row.dims?.find(x=>x.name===d.name)?.score ?? '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="total_score" label="总分" width="70">
              <template #default="{row}"><b :style="{color:row.total_score>=80?'#7c3aed':'#f56c6c'}">{{ row.total_score }}</b></template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{row}"><el-button size="small" type="primary" link @click="openPerfEdit(row)">编辑</el-button><el-button size="small" type="danger" link @click="delPerfReport(row.id)">删</el-button></template>
            </el-table-column>
          </el-table>
        </div>
        <!-- 招聘管理 — 每周招聘数据统计 -->
        <div v-else-if="tab==='recruitment'">
          <div class="tb">
            <el-select v-model="statsWeek" placeholder="选择周期" clearable style="width:220px" @change="loadStats">
              <el-option v-for="w in statsWeeks" :key="w.week_start" :label="w.week_start + ' ~ ' + w.week_end" :value="w.week_start"/>
            </el-select>
            <el-button type="primary" @click="openStatsDlg()" style="margin-left:8px">新增记录</el-button>
            <el-upload :http-request="handleStatsImport" :show-file-list="false" accept=".xlsx,.xls" style="display:inline-block;margin-left:8px">
              <el-button>导入 Excel</el-button>
            </el-upload>
            <el-button @click="exportStats" style="margin-left:4px">导出 Excel</el-button>
            <el-button v-if="statsWeek" type="danger" plain @click="delStatsWeek" style="margin-left:4px">删除本周</el-button>
          </div>
          <el-table v-loading="statsLoading" :data="statsData" stripe border row-key="id">
            <el-table-column type="index" label="序号" width="55"/>
            <el-table-column prop="position" label="岗位名称" width="130"/>
            <el-table-column prop="new_resumes" label="新增简历数" width="100"/>
            <el-table-column prop="valid_resumes" label="有效简历数" width="100"/>
            <el-table-column prop="resume_valid_rate" label="简历有效率(%)" width="110"/>
            <el-table-column prop="initial_screen_notify" label="初筛通知数" width="100"/>
            <el-table-column prop="initial_screen_attend" label="初筛到场数" width="100"/>
            <el-table-column prop="second_interview_notify" label="复试通知数" width="100"/>
            <el-table-column prop="second_interview_attend" label="复试到场数" width="100"/>
            <el-table-column prop="second_interview_pass_rate" label="复试通过率(%)" width="110"/>
            <el-table-column prop="offer_count" label="offer发放数" width="100"/>
            <el-table-column prop="onboard_count" label="入职人数" width="85"/>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{row}"><el-button size="small" type="primary" link @click="openStatsDlg(row)">编辑</el-button><el-button size="small" type="danger" link @click="delStats(row.id)">删除</el-button></template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!statsLoading && statsData.length===0" description="暂无数据，请选择周期或新增记录" :image-size="80"/>
        </div>
        <!-- 招聘统计编辑对话框 -->
        <el-dialog v-model="statsDlg.visible" :title="statsDlg.ed?'编辑统计记录':'新增统计记录'" width="680px">
          <el-form :model="statsDlg.form" label-width="110px">
            <el-form-item label="统计周期">
              <el-date-picker v-model="statsDlg.weekRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width:100%"/>
            </el-form-item>
            <el-form-item label="岗位名称" required><el-input v-model="statsDlg.form.position" placeholder="必填"/></el-form-item>
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item label="新增简历数"><el-input-number v-model="statsDlg.form.new_resumes" :min="0" style="width:100%" controls-position="right"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="有效简历数"><el-input-number v-model="statsDlg.form.valid_resumes" :min="0" style="width:100%" controls-position="right"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="简历有效率(%)"><el-input-number v-model="statsDlg.form.resume_valid_rate" :min="0" :max="100" :precision="1" style="width:100%" controls-position="right"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="初筛通知数"><el-input-number v-model="statsDlg.form.initial_screen_notify" :min="0" style="width:100%" controls-position="right"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="初筛到场数"><el-input-number v-model="statsDlg.form.initial_screen_attend" :min="0" style="width:100%" controls-position="right"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="复试通知数"><el-input-number v-model="statsDlg.form.second_interview_notify" :min="0" style="width:100%" controls-position="right"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="复试到场数"><el-input-number v-model="statsDlg.form.second_interview_attend" :min="0" style="width:100%" controls-position="right"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="复试通过率(%)"><el-input-number v-model="statsDlg.form.second_interview_pass_rate" :min="0" :max="100" :precision="1" style="width:100%" controls-position="right"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="offer发放数"><el-input-number v-model="statsDlg.form.offer_count" :min="0" style="width:100%" controls-position="right"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="入职人数"><el-input-number v-model="statsDlg.form.onboard_count" :min="0" style="width:100%" controls-position="right"/></el-form-item></el-col>
            </el-row>
          </el-form>
          <template #footer><el-button @click="statsDlg.visible=false">取消</el-button><el-button type="primary" @click="saveStats">保存</el-button></template>
        </el-dialog>
        <!-- 招聘统计导入预览 -->
        <el-dialog v-model="statsImportDlg.visible" title="导入预览" width="900px" top="3vh">
          <div style="margin-bottom:10px;display:flex;gap:12px;align-items:center">
            <el-button size="small" @click="statsImportDlg.items.forEach(it=>it._checked=true)">全选</el-button>
            <el-button size="small" @click="statsImportDlg.items.forEach(it=>it._checked=false)">全不选</el-button>
            <span style="color:#b8aad0;font-size:12px">已选 {{ statsImportDlg.items.filter(it=>it._checked!==false).length }} / {{ statsImportDlg.items.length }} 条</span>
          </div>
          <el-table :data="statsImportDlg.items" stripe border row-key="_idx" max-height="400">
            <el-table-column prop="_checked" label="导入" width="55" align="center">
              <template #default="{row}"><el-checkbox v-model="row._checked" size="small"/></template>
            </el-table-column>
            <el-table-column prop="position" label="岗位名称" width="130">
              <template #default="{row}"><el-input v-model="row.position" size="small" :disabled="row._checked===false"/></template>
            </el-table-column>
            <el-table-column prop="new_resumes" label="新增简历" width="85"/>
            <el-table-column prop="valid_resumes" label="有效简历" width="85"/>
            <el-table-column prop="resume_valid_rate" label="有效率(%)" width="85"/>
            <el-table-column prop="initial_screen_notify" label="初筛通知" width="85"/>
            <el-table-column prop="initial_screen_attend" label="初筛到场" width="85"/>
            <el-table-column prop="second_interview_notify" label="复试通知" width="85"/>
            <el-table-column prop="second_interview_attend" label="复试到场" width="85"/>
            <el-table-column prop="second_interview_pass_rate" label="复试通过率(%)" width="100"/>
            <el-table-column prop="offer_count" label="offer" width="65"/>
            <el-table-column prop="onboard_count" label="入职" width="60"/>
          </el-table>
          <template #footer>
            <el-button @click="statsImportDlg.visible=false">取消</el-button>
            <el-button type="primary" :loading="statsImporting" @click="doStatsBatchImport">确认导入 ({{ statsImportDlg.items.filter(it=>it._checked!==false).length }})</el-button>
          </template>
        </el-dialog>
        <!-- 导入预览对话框 -->
        <el-dialog v-model="perfPreviewDlg" title="导入预览" width="850px">
          <p style="margin-bottom:12px;font-size:13px;color:#7c3aed">已解析 {{ perfPreview.dims?.length || 0 }} 个维度，{{ perfPreview.records?.length || 0 }} 条记录</p>
          <el-table v-if="perfPreview.records?.length" :data="perfPreview.records" stripe border size="small" max-height="400">
            <el-table-column type="index" label="#" width="35"/>
            <el-table-column prop="employee_name" label="姓名" width="75"/>
            <el-table-column prop="department" label="部门" width="85"/>
            <el-table-column v-for="(d,di) in (perfPreview.dims||[])" :key="'pd'+di" :label="d.name" width="85">
              <template #default="{row}">{{ row.dims?.find(x=>x.name===d.name)?.score ?? '-' }}</template>
            </el-table-column>
            <el-table-column prop="total_score" label="总分" width="55"><template #default="{row}"><b :style="{color:row.total_score>=80?'#7c3aed':'#f56c6c'}">{{ row.total_score }}</b></template></el-table-column>
          </el-table>
          <template #footer><el-button @click="perfPreviewDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="confirmPerfImport">确认导入</el-button></template>
        </el-dialog>
        <!-- 绩效编辑对话框 -->
        <el-dialog v-model="showPerfDlg" title="编辑考核记录" width="550px">
          <el-form :model="perfEditForm" label-width="90px">
            <el-form-item label="姓名"><el-input v-model="perfEditForm.employee_name"/></el-form-item>
            <el-form-item label="部门"><el-input v-model="perfEditForm.department"/></el-form-item>
            <el-form-item label="职位"><el-input v-model="perfEditForm.position"/></el-form-item>
            <el-divider content-position="left">维度评分</el-divider>
            <el-row :gutter="12">
              <el-col :span="8" v-for="(d,i) in (perfEditForm.dims||[])" :key="'ed'+i">
                <el-form-item :label="d.name+'('+d.weight+'%)'">
                  <el-input-number v-model="d.score" :min="0" :max="d.weight*1.5" controls-position="right" style="width:100%"/>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <template #footer><el-button @click="showPerfDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="savePerf">保存</el-button></template>
        </el-dialog>
      </div>
    </div>
    <!-- 员工对话框 -->
    <el-dialog v-model="showEmpDlg" :title="empEdit?'编辑员工':'新增员工'" width="500px"><el-form :model="empForm" label-width="80px"><el-form-item label="姓名"><el-input v-model="empForm.name"/></el-form-item><el-form-item label="性别"><el-select v-model="empForm.gender" style="width:100%"><el-option label="男" value="男"/><el-option label="女" value="女"/></el-select></el-form-item><el-form-item label="部门"><el-input v-model="empForm.department"/></el-form-item><el-form-item label="职位"><el-input v-model="empForm.role"/></el-form-item><el-form-item label="电话"><el-input v-model="empForm.phone"/></el-form-item><el-form-item label="入职时间"><el-input v-model="empForm.hire_date" placeholder="如 2025.1.1"/></el-form-item><el-form-item label="合同到期"><el-input v-model="empForm.contract_end" placeholder="如 2030.6.30"/></el-form-item><el-form-item label="邮箱"><el-input v-model="empForm.email"/></el-form-item></el-form><template #footer><el-button @click="showEmpDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveEmp">保存</el-button></template></el-dialog>
    <!-- 部门对话框 -->
    <el-dialog v-model="showDepDlg" title="新增部门" width="400px"><el-form :model="depForm" label-width="80px"><el-form-item label="部门名"><el-input v-model="depForm.name"/></el-form-item></el-form><template #footer><el-button @click="showDepDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveDep">保存</el-button></template></el-dialog>
    <!-- 考勤编辑对话框 -->
    <el-dialog v-model="showAttDlg" title="编辑考勤月报" width="600px">
      <el-form :model="attForm" label-width="90px">
        <el-form-item label="姓名"><el-input v-model="attForm.employee_name"/></el-form-item>
        <el-form-item label="部门"><el-input v-model="attForm.department"/></el-form-item>
        <el-form-item label="职务"><el-input v-model="attForm.position"/></el-form-item>
        <el-divider content-position="left">考勤概况</el-divider>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="应出勤"><el-input-number v-model="attForm.should_work_days" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="实际"><el-input-number v-model="attForm.actual_work_days" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="休息"><el-input-number v-model="attForm.rest_days" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="正常"><el-input-number v-model="attForm.normal_days" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="异常"><el-input-number v-model="attForm.abnormal_days" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="标准(h)"><el-input-number v-model="attForm.standard_hours" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="实际(h)"><el-input-number v-model="attForm.actual_hours" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
        </el-row>
        <el-divider content-position="left">异常统计</el-divider>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="迟到次"><el-input-number v-model="attForm.late_count" :min="0" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="迟到分"><el-input-number v-model="attForm.late_minutes" :min="0" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="旷工次"><el-input-number v-model="attForm.absent_count" :min="0" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="旷工分"><el-input-number v-model="attForm.absent_minutes" :min="0" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="缺卡"><el-input-number v-model="attForm.missing_clock_count" :min="0" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="地点异"><el-input-number v-model="attForm.location_abnormal" :min="0" controls-position="right" style="width:100%"/></el-form-item></el-col>
        </el-row>
        <el-divider content-position="left">假勤统计</el-divider>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="外出(h)"><el-input-number v-model="attForm.out_hours" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="出差"><el-input-number v-model="attForm.travel_days" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="事假"><el-input-number v-model="attForm.personal_leave" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="病假"><el-input-number v-model="attForm.sick_leave" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="调休"><el-input-number v-model="attForm.comp_leave" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="年假"><el-input-number v-model="attForm.annual_leave" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="其他"><el-input-number v-model="attForm.other_leave" :min="0" :step="0.5" controls-position="right" style="width:100%"/></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer><el-button @click="showAttDlg=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveAtt">保存</el-button></template>
    </el-dialog>
    <ImportDialog v-model="importVisible" :ioKey="importKey" @done="onImportDone" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { employeeApi, departmentApi, attendanceApi, performanceApi, orgChartApi, recruitmentStatsApi } from '../../api/hr'
import ImportDialog from '../../components/ImportDialog.vue'
const router = useRouter()

const tab = ref('departments')
const importVisible = ref(false)
const importKey = ref('')
function handleImport(key) { importKey.value = key; importVisible.value = true }
function handleExport(key, params) { window.open(`/api/io/${key}/export` + (params ? '?' + new URLSearchParams(params).toString() : '')) }
function onImportDone() { reload() }
const employees = ref([]), departments = ref([]), orgCharts = ref([])
const kpis = computed(() => [
  { val: employees.value.length, label: '在职员工' },
  { val: departments.value.length, label: '部门数' },
  { val: perfData.value.length, label: '当月考核' }
])

// 员工
const showEmpDlg = ref(false), empEdit = ref(false), empForm = ref({})
function openEmp(r) { empEdit.value = !!r; empForm.value = r ? { ...r } : {}; showEmpDlg.value = true }
async function saveEmp() { const f = empForm.value; empEdit.value ? await employeeApi.update(f.id, f) : await employeeApi.create(f); showEmpDlg.value = false; await reload(); ElMessage.success('OK') }
async function delEmp(id) { await ElMessageBox.confirm('确认?'); await employeeApi.remove(id); await reload() }

// 部门
const showDepDlg = ref(false), depForm = ref({})
async function saveDep() { await departmentApi.create(depForm.value); showDepDlg.value = false; depForm.value = {}; await reload(); ElMessage.success('OK') }
async function delDep(id) { await departmentApi.remove(id); await reload() }

// 组织架构图
const orgChartFormats = '.png,.jpg,.jpeg,.gif,.bmp,.tiff,.pdf,.ppt,.pptx,.doc,.docx,.vsdx,.xlsx,.xls'
const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff']
function isImageType(ext) { return imageExts.includes(ext) }
function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}
function fileTypeIcon(ext) {
  const map = { pdf: 'PDF', ppt: 'PPT', pptx: 'PPT', doc: 'DOC', docx: 'DOC', vsdx: 'VSD', xlsx: 'XLS', xls: 'XLS' }
  return map[ext] || ext.toUpperCase()
}

async function loadOrgCharts() {
  try { orgCharts.value = (await orgChartApi.list()).data.data } catch {}
}

async function onOrgChartFile(file) {
  const fd = new FormData()
  fd.append('file', file.raw)
  fd.append('title', file.name.replace(/\.[^.]+$/, ''))
  try {
    await orgChartApi.upload(fd)
    ElMessage.success('上传成功')
    await loadOrgCharts()
  } catch (e) {
    ElMessage.error('上传失败: ' + (e.response?.data?.message || e.message))
  }
}

function viewOrgChart(oc) { window.open(orgChartApi.previewUrl(oc.id), '_blank') }

async function delOrgChart(id) {
  try { await ElMessageBox.confirm('确认删除？'); await orgChartApi.remove(id); await loadOrgCharts(); ElMessage.success('已删除') } catch {}
}

async function importDeptsFromOrgChart(oc) {
  try { await ElMessageBox.confirm('将用此 Excel 文件的数据覆盖导入部门表，确认？') } catch { return }
  try {
    // 下载文件并重新上传到 import-departments 端点
    const res = await fetch(orgChartApi.downloadUrl(oc.id))
    const blob = await res.blob()
    const fd = new FormData()
    fd.append('file', blob, oc.title + '.' + oc.file_type)
    const r = await orgChartApi.importDepartments(fd)
    ElMessage.success(`成功导入 ${r.data.data.imported} 个部门`)
    await reload()
  } catch (e) {
    ElMessage.error('导入失败: ' + (e.response?.data?.message || e.message))
  }
}

// 考勤月报 V2
const rptMonth = ref(new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0'))
const reportData = ref([])
const attImportMsg = ref('')
const monthOptions = computed(() => {
  const opts = []; const now = new Date();
  for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth()-i, 1); opts.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); }
  return opts;
})

async function loadReports() {
  try { reportData.value = (await attendanceApi.reports({ month: rptMonth.value })).data.data } catch {}
}

async function onAttReportFile(file) {
  attImportMsg.value = '导入中...'
  try {
    const fd = new FormData(); fd.append('file', file.raw); fd.append('month', rptMonth.value)
    const r = await attendanceApi.importReports(fd)
    attImportMsg.value = `成功导入 ${r.data.data.imported} 条`
    await loadReports()
  } catch (e) { ElMessage.error('导入失败: ' + (e.response?.data?.message || e.message)); attImportMsg.value = '' }
}

async function delAttReport(id) {
  try { await ElMessageBox.confirm('确认删除？'); await attendanceApi.deleteReport(id); await loadReports(); ElMessage.success('已删除') } catch {}
}

// 考勤编辑
const showAttDlg = ref(false), attForm = ref({})
function openAttEdit(r) { attForm.value = { ...r }; showAttDlg.value = true }
async function saveAtt() {
  const f = attForm.value
  await attendanceApi.updateReport(f.id, f)
  showAttDlg.value = false
  await loadReports()
  ElMessage.success('已更新')
}

// 绩效考核 — 三子模块：财务 / 商务技术中心 / 月度考核
const perfTab = ref('finance')
const perfMonth = ref(new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0'))
const perfData = ref([])
const perfMsg = ref('')
const aggregating = ref(false)

const perfDynDims = computed(() => {
  const set = new Map()
  perfData.value.forEach(r => (r.dims || []).forEach(d => { if (!set.has(d.name)) set.set(d.name, d.weight) }))
  return [...set].map(([name, weight]) => ({ name, weight }))
})

async function loadPerfData() {
  try { perfData.value = (await performanceApi.reports({ month: perfMonth.value, category: perfTab.value })).data.data } catch {}
}

// 导入预览
const perfPreviewDlg = ref(false), perfPreview = ref({ dims: [], records: [], category: '' })

async function onPerfFile(file) {
  perfMsg.value = '解析中...'
  try {
    const fd = new FormData(); fd.append('file', file.raw); fd.append('month', perfMonth.value); fd.append('category', perfTab.value)
    const r = await performanceApi.importPreview(fd)
    perfPreview.value = r.data.data
    perfPreviewDlg.value = true
    perfMsg.value = ''
  } catch (e) { ElMessage.error('解析失败: ' + (e.response?.data?.message || e.message)); perfMsg.value = '' }
}

async function confirmPerfImport() {
  saving.value = true
  try {
    const r = await performanceApi.batchInsert({ month: perfMonth.value, category: perfTab.value, records: perfPreview.value.records })
    ElMessage.success(`成功导入 ${r.data.data.imported} 条`)
    perfPreviewDlg.value = false
    perfMsg.value = `导入 ${r.data.data.imported} 条`
    await loadPerfData()
  } catch (e) { ElMessage.error('导入失败: ' + (e.response?.data?.message || e.message)) }
  saving.value = false
}

async function aggregateMonthly() {
  aggregating.value = true; perfMsg.value = ''
  try {
    const r = await performanceApi.aggregate(perfMonth.value)
    ElMessage.success(`汇总完成，共 ${r.data.data.aggregated} 人`)
    perfMsg.value = `已汇总 ${r.data.data.aggregated} 人`
    await loadPerfData()
  } catch (e) { ElMessage.error('汇总失败: ' + (e.response?.data?.message || e.message)) }
  aggregating.value = false
}

async function delPerfReport(id) {
  try { await ElMessageBox.confirm('确认删除？'); await performanceApi.deleteReport(id); await loadPerfData(); ElMessage.success('已删除') } catch {}
}

// 绩效编辑
const showPerfDlg = ref(false), perfEditForm = ref({})
function openPerfEdit(r) {
  perfEditForm.value = { ...r, dims: (r.dims || []).map(d => ({ ...d })) }
  showPerfDlg.value = true
}
async function savePerf() {
  const f = perfEditForm.value
  const total = (f.dims || []).reduce((s, d) => s + (d.score || 0) * (d.weight || 0) / 100, 0)
  f.total_score = Math.round(total * 10) / 10
  await performanceApi.updateReport(f.id, f)
  showPerfDlg.value = false
  await loadPerfData()
  ElMessage.success('已更新')
}

// ─── 招聘管理 — 每周统计 ───
const statsData = ref([]), statsWeeks = ref([]), statsWeek = ref('')
const statsLoading = ref(false), statsImporting = ref(false)
const statsDlg = reactive({ visible: false, ed: false, form: {}, weekRange: null })
const statsImportDlg = reactive({ visible: false, week_start: '', week_end: '', items: [] })

async function loadStatsWeeks() {
  try { statsWeeks.value = (await recruitmentStatsApi.weeks()).data.data } catch {}
}
async function loadStats() {
  statsLoading.value = true
  try { statsData.value = (await recruitmentStatsApi.list({ week_start: statsWeek.value || undefined })).data.data } catch {}
  statsLoading.value = false
}
function openStatsDlg(r) {
  statsDlg.ed = !!r
  if (r) {
    statsDlg.form = { ...r }
    statsDlg.weekRange = [r.week_start, r.week_end]
  } else {
    statsDlg.form = { position: '', new_resumes: 0, valid_resumes: 0, resume_valid_rate: 0, initial_screen_notify: 0, initial_screen_attend: 0, second_interview_notify: 0, second_interview_attend: 0, second_interview_pass_rate: 0, offer_count: 0, onboard_count: 0 }
    statsDlg.weekRange = statsWeek.value ? [statsWeek.value, statsData.value[0]?.week_end || statsWeek.value] : null
  }
  statsDlg.visible = true
}
async function saveStats() {
  const f = statsDlg.form
  if (!f.position) { ElMessage.warning('岗位名称必填'); return }
  if (!statsDlg.weekRange || statsDlg.weekRange.length !== 2) { ElMessage.warning('请选择统计周期'); return }
  f.week_start = statsDlg.weekRange[0]
  f.week_end = statsDlg.weekRange[1]
  if (statsDlg.ed) {
    await recruitmentStatsApi.update(f.id, f)
  } else {
    await recruitmentStatsApi.create(f)
  }
  statsDlg.visible = false
  await loadStats(); await loadStatsWeeks()
  ElMessage.success('OK')
}
async function delStats(id) {
  try { await ElMessageBox.confirm('确认删除？'); await recruitmentStatsApi.remove(id); await loadStats(); await loadStatsWeeks(); ElMessage.success('已删除') } catch {}
}
async function delStatsWeek() {
  try {
    await ElMessageBox.confirm(`确认删除周期 ${statsWeek.value} 的所有记录？`)
    for (const r of statsData.value) { await recruitmentStatsApi.remove(r.id) }
    statsWeek.value = ''
    await loadStats(); await loadStatsWeeks()
    ElMessage.success('已删除')
  } catch {}
}
function exportStats() {
  const token = localStorage.getItem('token')
  const params = new URLSearchParams()
  if (statsWeek.value) params.set('week_start', statsWeek.value)
  params.set('token', token)
  window.open(`/api/recruitment-stats/export?${params.toString()}`)
}
// Excel 导入：解析 → 预览 → 批量写入
async function handleStatsImport(opt) {
  const formData = new FormData()
  formData.append('file', opt.file.raw || opt.file)
  try {
    const res = await recruitmentStatsApi.import(formData)
    const { week_start, week_end, items } = res.data.data
    if (!items.length) { ElMessage.warning('未解析到数据'); return }
    items.forEach((it, i) => { it._idx = i; it._checked = true })
    statsImportDlg.week_start = week_start
    statsImportDlg.week_end = week_end
    statsImportDlg.items = items
    statsImportDlg.visible = true
  } catch (e) {
    ElMessage.error('解析失败: ' + (e.message || '网络错误'))
  }
}
async function doStatsBatchImport() {
  const checked = statsImportDlg.items.filter(it => it._checked !== false)
  if (!checked.length) { ElMessage.warning('请至少选择一条'); return }
  statsImporting.value = true
  try {
    await recruitmentStatsApi.batch({ week_start: statsImportDlg.week_start, week_end: statsImportDlg.week_end, rows: checked })
    ElMessage.success(`导入完成: ${checked.length} 条`)
    statsImportDlg.visible = false
    statsWeek.value = statsImportDlg.week_start
    await loadStats(); await loadStatsWeeks()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '导入失败')
  }
  statsImporting.value = false
}

const saving = ref(false)

async function reload() {
  try { employees.value = (await employeeApi.list()).data.data } catch {}
  try { departments.value = (await departmentApi.list()).data.data } catch {}
  try { orgCharts.value = (await orgChartApi.list()).data.data } catch {}
  try { await loadStatsWeeks() } catch {}
}

const loading = ref(false)
onMounted(async () => {
  loading.value = true
  await reload()
  loading.value = false
})
</script>

<style scoped>
.pg { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.pg-hd { padding: 20px 24px 0; background: #fff; border-bottom: 1px solid #f0ecfc; }
.pg-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.kpi-row { display: flex; gap: 16px; margin-bottom: 16px; margin-top: 12px; }
.kpi { padding: 10px 20px; background: #f8f7ff; border-radius: 10px; text-align: center; min-width: 100px; }
.kpi-val { font-size: 22px; font-weight: 700; color: #7c3aed; }
.kpi-lbl { font-size: 12px; color: #b8aad0; margin-top: 2px; }
.pg-body { flex: 1; display: flex; overflow: hidden; }
.side-tabs { width: 140px; flex-shrink: 0; border-right: 1px solid #f0ecfc; padding-top: 4px; }
.side-tabs .el-menu-item { height: 40px; line-height: 40px; font-size: 13px; }
.tab-content { flex: 1; padding: 16px 24px; overflow-y: auto; }
.tb { margin-bottom: 12px; display: flex; align-items: center; }
.upload-hint { font-size: 11px; color: #b8aad0; }

/* 组织架构图卡片 */
.oc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.oc-card {
  background: #fff; border: 1px solid #f0ecfc; border-radius: 10px; overflow: hidden;
  transition: all .15s; display: flex; flex-direction: column;
}
.oc-card:hover { border-color: #c4b5fd; box-shadow: 0 2px 8px rgba(124,58,237,.06); }
.oc-thumb {
  height: 140px; background: #f8f7ff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; overflow: hidden;
}
.oc-img { width: 100%; height: 100%; object-fit: cover; }
.oc-icon-box {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.oc-icon { font-size: 36px; font-weight: 700; color: #7c3aed; }
.oc-ext { font-size: 12px; color: #b8aad0; }
.oc-body { padding: 10px 12px 8px; flex: 1; display: flex; flex-direction: column; }
.oc-title { font-size: 13px; font-weight: 600; color: #4a3f5e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-meta { font-size: 11px; color: #b8aad0; margin-top: 2px; }
.oc-actions { display: flex; gap: 2px; margin-top: 6px; flex-wrap: wrap; }
</style>
