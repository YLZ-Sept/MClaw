<template>
  <div class="expert-hub">
    <!-- 顶部标题区 -->
    <div class="hub-hero">
      <div class="hero-text">
        <h1 class="hero-title">AI 专家广场</h1>
        <p class="hero-sub">精选各领域 AI 专家，即选即用。用自然语言描述需求，专家直接交付结果。</p>
      </div>
      <div class="hero-stats">
        <div class="hero-stat">
          <span class="hero-stat-num">{{ experts.length }}</span>
          <span class="hero-stat-label">位专家</span>
        </div>
        <div class="hero-stat">
          <span class="hero-stat-num">{{ categories.length }}</span>
          <span class="hero-stat-label">个领域</span>
        </div>
      </div>
    </div>

    <!-- 搜索 + 分类筛选 -->
    <div class="hub-toolbar">
      <div class="hub-search">
        <el-input v-model="search" placeholder="搜索专家名称或描述..." clearable :prefix-icon="Search" size="large" />
      </div>
      <div class="hub-categories">
        <el-button
          v-for="c in categories"
          :key="c.key"
          :type="activeCategory === c.key ? 'primary' : 'default'"
          size="default"
          :class="['cat-chip', { 'cat-chip-active': activeCategory === c.key }]"
          @click="activeCategory = activeCategory === c.key ? null : c.key"
        >
          {{ c.name }}
          <span class="cat-chip-count">{{ c.count }}</span>
        </el-button>
      </div>
    </div>

    <!-- 专家卡片网格 -->
    <div v-if="filteredExperts.length > 0" class="expert-grid">
      <div v-for="e in filteredExperts" :key="e.id" class="expert-card" @click="goChat(e)">
        <div class="card-top">
          <div class="card-emoji" :style="{ background: e.color || '#7c3aed' }">{{ e.emoji || '🤖' }}</div>
          <div class="card-top-tags">
            <el-tag size="small" effect="plain" class="card-cat-tag">
              {{ catName(e.category) }}
            </el-tag>
            <el-tag v-if="e.permission_tier" size="small" :type="tierType(e.permission_tier)" class="card-tier-tag">
              {{ tierLabel(e.permission_tier) }}
            </el-tag>
          </div>
        </div>
        <div class="card-name">{{ e.name }}</div>
        <div class="card-desc">{{ e.desc }}</div>
        <div class="card-footer">
          <el-button type="primary" size="default" round class="card-btn" @click.stop="goChat(e)">
            开始对话
          </el-button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="hub-empty">
      <el-empty description="暂无匹配的专家" :image-size="120" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import request from '../api/index.js'

const router = useRouter()
const experts = ref([])
const categories = ref([])
const search = ref('')
const activeCategory = ref(null)

const catMap = {}
categories.value = [] // 初始化后填充

function catName(key) {
  return catMap[key] || key
}

function tierType(t) {
  return t === 'high' ? 'danger' : t === 'medium' ? 'warning' : 'info'
}
function tierLabel(t) {
  return t === 'high' ? '高' : t === 'medium' ? '中' : '低'
}

const filteredExperts = computed(() => {
  let list = experts.value
  if (activeCategory.value) {
    list = list.filter(e => e.category === activeCategory.value)
  }
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    list = list.filter(e => e.name.toLowerCase().includes(q) || (e.desc || '').toLowerCase().includes(q))
  }
  return list
})

function goChat(expert) {
  router.push({ path: '/chat', query: { agent: expert.id, agentName: expert.name } })
}

onMounted(async () => {
  try {
    const [expRes, catRes] = await Promise.all([
      request.get('/expert-agents'),
      request.get('/expert-agents/categories')
    ])
    experts.value = expRes.data?.data || []
    categories.value = catRes.data?.data || []
    for (const c of categories.value) {
      catMap[c.key] = c.name
    }
  } catch {
    experts.value = []
    categories.value = []
  }
})
</script>

<style scoped>
.expert-hub {
  padding: 28px 32px;
  height: 100%;
  overflow-y: auto;
  background: #fafafe;
}

/* Hero */
.hub-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}
.hero-title {
  font-size: 24px;
  font-weight: 700;
  color: #4a3f5e;
  margin: 0 0 6px 0;
}
.hero-sub {
  font-size: 14px;
  color: #b8aad0;
  margin: 0;
}
.hero-stats {
  display: flex;
  gap: 24px;
}
.hero-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.hero-stat-num {
  font-size: 28px;
  font-weight: 700;
  color: #7c3aed;
}
.hero-stat-label {
  font-size: 12px;
  color: #b8aad0;
}

/* Toolbar */
.hub-toolbar {
  margin-bottom: 24px;
}
.hub-search {
  max-width: 400px;
  margin-bottom: 14px;
}
.hub-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cat-chip {
  border-radius: 20px;
  font-size: 13px;
  transition: all .2s;
}
.cat-chip:hover {
  border-color: #c4b5fd;
  color: #7c3aed;
}
.cat-chip-active {
  background: #f5f3ff;
  border-color: #7c3aed;
  color: #7c3aed;
}
.cat-chip-count {
  margin-left: 4px;
  font-size: 11px;
  opacity: .6;
}

/* Grid */
.expert-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}
.expert-card {
  background: #fff;
  border: 1px solid #f0ecfc;
  border-radius: 16px;
  padding: 24px;
  cursor: pointer;
  transition: all .25s;
  box-shadow: 0 1px 4px rgba(139, 92, 246, 0.04);
  display: flex;
  flex-direction: column;
}
.expert-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 28px rgba(139, 92, 246, 0.12);
  border-color: #c4b5fd;
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.card-emoji {
  width: 48px;
  height: 48px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: #fff;
}
.card-cat-tag {
  font-size: 11px;
}
.card-top-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}
.card-tier-tag {
  font-size: 10px;
  padding: 0 6px;
  height: 20px;
  line-height: 20px;
}
.card-name {
  font-size: 17px;
  font-weight: 600;
  color: #4a3f5e;
  margin-bottom: 8px;
}
.card-desc {
  font-size: 13px;
  color: #b8aad0;
  line-height: 1.5;
  flex: 1;
  margin-bottom: 16px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-footer {
  display: flex;
  justify-content: center;
}
.card-btn {
  width: 100%;
  transition: all .2s;
}
.expert-card:hover .card-btn {
  background: #7c3aed;
  border-color: #7c3aed;
}

/* Empty */
.hub-empty {
  padding: 80px 0;
}
</style>
