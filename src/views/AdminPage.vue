<template>
  <header class="topnav"><div class="container topnav-inner"><router-link to="/" class="logo">邻<span>帮</span> · 管理后台</router-link><div style="font-size:13px;color:var(--muted);display:flex;align-items:center;gap:8px;"><span>管理员 · 张主管</span><router-link to="/" class="btn btn-secondary btn-sm">返回前台</router-link></div></div></header>
  <div class="admin-layout">
    <aside class="sidebar"><div class="sidebar-header"><div class="admin-label">管理后台</div><div class="admin-name">控制面板</div></div><ul class="sidebar-nav"><li v-for="item in navItems" :key="item.key"><a href="#" :class="{ active: activePanel === item.key }" @click.prevent="activePanel = item.key"><span class="nav-icon">{{ item.icon }}</span> {{ item.label }}</a></li></ul></aside>
    <main class="main-content">
      <div v-if="activePanel === 'dashboard'">
        <h1 style="font-family:var(--font-display);font-size:28px;margin:0 0 24px;">数据看板</h1>
        <div class="grid-4" style="margin-bottom:24px;"><div class="stat-card" v-for="s in dashboardStats" :key="s.label"><div class="stat-icon">{{ s.icon }}</div><div class="stat-value">{{ s.value }}</div><div class="stat-label">{{ s.label }}</div><div class="stat-change" :class="s.up ? 'up' : 'down'">{{ s.change }}</div></div></div>
        <div class="grid-2"><div class="card"><div class="card-header"><h3>近期订单趋势</h3></div><div style="display:flex;align-items:flex-end;gap:12px;height:160px;padding:0 8px;"><div v-for="b in barData" :key="b.label" style="flex:1;text-align:center;"><div :style="{ background: 'var(--accent)', height: b.h + 'px', borderRadius: '6px 6px 0 0', maxWidth: '48px', margin: '0 auto' }"></div><span style="font-size:10px;color:var(--muted);">{{ b.label }}</span></div></div></div>
        <div class="card"><div class="card-header"><h3>纠纷率</h3></div><div style="display:flex;align-items:center;justify-content:center;height:160px;"><div :style="{ width:'140px',height:'140px',borderRadius:'50%',background:'conic-gradient(var(--danger) 0deg 6.48deg, var(--success) 6.48deg 360deg)' }" style="display:grid;place-items:center;"><div style="width:100px;height:100px;border-radius:50%;background:var(--surface);display:grid;place-items:center;text-align:center;"><span style="font-family:var(--font-display);font-size:28px;font-weight:700;color:var(--success);">1.8<span style="font-size:14px;">%</span></span><span style="font-size:10px;color:var(--muted);">纠纷率</span></div></div></div></div></div>
      </div>
      <div v-if="activePanel === 'users'">
        <div class="row-between" style="margin-bottom:16px;"><h1>用户管理</h1></div>
        <div class="search-box"><input type="text" v-model="userSearch" placeholder="搜索用户..." /><button class="btn btn-primary btn-sm">搜索</button></div>
        <div class="card" style="overflow-x:auto;"><table class="data-table"><thead><tr><th>用户ID</th><th>姓名</th><th>手机号</th><th class="hide-mobile">注册</th><th>信用分</th><th>社区币</th><th>状态</th><th>操作</th></tr></thead>
        <tbody><tr v-for="u in filteredUsers" :key="u.id"><td class="mono">{{ u.id }}</td><td>{{ u.name }}</td><td>{{ u.phone }}</td><td class="hide-mobile">{{ u.regDate }}</td><td :style="{ color: u.score >= 60 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }">{{ u.score }}</td><td class="mono">{{ u.coins }}</td><td><span :class="['status', 'status-' + u.statusClass]">{{ u.status }}</span></td><td><button class="btn btn-sm btn-secondary" @click="toast.show('详情','success')">详情</button><button v-if="u.status==='正常'" class="btn btn-sm btn-secondary" style="color:var(--danger);" @click="u.status='已冻结';u.statusClass='danger'">冻结</button><button v-else class="btn btn-sm" style="background:var(--success);color:var(--surface);" @click="u.status='正常';u.statusClass='active'">解冻</button></td></tr></tbody></table></div>
      </div>
      <div v-if="activePanel === 'orders'">
        <div class="row-between" style="margin-bottom:16px;"><h1>订单管理</h1></div>
        <div class="search-box"><input type="text" v-model="orderSearch" placeholder="搜索订单号..." /><select v-model="orderStatusFilter" style="padding:8px 14px;border:1px solid var(--border);border-radius:var(--radius);"><option value="">全部</option><option>待接单</option><option>已接单</option><option>已完成</option></select><button class="btn btn-primary btn-sm">筛选</button></div>
        <div class="card" style="overflow-x:auto;"><table class="data-table"><thead><tr><th>订单号</th><th>标题</th><th>发单方</th><th>接单方</th><th>社区币</th><th>状态</th><th class="hide-mobile">时间</th><th>操作</th></tr></thead>
        <tbody><tr v-for="o in adminOrders" :key="o.id"><td class="mono">{{ o.id }}</td><td>{{ o.title }}</td><td>{{ o.pub }}</td><td>{{ o.accept }}</td><td class="mono">{{ o.coins }}</td><td><span :class="['status','status-'+o.statusClass]">{{ o.status }}</span></td><td class="hide-mobile mono">{{ o.date }}</td><td><button class="btn btn-sm btn-secondary" @click="toast.show('详情','success')">详情</button></td></tr></tbody></table></div>
      </div>
      <div v-if="activePanel === 'disputes'"><h1>纠纷仲裁</h1><div class="card" style="overflow-x:auto;"><div class="card-header"><h3>待处理纠纷</h3><span class="status status-warn">2件</span></div><table class="data-table"><thead><tr><th>案件号</th><th>关联订单</th><th>发单方</th><th>接单方</th><th>阶段</th><th>操作</th></tr></thead><tbody><tr v-for="d in adminDisputes" :key="d.id"><td class="mono">{{ d.id }}</td><td class="mono">{{ d.order }}</td><td>{{ d.plaintiff }}</td><td>{{ d.defendant }}</td><td><span :class="['status','status-'+d.sc]">{{ d.status }}</span></td><td><button class="btn btn-sm btn-primary" @click="toast.show('终审','success')">终审</button><button class="btn btn-sm btn-secondary" @click="toast.show('详情','success')">详情</button></td></tr></tbody></table></div></div>
      <div v-if="activePanel === 'words'"><div class="row-between" style="margin-bottom:16px;"><h1>敏感词库</h1><button class="btn btn-primary btn-sm" @click="addWord">+ 添加</button></div><div class="card" v-for="(g,i) in wordGroups" :key="i"><div class="card-header"><h3>{{ g.title }}</h3></div><div><span v-for="w in g.words" :key="w" :class="['word-tag','word-'+g.type]">{{ g.type==='replace' ? w+' -> ***' : w }}<button @click="g.words=g.words.filter(x=>x!==w)" class="word-remove">&times;</button></span></div></div></div>
      <div v-if="activePanel === 'audit'"><h1>操作审计日志</h1><div class="card"><div class="log-item" v-for="log in auditLogs" :key="log.time"><span class="log-time">{{ log.time }}</span><span class="log-action" :style="{ color: log.color }">{{ log.action }}</span><span class="log-detail">{{ log.detail }}</span></div></div></div>
      <div v-if="activePanel === 'settings'"><h1>系统配置</h1><div class="card" style="max-width:600px;"><div class="row-between sec-row"><span>数据备份</span><button class="btn btn-primary btn-sm" @click="toast.show('备份开始','success')">立即备份</button></div><div class="row-between sec-row"><span>自动备份</span><span class="status status-active">已开启</span></div><div class="row-between sec-row"><span>最近备份</span><span>2026-05-28 03:00</span></div><div class="row-between sec-row"><span>权限配置</span><button class="btn btn-secondary btn-sm" @click="toast.show('开发中','success')">管理角色</button></div></div></div>
    </main>
  </div>
  <AiChatFAB />
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useToastStore } from '@/stores/toast'
import AiChatFAB from '@/components/AiChatFAB.vue'
const toast = useToastStore()
const activePanel = ref('dashboard')
const navItems = [{ key: 'dashboard', icon: '📊', label: '数据看板' }, { key: 'users', icon: '👥', label: '用户管理' }, { key: 'orders', icon: '📋', label: '订单管理' }, { key: 'disputes', icon: '⚖', label: '纠纷仲裁' }, { key: 'words', icon: '🚫', label: '敏感词库' }, { key: 'audit', icon: '📝', label: '操作审计' }, { key: 'settings', icon: '⚙', label: '系统配置' }]
const dashboardStats = [{ icon: '👥', value: '12,847', label: '注册用户', change: '12% 本月', up: true }, { icon: '📋', value: '3,562', label: '已完成订单', change: '8% 较上月', up: true }, { icon: '⚖', value: '47', label: '纠纷案件', change: '15% 较上月', up: false }, { icon: '💰', value: '89,420', label: '流通社区币', change: '22% 本月', up: true }]
const barData = [{ label: '周一', h: 90 }, { label: '周二', h: 120 }, { label: '周三', h: 75 }, { label: '周四', h: 145 }, { label: '周五', h: 110 }, { label: '周六', h: 60 }, { label: '周日', h: 40 }]

