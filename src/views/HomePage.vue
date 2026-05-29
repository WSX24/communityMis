<template>
  <TopNav />

  <main>
    <!-- Hero -->
    <section class="section" style="padding-block:clamp(60px,10vw,120px);text-align:center;">
      <div class="container" style="max-width:38ch;margin-inline:auto;">
        <span class="pill pill-warm" style="margin-bottom:20px;">社区互助 · 时间即价值</span>
        <h1>用时间交换温暖<br>让技能连接邻里</h1>
        <p class="lead" style="margin:16px 0 24px;">
          邻帮是一个社区互助服务平台。发布需求赚取社区币，接单服务积累信用，让每一次互助都被看见、被记录、被尊重。
        </p>
        <div style="display:flex;gap:var(--gap-sm);justify-content:center;flex-wrap:wrap;">
          <router-link to="/demand" class="btn btn-primary btn-arrow">浏览需求大厅</router-link>
          <router-link to="/auth" class="btn btn-warm">立即加入社区</router-link>
        </div>
      </div>
    </section>

    <!-- 平台特色 -->
    <section class="section">
      <div class="container" style="display:flex;flex-direction:column;gap:56px;">
        <div style="max-width:40ch;">
          <p class="eyebrow">平台特色</p>
          <h2>不只是交易，更是社区信任网络。</h2>
        </div>
        <div class="grid-3">
          <div class="feature card-flat" v-for="f in features" :key="f.title">
            <div class="feature-mark">{{ f.icon }}</div>
            <h3>{{ f.title }}</h3>
            <p>{{ f.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 平台数据 -->
    <section class="section">
      <div class="container">
        <p class="eyebrow" style="margin-bottom:40px;">平台数据</p>
        <div class="grid-3">
          <div class="stat" v-for="s in stats" :key="s.label">
            <div class="stat-num num" v-html="s.value"></div>
            <p class="stat-label">{{ s.label }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 功能模块入口 -->
    <section class="section">
      <div class="container">
        <p class="eyebrow">功能模块</p>
        <h2 style="margin-bottom:40px;">五大核心模块，覆盖完整互助流程。</h2>
        <div class="grid-3" style="gap:24px;">
          <router-link v-for="m in modules" :key="m.to" :to="m.to" class="screen-card">
            <div class="screen-card-preview" :class="m.previewClass">{{ m.emoji }}</div>
            <div class="screen-card-body">
              <span :class="['pill', m.tagClass]" style="margin-bottom:8px;">{{ m.tag }}</span>
              <h3>{{ m.title }}</h3>
              <p>{{ m.desc }}</p>
              <span class="btn btn-secondary btn-sm btn-arrow">进入模块</span>
            </div>
          </router-link>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="section" style="text-align:center;">
      <div style="max-width:560px;margin-inline:auto;">
        <span class="pill pill-warm" style="margin-bottom:16px;">AI 助手已就绪</span>
        <h2>需要帮助？问问小 T。</h2>
        <p class="lead" style="margin:12px auto 28px;">
          AI 智能助手「小 T」已在每个功能页面内就位 — 需求推荐、操作指引、纠纷咨询，进入任一模块即享智能陪伴。
        </p>
        <router-link to="/demand" class="btn btn-primary">进入需求大厅</router-link>
      </div>
    </section>
  </main>

  <AppFooter />
  <AiChatFAB />
</template>

<script setup>
import TopNav from '@/components/TopNav.vue'
import AppFooter from '@/components/AppFooter.vue'
import AiChatFAB from '@/components/AiChatFAB.vue'

const features = [
  { icon: '⏱', title: '社区币经济', desc: '每完成一次服务即获得社区币，可用于发布自己的需求。社区币冻结与结算机制保障双方权益，交易流水透明可追溯。' },
  { icon: '⭐', title: '信用评价体系', desc: '双向评分 + 公开评价历史 + 个人信用分。低信用用户将被可视化标识，营造诚实守信的社区互助环境。' },
  { icon: '⚖', title: '纠纷法庭', desc: '当服务出现争议时，双方在线举证、陪审团投票、管理员终审裁决，全程公开透明，裁决结果公示可查。' },
]

const stats = [
  { value: '12,847', label: '注册社区成员，覆盖周边 8 个街道社区' },
  { value: '3,562', label: '已完成互助订单，累计交换社区币 89,420 枚' },
  { value: '98.6<span style=\"font-size:0.5em;opacity:0.6;\">%</span>', label: '好评率，社区成员满意度持续领先' },
]

const modules = [
  { to: '/auth', emoji: '\U0001F510', previewClass: 'auth', tag: 'M1', tagClass: '', title: '用户认证', desc: '手机号注册、账号密码登录、JWT状态保持、角色权限区分、个人信息编辑。' },
  { to: '/demand', emoji: '\U0001F4CB', previewClass: 'hall', tag: 'M2', tagClass: '', title: '需求大厅', desc: '需求发布、关键词搜索、标签筛选、职业选择器、智能推荐流、订单状态追踪。' },
  { to: '/profile', emoji: '\U0001F464', previewClass: 'profile', tag: 'M3', tagClass: '', title: '个人中心', desc: '技能预设、社区币钱包、接单历史、我的评价、信用分展示、账号安全设置。' },
  { to: '/dispute', emoji: '⚖', previewClass: 'dispute', tag: 'M4', tagClass: 'pill-warm', title: '纠纷法庭', desc: '纠纷发起、双方在线举证、陪审团投票、管理员终审、裁决结果公示。' },
  { to: '/admin', emoji: '\U0001F4CA', previewClass: 'admin', tag: 'M5', tagClass: '', title: '管理后台', desc: '数据看板、用户管理、订单干预、敏感词库、权限配置、操作审计日志。' },
]
</script>
