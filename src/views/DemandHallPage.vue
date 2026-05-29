<template>
  <TopNav />
  <div class="container" style="padding-bottom:60px;">
    <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:32px 0 24px;">
      <div>
        <h1 style="font-family:var(--font-display);font-size:clamp(36px,4vw,48px);line-height:1.1;margin:0 0 4px;">需求大厅</h1>
        <p class="sub" style="color:var(--muted);font-size:14px;">浏览社区互助需求，找到你能帮上忙的订单</p>
      </div>
      <button class="btn btn-primary" @click="showPublish = true">+ 发布需求</button>
    </div>

    <!-- 搜索 + 职业筛选 -->
    <div style="display:flex;gap:var(--gap-sm);flex-wrap:wrap;align-items:center;margin-bottom:16px;">
      <div style="flex:1;min-width:280px;display:flex;gap:var(--gap-sm);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:6px;">
        <input type="text" v-model="searchText" placeholder="搜索需求关键词、服务类型、标签..." style="flex:1;border:none;outline:none;padding:10px 14px;font:inherit;font-size:14px;background:transparent;" @input="updateFilters" />
        <button class="btn btn-primary" @click="updateFilters">搜索</button>
      </div>
    </div>

    <div class="row" style="margin-bottom:16px;gap:var(--gap-sm);">
      <span style="font-size:13px;font-weight:600;color:var(--muted);">职业筛选：</span>
      <select v-model="occFilter" @change="updateFilters" style="width:auto;max-width:200px;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius);font:inherit;font-size:14px;background:var(--surface);">
        <option value="">全部职业</option>
        <option v-for="o in occupations" :key="o" :value="o">{{ o }}</option>
      </select>
    </div>

    <!-- 智能推荐 -->
    <div class="recommend-banner">
      <span style="font-size:24px;">{{ occFilter ? '🔍' : '💡' }}</span>
      <span class="rec-text" style="font-size:13px;font-weight:500;color:var(--accent);" v-html="bannerText"></span>
    </div>

    <!-- 分类筛选 -->
    <div style="padding:16px 0;">
      <div class="filter-label" style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">服务分类</div>
      <div class="chip-group" style="display:flex;gap:var(--gap-xs);flex-wrap:wrap;">
        <button v-for="c in categories" :key="c" class="chip" :class="{ active: currentCat === c }" @click="currentCat = c; updateFilters()">{{ c === 'all' ? '全部' : c }}</button>
      </div>
    </div>

    <!-- 状态筛选 -->
    <div style="padding:0 0 16px;">
      <div class="filter-label" style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">订单状态</div>
      <div class="chip-group" style="display:flex;gap:var(--gap-xs);flex-wrap:wrap;">
        <button v-for="s in statuses" :key="s.value" class="chip" :class="{ active: currentStatus === s.value }" @click="currentStatus = s.value; updateFilters()">{{ s.label }}</button>
      </div>
    </div>

    <!-- 需求列表 -->
    <div class="grid-2" style="margin-top:8px;" v-if="filteredDemands.length">
      <div class="demand-card" v-for="d in filteredDemands" :key="d.id">
        <span class="status status-accepted" v-if="d.rec && !occFilter" style="margin-bottom:4px;">⭐ 智能推荐</span>
        <div class="demand-card-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--gap-sm);">
          <h3 style="font-size:16px;font-weight:600;line-height:1.35;">{{ d.title }}</h3>
          <span :class="['status', 'status-' + d.status]">{{ statusLabel(d.status) }}</span>
        </div>
        <p style="font-size:13px;color:var(--muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">{{ d.desc }}</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <span v-for="t in d.tags" :key="t" style="font-size:11px;padding:2px 8px;background:var(--fg-soft);border-radius:var(--radius-pill);color:var(--muted);">{{ t }}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--gap-sm);">
          <div style="display:flex;gap:12px;font-size:12px;color:var(--muted);flex-wrap:wrap;">
            <span>👤 {{ d.pubName }}</span>
            <span>🕐 {{ d.pubTime }}</span>
            <span>💰 <strong style="color:var(--accent-warm);">{{ d.coin }} 社区币</strong></span>
          </div>
          <div style="display:flex;gap:6px;">
            <button v-if="d.status === 'pending'" class="btn btn-primary btn-sm" @click="acceptDemand(d)">接单</button>
            <button class="btn btn-secondary btn-sm" @click="viewDetail(d)">详情</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else style="text-align:center;padding:60px 20px;color:var(--muted);">
      <div style="font-size:56px;margin-bottom:16px;opacity:0.4;">📭</div>
      <p style="font-weight:600;">没有找到匹配的需求</p>
      <p style="font-size:13px;">试试调整筛选条件或更换搜索关键词</p>
    </div>
  </div>

  <!-- 发布弹窗 -->
  <div class="modal-overlay" v-if="showPublish" @click.self="showPublish = false">
    <div class="modal">
      <button class="close-btn" @click="showPublish = false">&times;</button>
      <h2>发布需求</h2>
      <p style="color:var(--muted);font-size:13px;margin:4px 0 20px;">描述你需要帮助的内容，设定社区币报酬</p>
      <form @submit.prevent="publishDemand">
        <div class="form-group">
          <label>需求标题 *</label>
          <input type="text" class="form-input" v-model="pubTitle" placeholder="简要描述你的需求" required />
        </div>
        <div class="form-group">
          <label>详细描述 *</label>
          <textarea class="form-textarea" v-model="pubDesc" placeholder="请详细说明你的需求内容、时间要求、地点等" required></textarea>
        </div>
        <div class="row" style="gap:var(--gap-sm);">
          <div class="form-group" style="flex:1;">
            <label>服务分类 *</label>
            <select class="form-select" v-model="pubCat" required>
              <option value="">选择分类</option>
              <option v-for="c in categories.filter(x => x !== 'all')" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="form-group" style="flex:1;">
            <label>社区币报酬 *</label>
            <input type="number" class="form-input" v-model="pubCoin" placeholder="例如：5" min="1" max="100" required />
          </div>
        </div>
        <div class="form-group">
          <label>服务标签（逗号分隔）</label>
          <input type="text" class="form-input" v-model="pubTags" placeholder="如：家电维修, 空调, 紧急" />
        </div>
        <div style="display:flex;gap:var(--gap-sm);justify-content:flex-end;margin-top:20px;">
          <button type="button" class="btn btn-secondary" @click="showPublish = false">取消</button>
          <button type="submit" class="btn btn-warm">发布需求</button>
        </div>
        <div v-if="sensitiveWarning" style="margin-top:12px;padding:10px 14px;background:var(--warn-soft);border:1px solid var(--warn);border-radius:var(--radius);font-size:12px;color:var(--warn);">
          ⚠️ {{ sensitiveWarning }}
        </div>
      </form>
    </div>
  </div>
  <AiChatFAB />
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useToastStore } from '@/stores/toast'
import TopNav from '@/components/TopNav.vue'
import AiChatFAB from '@/components/AiChatFAB.vue'