const userSearch = ref('')
const users = ref([{ id: 'TB-2026-0042', name: '李小邻', phone: '138****6789', regDate: '2026-02-15', score: 90, coins: 128, status: '正常', statusClass: 'active' }, { id: 'TB-2026-0018', name: '赵阿姨', phone: '139****2345', regDate: '2026-01-20', score: 85, coins: 56, status: '正常', statusClass: 'active' }, { id: 'TB-2026-0256', name: '小王', phone: '137****8901', regDate: '2026-03-08', score: 58, coins: 23, status: '低信用', statusClass: 'warn' }, { id: 'TB-2026-0301', name: '陈姐', phone: '136****4567', regDate: '2026-03-15', score: 92, coins: 215, status: '正常', statusClass: 'active' }, { id: 'TB-2026-0415', name: '张先生', phone: '135****7890', regDate: '2026-04-02', score: 32, coins: 5, status: '已冻结', statusClass: 'danger' }])
const filteredUsers = computed(() => { if (!userSearch.value) return users.value; const kw = userSearch.value.toLowerCase(); return users.value.filter(u => u.name.includes(kw) || u.id.toLowerCase().includes(kw)) })

const orderSearch = ref(''); const orderStatusFilter = ref('')
const adminOrders = [{ id: 'TB-2026-0892', title: '空调不制冷维修', pub: '赵阿姨', accept: '李小邻', coins: 8, status: '纠纷中', statusClass: 'warn', date: '05-26' }, { id: 'TB-2026-0912', title: '照顾猫咪', pub: '李小邻', accept: '小林', coins: 3, status: '已接单', statusClass: 'info', date: '05-27' }, { id: 'TB-2026-0856', title: '电脑系统重装', pub: '刘奶奶', accept: '李小邻', coins: 6, status: '已完成', statusClass: 'active', date: '05-22' }, { id: 'TB-2026-0803', title: '水龙头维修', pub: '孙姐', accept: '李小邻', coins: 4, status: '已完成', statusClass: 'active', date: '05-18' }]
const adminDisputes = [{ id: 'DSP-2026-0018', order: 'TB-2026-0892', plaintiff: '赵阿姨', defendant: '李小邻', status: '陪审投票中', sc: 'warn' }, { id: 'DSP-2026-0021', order: 'TB-2026-0915', plaintiff: '吴女士', defendant: '陈姐', status: '举证阶段', sc: 'info' }]

