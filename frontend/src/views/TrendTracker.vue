<template>
  <div class="trend-page">
    <div class="tp-hd">
      <span class="tp-title">一键追爆款</span>
      <span class="tp-sub">基于销售数据自动识别爆款商品，一键追踪</span>
      <div class="tp-stats">
        <div class="tps-item">
          <div class="tps-val">{{ stats.totalProducts }}</div>
          <div class="tps-label">商品总数</div>
        </div>
        <div class="tps-item">
          <div class="tps-val" style="color:#e53e3e">{{ stats.trackingCount }}</div>
          <div class="tps-label">追踪中</div>
        </div>
        <div class="tps-item">
          <div class="tps-val" style="color:#7c3aed">{{ stats.totalSold }}</div>
          <div class="tps-label">总销量</div>
        </div>
      </div>
    </div>
    <div class="tp-body">
      <div class="tb-bar">
        <el-input v-model="searchText" placeholder="搜索商品名称或SKU" style="width:260px" clearable />
        <el-switch v-model="onlyTracked" active-text="仅看追踪" style="margin-left:12px" />
      </div>
      <div v-if="filtered.length" class="trend-grid">
        <div
          v-for="p in filtered" :key="p.product_id"
          class="trend-card"
          :class="{ tracked: p.tracked }"
        >
          <div class="tc-rank" :style="{ background: rankBg(p) }">{{ rankIdx(p) }}</div>
          <div class="tc-info">
            <div class="tc-name">{{ p.product_name }}</div>
            <div class="tc-meta">
              <span v-if="p.sku">SKU: {{ p.sku }}</span>
              <span v-if="p.sale_price">¥{{ p.sale_price }}</span>
            </div>
            <div class="tc-data">
              <span>销量 <b>{{ p.total_sold }}</b></span>
              <span>订单 <b>{{ p.order_count }}</b></span>
              <span>营收 <b>¥{{ fmt(p.total_revenue) }}</b></span>
            </div>
            <div v-if="p.trend_note" class="tc-note">📝 {{ p.trend_note }}</div>
          </div>
          <div class="tc-actions">
            <el-button
              size="small"
              :type="p.tracked ? 'danger' : 'primary'"
              plain
              @click="toggleTrack(p)"
            >
              {{ p.tracked ? '取消追踪' : '追爆款' }}
            </el-button>
            <el-button v-if="p.tracked" size="small" text @click="editNote(p)">
              <el-icon><Edit /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无数据" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit } from '@element-plus/icons-vue'
import axios from 'axios'
const req = axios.create({ baseURL: '/api' })

const products = ref([])
const searchText = ref('')
const onlyTracked = ref(false)

const stats = computed(() => ({
  totalProducts: products.value.length,
  trackingCount: products.value.filter(p => p.tracked).length,
  totalSold: products.value.reduce((s, p) => s + (p.total_sold || 0), 0)
}))

const filtered = computed(() => {
  let list = products.value
  if (searchText.value) {
    const kw = searchText.value.toLowerCase()
    list = list.filter(p => p.product_name.toLowerCase().includes(kw) || (p.sku || '').toLowerCase().includes(kw))
  }
  if (onlyTracked.value) list = list.filter(p => p.tracked)
  return list
})

function rankIdx(p) { return filtered.value.indexOf(p) + 1 }
function rankBg(p) {
  const i = rankIdx(p)
  if (i === 1) return 'linear-gradient(135deg,#f59e0b,#d97706)'
  if (i === 2) return 'linear-gradient(135deg,#94a3b8,#64748b)'
  if (i === 3) return 'linear-gradient(135deg,#b08d6a,#8b6914)'
  return '#c4b5fd'
}
function fmt(v) { return (v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

async function load() {
  try {
    const { data } = await req.get('/trending')
    products.value = data.data || []
  } catch { products.value = [] }
}

async function toggleTrack(p) {
  const { data } = await req.post('/trending/' + p.product_id + '/toggle')
  p.tracked = data.data.tracked
  p.trend_status = data.data.tracked ? 'tracking' : null
  ElMessage.success(data.data.tracked ? '已加入追踪' : '已取消追踪')
}

async function editNote(p) {
  try {
    const { value } = await ElMessageBox.prompt('备注', '编辑备注', {
      inputValue: p.trend_note || '',
      inputValidator: (v) => true
    })
    await req.put('/trending/' + p.product_id, { note: value.trim() })
    p.trend_note = value.trim()
    ElMessage.success('已更新')
  } catch {}
}

onMounted(load)
</script>

<style scoped>
.trend-page { height: 100%; display: flex; flex-direction: column; background: #fafafe; }
.tp-hd { padding: 20px 24px; background: #fff; border-bottom: 1px solid #f0ecfc; }
.tp-title { font-size: 20px; font-weight: 600; color: #4a3f5e; }
.tp-sub { font-size: 13px; color: #b8aad0; margin-left: 10px; }
.tp-stats { display: flex; gap: 24px; margin-top: 14px; }
.tps-item { text-align: center; }
.tps-val { font-size: 22px; font-weight: 700; color: #4a3f5e; }
.tps-label { font-size: 12px; color: #b8aad0; margin-top: 2px; }
.tp-body { flex: 1; padding: 16px 24px; overflow-y: auto; }
.tb-bar { margin-bottom: 14px; display: flex; align-items: center; }
.trend-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.trend-card {
  display: flex; align-items: center; gap: 14px; padding: 16px;
  background: #fff; border-radius: 10px; border: 1px solid #f0ecfc; transition: all .2s;
}
.trend-card:hover { border-color: #c4b5fd; box-shadow: 0 2px 12px rgba(124,58,237,.06); }
.trend-card.tracked { border-color: #feb2b2; background: #fffafa; }
.tc-rank {
  width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 14px; font-weight: 700; flex-shrink: 0;
}
.tc-info { flex: 1; min-width: 0; }
.tc-name { font-size: 15px; font-weight: 600; color: #4a3f5e; }
.tc-meta { font-size: 12px; color: #b8aad0; margin-top: 2px; display: flex; gap: 10px; }
.tc-data { display: flex; gap: 12px; margin-top: 4px; font-size: 12px; color: #6b5f80; }
.tc-data b { color: #7c3aed; }
.tc-note { font-size: 11px; color: #e53e3e; margin-top: 3px; }
.tc-actions { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
</style>
