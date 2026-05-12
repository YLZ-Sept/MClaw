<template>
  <div class="page-container">
    <div class="page-title">安全设置</div>
    <el-form label-width="140px" label-position="left">
      <el-form-item label="API Key">
        <el-input type="password" model-value="sk-****" style="width: 300px" show-password />
      </el-form-item>
      <el-form-item label="IP 白名单">
        <el-input type="textarea" :rows="3" model-value="127.0.0.1\n192.168.1.0/24" style="width: 300px" />
      </el-form-item>
      <el-form-item label="请求频率限制">
        <el-input-number model-value="100" :min="1" :max="1000" /> 次/分钟
      </el-form-item>
      <el-form-item label="日志记录">
        <el-switch model-value="true" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary">保存设置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