const wordGroups = reactive([{ title: '拦截词（直接封禁）', type: 'block', words: ['骗子', '违法', '赌博', '色情', '枪支', '毒品'] }, { title: '警告词（提示修改）', type: 'warn', words: ['差劲', '垃圾', '坑人'] }, { title: '替换词（自动替换）', type: 'replace', words: ['妈的', '操'] }])
function addWord() { const w = prompt('输入敏感词：'); if (!w) return; const t = prompt('类型：1=拦截 2=警告 3=替换', '1') || '1'; const idx = parseInt(t) - 1; if (idx >= 0 && idx < 3) wordGroups[idx].words.push(w) }

const auditLogs = [{ time: '2026-05-28 09:15', action: '用户管理', color: 'var(--accent)', detail: '解冻用户 TB-2026-0415' }, { time: '2026-05-27 16:42', action: '纠纷仲裁', color: 'var(--warn)', detail: '对 DSP-2026-0012 做出终审裁决' }, { time: '2026-05-27 14:20', action: '敏感词库', color: 'var(--accent)', detail: '新增拦截词「代刷」' }, { time: '2026-05-26 11:08', action: '订单管理', color: 'var(--danger)', detail: '强制取消违规订单' }, { time: '2026-05-24 08:55', action: '登录', color: 'var(--muted)', detail: '从 IP 192.168.1.100 登录' }]
</script>