const toast = useToastStore()

const occupations = ['家电维修', '家教辅导', '家政保洁', 'IT技术', '陪护老人', '代购跑腿', '宠物照顾', '搬家搬运']
const categories = ['all', '维修', '家政', '教育', '陪护', '跑腿', 'IT', '宠物', '搬家', '其他']
const statuses = [
  { value: 'all', label: '全部' }, { value: 'pending', label: '待接单' },
  { value: 'accepted', label: '已接单' }, { value: 'done', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
]

function statusLabel(s) {
  return { pending: '待接单', accepted: '已接单', done: '已完成', cancelled: '已取消' }[s] || s
}

const searchText = ref('')
const occFilter = ref('')
const currentCat = ref('all')
const currentStatus = ref('all')

const bannerText = computed(() => {
  if (occFilter.value) return '今日职业筛选：为你展示 <strong>' + occFilter.value + '</strong> 相关需求'
  return '智能推荐：根据你的技能 <strong>家电维修 · IT 技术</strong>，为你优先展示以下匹配需求'
})

// 需求数据
const demands = ref([
  { id:1, title:'急求家电维修师傅 — 空调不制冷', desc:'家里的格力空调突然不制冷了，制冷模式运行但不吹冷风，可能是缺氟或者压缩机故障。住在翠苑三区 23 栋 502。', cat:'维修', tags:['家电维修','空调','紧急'], coin:8, status:'pending', pubName:'赵阿姨', pubTime:'10分钟前', occ:'家电维修', rec:true },
  { id:2, title:'求助初中数学辅导 — 期末冲刺', desc:'初二男生，数学基础较弱，函数和几何部分需要系统辅导。希望每周六下午 2 小时。', cat:'教育', tags:['家教辅导','初中数学','长期'], coin:12, status:'pending', pubName:'陈姐', pubTime:'28分钟前', occ:'家教辅导', rec:false },
  { id:3, title:'帮忙照顾猫咪一天 — 临时出差', desc:'本周五出差一天，需要有人上门帮忙喂猫粮、换水、清理猫砂。古荡新村 15 栋。', cat:'宠物', tags:['宠物照顾','短期','猫'], coin:3, status:'accepted', pubName:'小林', pubTime:'1小时前', occ:'宠物照顾', rec:false },
  { id:4, title:'搬家需要两个人帮忙 — 周末上午', desc:'从翠苑搬到文新，距离 3 公里，主要搬运家具家电，已联系好货车。预计 3 小时。', cat:'搬家', tags:['搬家搬运','体力','周末'], coin:15, status:'pending', pubName:'王先生', pubTime:'2小时前', occ:'搬家搬运', rec:false },
  { id:5, title:'电脑系统重装 + 数据备份', desc:'联想笔记本 win10 系统崩溃，需要重装系统并备份重要文件。文一路 108 号。', cat:'IT', tags:['IT技术','系统重装','数据备份'], coin:6, status:'pending', pubName:'刘奶奶', pubTime:'3小时前', occ:'IT技术', rec:true },
  { id:6, title:'陪老人去医院复查 — 周四上午', desc:'需要有人陪同 78 岁老人去市一医院复查（高血压），帮忙挂号、取药。', cat:'陪护', tags:['陪护老人','医院','半天'], coin:10, status:'done', pubName:'张先生', pubTime:'昨天', occ:'陪护老人', rec:false },
  { id:7, title:'代购跑腿 — 社区药店买药', desc:'感冒发烧需要退烧药和感冒冲剂，不方便出门，需要帮忙去社区药店买药送到家。', cat:'跑腿', tags:['代购跑腿','急','药品'], coin:2, status:'pending', pubName:'小周', pubTime:'15分钟前', occ:'代购跑腿', rec:false },
  { id:8, title:'油烟机深度清洗', desc:'厨房油烟机使用两年未清洗，需要专业深度清洗服务。翠苑五区 12 栋 601。', cat:'家政', tags:['家政保洁','油烟机','深度清洁'], coin:5, status:'cancelled', pubName:'吴女士', pubTime:'2天前', occ:'家政保洁', rec:false },
  { id:9, title:'教你用智能手机 — 老人学微信', desc:'65 岁退休教师想学微信视频通话、发朋友圈等功能。需要耐心细致的年轻人上门教学。', cat:'IT', tags:['IT技术','老人教学','长期'], coin:5, status:'pending', pubName:'老李', pubTime:'5小时前', occ:'IT技术', rec:true },
  { id:10, title:'帮忙修一下水龙头漏水', desc:'厨房水龙头滴水已两周，需要更换密封圈或整个水龙头。', cat:'维修', tags:['家电维修','水龙头','小修'], coin:4, status:'pending', pubName:'孙姐', pubTime:'40分钟前', occ:'家电维修', rec:true },
])

const filteredDemands = computed(() => {
  let list = demands.value
  if (currentCat.value !== 'all') list = list.filter(d => d.cat === currentCat.value)
  if (currentStatus.value !== 'all') list = list.filter(d => d.status === currentStatus.value)
  if (occFilter.value) list = list.filter(d => d.occ === occFilter.value)
  if (searchText.value) {
    const kw = searchText.value.toLowerCase()
    list = list.filter(d => d.title.includes(kw) || d.desc.includes(kw) || d.tags.some(t => t.includes(kw)) || d.cat.includes(kw))
  }
  if (!occFilter.value) list = [...list].sort((a, b) => (b.rec ? 1 : 0) - (a.rec ? 1 : 0))
  return list
})

function updateFilters() {}

function acceptDemand(d) {
  d.status = 'accepted'
  toast.show('已成功接单「' + d.title + '」，社区币 ' + d.coin + ' 枚已冻结', 'success')
}

function viewDetail(d) {
  toast.show(d.title + ' | ' + d.pubName + ' | ' + d.coin + ' 社区币 | ' + statusLabel(d.status), 'success')
}

// 发布
const showPublish = ref(false)
const pubTitle = ref('')
const pubDesc = ref('')
const pubCat = ref('')
const pubCoin = ref('')
const pubTags = ref('')
const sensitiveWarning = ref('')
const SENSITIVE_WORDS = ['骗子', '违法', '赌博', '色情', '枪支', '毒品']

function publishDemand() {
  const content = pubTitle.value + ' ' + pubDesc.value + ' ' + pubTags.value
  const hit = SENSITIVE_WORDS.find(w => content.includes(w))
  if (hit) { sensitiveWarning.value = '检测到敏感词「' + hit + '」，请修改后再提交。'; return }
  sensitiveWarning.value = ''
  demands.value.unshift({
    id: demands.value.length + 1, title: pubTitle.value, desc: pubDesc.value,
    cat: pubCat.value, tags: pubTags.value ? pubTags.value.split(',').map(t => t.trim()).filter(Boolean) : [pubCat.value],
    coin: parseInt(pubCoin.value) || 0, status: 'pending',
    pubName: '李小邻', pubTime: '刚刚', occ: pubCat.value, rec: false
  })
  showPublish.value = false
  toast.show('需求发布成功！等待社区成员接单', 'success')
  pubTitle.value = ''; pubDesc.value = ''; pubCat.value = ''; pubCoin.value = ''; pubTags.value = ''
}
</script>

<style scoped>
.page-header { padding: 32px 0 24px; }
.chip { padding: 6px 14px; border: 1px solid var(--border); border-radius: var(--radius-pill); font-size: 13px; font-weight: 500; color: var(--muted); background: var(--surface); cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.chip:hover { border-color: var(--accent); color: var(--accent); }
.chip.active { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
.recommend-banner { background: linear-gradient(135deg, var(--accent-soft), var(--warm-soft)); border: 1px solid var(--accent); border-radius: var(--radius-lg); padding: 16px 20px; margin-bottom: var(--gap-md); display: flex; align-items: center; gap: var(--gap-sm); }
.demand-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 22px 24px; transition: box-shadow 0.2s, transform 0.2s; display: flex; flex-direction: column; gap: 12px; }
.demand-card:hover { box-shadow: var(--elev-raised); transform: translateY(-2px); }
@media (max-width: 640px) { .demand-card { padding: 16px; } }
</style>
