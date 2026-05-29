<template>
  <TopNav />
  <div class="container" style="padding-top:28px;padding-bottom:60px;">
    <div class="card" style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;margin-bottom:24px;">
      <div class="profile-avatar">{{ user.name[0] }}</div>
      <div style="flex:1;min-width:200px;">
        <h1>{{ user.name }}</h1>
        <p>ID: {{ user.id }} · 翠苑街道</p>
        <div class="row"><span>{{ user.phone }}</span></div>
      </div>
      <div class="credit-ring" :style="creditStyle">
        <div class="credit-inner"><span class="score">{{ score }}</span><span class="score-label">信用分</span></div>
      </div>
    </div>
    <div class="grid-2" style="margin-bottom:24px;">
      <div class="wallet-card">
        <div class="wallet-label">社区币钱包</div>
        <div class="wallet-balance">{{ wallet.balance }} <span>T币</span></div>
        <div class="wallet-sub">可用余额</div>
        <div class="wallet-row">
          <div class="wallet-mini"><div class="val">{{ wallet.frozen }}</div><div class="label">冻结中</div></div>
          <div class="wallet-mini"><div class="val">{{ wallet.earned }}</div><div class="label">累计收入</div></div>
          <div class="wallet-mini"><div class="val">{{ wallet.spent }}</div><div class="label">累计支出</div></div>
        </div>
      </div>
      <div class="card">
        <div class="row-between"><h3>职业/技能预设</h3><button class="btn btn-secondary btn-sm" @click="editingSkills = !editingSkills">{{ editingSkills ? "取消" : "编辑" }}</button></div>
        <div v-if="!editingSkills">
          <div class="skill-list"><span class="skill-tag" v-for="s in skills" :key="s">{{ s }}</span></div>
        </div>
        <div v-else>
          <div class="skill-edit"><select v-model="newSkill"><option value="">选择技能...</option><option v-for="o in skillOptions.filter(x => !skills.includes(x))" :key="o" :value="o">{{ o }}</option></select><button class="btn btn-primary btn-sm" @click="addSkill">添加</button></div>
          <div class="skill-list"><span class="skill-tag" v-for="s in skills" :key="s">{{ s }}<span class="remove-skill" @click="skills = skills.filter(x => x !== s)">&times;</span></span></div>
          <button class="btn btn-primary btn-sm" @click="saveSkills">保存设置</button>
        </div>
      </div>
    </div>
    <div class="tabs"><button v-for="tab in tabs" :key="tab.key" class="tab" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label }}</button></div>
    <div v-if="activeTab === 'orders'" class="card"><div class="list-row" v-for="o in myOrders" :key="o.title"><div><div class="item-title">{{ o.title }}</div><div class="item-meta">接单: {{ o.time }} · {{ o.pubName }}</div></div><span :class="['status','status-'+o.status]">{{ statusLabel(o.status) }}</span><span class="coin-plus">+{{ o.coin }} T币</span></div></div>
    <div v-if="activeTab === 'posts'" class="card"><div class="list-row" v-for="p in myPosts" :key="p.title"><div><div class="item-title">{{ p.title }}</div><div class="item-meta">发布: {{ p.time }}</div></div><span :class="['status','status-'+p.status]">{{ statusLabel(p.status) }}</span><span class="coin-minus">-{{ p.coin }} T币</span></div></div>
    <div v-if="activeTab === 'reviews'" class="card"><div class="list-row" v-for="r in myReviews" :key="r.from"><div><div class="item-title">{{ r.from }} <span class="stars">{{ r.stars }}</span></div><div class="item-meta">{{ r.text }}</div></div><span>{{ r.date }}</span></div></div>
    <div v-if="activeTab === 'history'" class="card"><div class="list-row" v-for="h in myHistory" :key="h.desc"><div><div class="item-title">{{ h.desc }}</div><div class="item-meta">{{ h.time }} · {{ h.order }}</div></div><span :style="{ color: h.type === 'in' ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }">{{ h.type === 'in' ? '+' : '-' }}{{ h.amount }} T币</span><span>余额: {{ h.balance }}</span></div></div>
    <div v-if="activeTab === 'security'" class="card" style="max-width:560px;">
      <div class="row-between sec-row"><span>修改密码</span><button class="btn btn-secondary btn-sm" @click="toast.show('开发中','success')">修改</button></div>
      <div class="row-between sec-row"><span>绑定手机</span><span>{{ user.phone }} ✓</span></div>
      <div class="row-between sec-row"><span>实名认证</span><span style="color:var(--success);">已认证 ✓</span></div>
      <div class="row-between sec-row"><span>登录设备管理</span><button class="btn btn-secondary btn-sm" @click="toast.show('开发中','success')">查看</button></div>
    </div>
  </div>
  <AiChatFAB />
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import TopNav from '@/components/TopNav.vue'
import AiChatFAB from '@/components/AiChatFAB.vue'

const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()
const user = computed(() => auth.user || { id: 'TB-2026-0042', name: '李小邻', phone: '138****6789' })

const score = ref(90)
const creditStyle = computed(() => {
  const deg = score.value * 3.6
  const c = score.value >= 60 ? 'var(--success)' : 'var(--danger)'
  return { background: 'conic-gradient(' + c + ' 0deg ' + deg + 'deg, var(--border) ' + deg + 'deg 360deg)' }
})