<style scoped>
h1{font-family:var(--font-display);font-size:28px;margin:0 0 16px}
.admin-layout{display:grid;grid-template-columns:220px 1fr;min-height:calc(100vh - 60px)}
.sidebar{background:var(--surface);border-right:1px solid var(--border);padding:20px 0}
.sidebar-header{padding:0 20px 16px;border-bottom:1px solid var(--border);margin-bottom:12px}
.admin-label{font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.admin-name{font-family:var(--font-display);font-size:18px;font-weight:600;margin-top:2px}
.sidebar-nav{list-style:none;padding:0;margin:0}
.sidebar-nav li a{display:flex;align-items:center;gap:10px;padding:10px 20px;font-size:14px;font-weight:500;color:var(--muted);transition:background .12s,color .12s;border-left:3px solid transparent;text-decoration:none}
.sidebar-nav li a:hover{background:var(--fg-soft);color:var(--fg)}
.sidebar-nav li a.active{background:var(--accent-soft);color:var(--accent);border-left-color:var(--accent);font-weight:600}
.nav-icon{font-size:16px;width:20px;text-align:center}
.main-content{padding:28px 32px}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px 24px}
.stat-card .stat-icon{font-size:28px;margin-bottom:8px}
.stat-card .stat-value{font-family:var(--font-display);font-size:32px;font-weight:700;line-height:1}
.stat-card .stat-label{font-size:13px;color:var(--muted);margin-top:4px}
.stat-card .stat-change{font-size:12px;margin-top:6px}.stat-change.up{color:var(--success)}.stat-change.down{color:var(--danger)}
.data-table{width:100%;border-collapse:collapse;font-size:13px}
.data-table th,.data-table td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--border)}
.data-table th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.data-table tbody tr:hover{background:var(--fg-soft)}
.mono{font-family:var(--font-mono);font-size:12px}
.card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.card-header h3{font-size:17px;font-weight:600;margin:0}
.search-box{display:flex;gap:var(--gap-sm);margin-bottom:16px}
.search-box input{flex:1;padding:8px 14px;border:1px solid var(--border);border-radius:var(--radius);font:inherit;font-size:14px}
.word-tag{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:var(--radius-pill);font-size:12px;font-weight:500;margin:3px}
.word-block{background:var(--danger-soft);color:var(--danger)}
.word-warn{background:var(--warn-soft);color:var(--warn)}
.word-replace{background:var(--accent-soft);color:var(--accent)}
.word-remove{background:none;border:none;color:inherit;cursor:pointer;padding:0;margin-left:2px;font-size:14px}
.log-item{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);font-size:13px}.log-item:last-child{border-bottom:none}
.log-time{font-family:var(--font-mono);font-size:11px;color:var(--muted);white-space:nowrap;min-width:130px}
.log-action{font-weight:600;min-width:80px}
.log-detail{flex:1;color:var(--muted)}
.sec-row{padding:12px 0;border-bottom:1px solid var(--border)}.sec-row:last-child{border-bottom:none}
@media(max-width:900px){.admin-layout{grid-template-columns:1fr}.sidebar{border-right:none;border-bottom:1px solid var(--border)}.sidebar-nav{display:flex;overflow-x:auto}.sidebar-nav li a{border-left:none;border-bottom:3px solid transparent;white-space:nowrap;padding:10px 14px}.sidebar-nav li a.active{border-left:none;border-bottom-color:var(--accent)}}
@media(max-width:640px){.main-content{padding:20px 16px}.hide-mobile{display:none}}
</style>