const wallet = reactive({ balance: 128, frozen: 15, earned: 256, spent: 143 })

const skills = ref(['家电维修', 'IT 技术', '搬家搬运', '基础水电'])
const editingSkills = ref(false)
const newSkill = ref('')
const skillOptions = ['家电维修', 'IT技术', '家政保洁', '家教辅导', '陪护老人', '代购跑腿', '宠物照顾', '搬家搬运', '基础水电', '汽车维修']
function addSkill() { if (newSkill.value && !skills.value.includes(newSkill.value)) { skills.value.push(newSkill.value); newSkill.value = '' } }
function saveSkills() { editingSkills.value = false; toast.show('技能预设已保存', 'success') }

const activeTab = ref('orders')
const tabs = [{ key: 'orders', label: '我的接单' }, { key: 'posts', label: '我的发单' }, { key: 'reviews', label: '我的评价' }, { key: 'history', label: '交易流水' }, { key: 'security', label: '账号安全' }]
function statusLabel(s) { return { pending: '待接单', accepted: '已接单', done: '已完成', cancelled: '已取消' }[s] || s }

const myOrders = [{ title: '急求家电维修 — 空调不制冷', time: '2026-05-26', pubName: '赵阿姨', status: 'accepted', coin: 8 }, { title: '电脑系统重装 + 数据备份', time: '2026-05-22', pubName: '刘奶奶', status: 'done', coin: 6 }, { title: '帮忙修水龙头漏水', time: '2026-05-18', pubName: '孙姐', status: 'done', coin: 4 }]
const myPosts = [{ title: '帮忙照顾猫咪一天', time: '2026-05-27', status: 'accepted', coin: 3 }, { title: '陪老人去医院复查', time: '2026-05-15', status: 'done', coin: 10 }]
const myReviews = [{ from: '刘奶奶', stars: '★★★★★', text: '小伙子技术好，态度也好！', date: '2026-05-22' }, { from: '孙姐', stars: '★★★★★', text: '很专业，工具齐全。', date: '2026-05-18' }, { from: '赵阿姨', stars: '★★★★☆', text: '修好了空调，但晚了半小时。', date: '2026-05-26' }]
const myHistory = [{ desc: '接单收入 — 空调维修', time: '2026-05-26 14:30', order: '#TB-2026-0892', type: 'in', amount: 8, balance: 128 }, { desc: '发单支出 — 猫咪照顾', time: '2026-05-27 09:15', order: '#TB-2026-0912', type: 'out', amount: 3, balance: 125 }, { desc: '接单收入 — 系统重装', time: '2026-05-22 16:00', order: '#TB-2026-0856', type: 'in', amount: 6, balance: 128 }, { desc: '注册奖励', time: '2026-02-15', order: '新用户', type: 'in', amount: 20, balance: 20 }]
</script>

<style scoped>
.profile-avatar{width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,var(--accent-soft),var(--warm-soft));display:grid;place-items:center;font-size:32px;font-weight:700;color:var(--accent);flex-shrink:0}
.credit-ring{width:90px;height:90px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}
.credit-inner{width:72px;height:72px;border-radius:50%;background:var(--surface);display:grid;place-items:center;text-align:center}
.credit-inner .score{font-family:var(--font-display);font-size:28px;font-weight:700;line-height:1}
.credit-inner .score-label{font-size:9px;color:var(--muted);text-transform:uppercase}
.wallet-card{background:linear-gradient(135deg,var(--accent),color-mix(in oklch,var(--accent)80%,black));color:var(--surface);border-radius:var(--radius-lg);padding:24px}
.wallet-label{font-size:12px;opacity:0.8;text-transform:uppercase}
.wallet-balance{font-family:var(--font-display);font-size:42px;font-weight:700;line-height:1;margin:4px 0}
.wallet-balance span{font-size:18px;opacity:0.7}
.wallet-sub{font-size:12px;opacity:0.7}
.wallet-row{display:flex;gap:24px;margin-top:16px}
.wallet-mini{text-align:center}.wallet-mini .val{font-family:var(--font-display);font-size:22px;font-weight:600}.wallet-mini .label{font-size:11px;opacity:0.7}
.skill-tag{display:inline-flex;align-items:center;gap:4px;padding:5px 12px;background:var(--accent-soft);color:var(--accent);border-radius:var(--radius-pill);font-size:13px;font-weight:500}
.remove-skill{cursor:pointer;font-size:15px;opacity:0.5;margin-left:2px}.remove-skill:hover{opacity:1}
.skill-list{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.skill-edit{display:flex;gap:8px;margin-bottom:10px}.skill-edit select{flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius);font:inherit;font-size:14px}
.list-row{display:grid;grid-template-columns:1fr auto auto;gap:var(--gap-md);align-items:center;padding:14px 0;border-bottom:1px solid var(--border)}
.list-row:last-child{border-bottom:none}
.item-title{font-weight:600;font-size:14px}.item-meta{font-size:12px;color:var(--muted)}
.coin-plus{font-weight:600;color:var(--accent-warm)}.coin-minus{font-weight:600;color:var(--danger)}
.stars{color:var(--warn);letter-spacing:1px}
.sec-row{padding:12px 0;border-bottom:1px solid var(--border)}
.sec-row:last-child{border-bottom:none}
@media(max-width:640px){.wallet-card .wallet-balance{font-size:32px}.list-row{grid-template-columns:1fr}}
</style>
