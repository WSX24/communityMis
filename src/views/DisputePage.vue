<template>
  <TopNav />
  <div class="container" style="padding-bottom:60px;">
    <div class="page-header">
      <div class="row-between">
        <div>
          <h1 style="font-family:var(--font-display);font-size:clamp(36px,4vw,48px);line-height:1.1;margin:0 0 4px;">纠纷法庭</h1>
          <p style="color:var(--muted);font-size:14px;">公正透明地处理社区互助纠纷 — 举证 · 陪审 · 裁决 · 公示</p>
        </div>
        <button class="btn btn-warm" @click="showNewDispute = true">发起纠纷</button>
      </div>
    </div>

    <div class="tabs">
      <button v-for="t in caseTabs" :key="t.key" class="tab" :class="{ active: caseTab === t.key }" @click="caseTab = t.key">{{ t.label }}</button>
    </div>

    <div v-for="c in filteredCases" :key="c.id" class="card">
      <div class="case-header">
        <div>
          <h3 style="font-size:17px;font-weight:600;margin:0;">{{ c.id }} · {{ c.title }}</h3>
          <p style="font-size:12px;color:var(--muted);margin-top:4px;">发起时间：{{ c.time }} · 关联订单 {{ c.order }}</p>
        </div>
        <span :class="['status', 'status-' + c.statusClass]">{{ c.statusText }}</span>
      </div>

      <div class="steps">
        <div v-for="(s, i) in 5" :key="i" class="step" :class="{ done: c.step > i + 1, active: c.step === i + 1 }">
          <div class="step-num">{{ i + 1 }}</div>{{ ['提交','举证','陪审','裁决','公示'][i] }}
        </div>
      </div>

      <div class="case-parties">
        <div class="party"><span class="party-avatar party-a">{{ c.plaintiff[0] }}</span> {{ c.plaintiff }}（发单方）</div>
        <span class="vs">VS</span>
        <div class="party"><span class="party-avatar party-b">{{ c.defendant[0] }}</span> {{ c.defendant }}（接单方）</div>
      </div>

      <p style="font-size:13px;color:var(--muted);">{{ c.summary }}</p>

      <div v-if="c.step === 3" style="margin:8px 0;">
        <span style="font-size:12px;color:var(--muted);">当前陪审投票：</span>
        <span style="font-size:12px;font-weight:600;">{{ c.votes.for }} 票支持发单方 · {{ c.votes.against }} 票支持接单方</span>
        <div class="vote-bar">
          <div class="vote-for" :style="{ width: c.votes.for / (c.votes.for + c.votes.against) * 100 + '%' }">支持发单方 {{ c.votes.for }}</div>
          <div class="vote-against" :style="{ width: c.votes.against / (c.votes.for + c.votes.against) * 100 + '%' }">支持接单方 {{ c.votes.against }}</div>
        </div>
      </div>

      <div v-if="c.verdict" class="verdict-box">
        <strong>裁决结果：</strong>{{ c.verdict }}
      </div>

      <div style="display:flex;gap:8px;margin-top:12px;">
        <button v-if="c.step === 3" class="btn btn-primary btn-sm" @click="openVote(c)">参与陪审</button>
        <button v-if="c.step === 2" class="btn btn-primary btn-sm" @click="showEvidence = true">提交举证</button>
        <button class="btn btn-secondary btn-sm" @click="viewCase(c)">查看详情</button>
      </div>
    </div>
  </div>

  <!-- New Dispute Modal -->
  <div class="modal-overlay" v-if="showNewDispute" @click.self="showNewDispute = false">
    <div class="modal">
      <button class="close-btn" @click="showNewDispute = false">&times;</button>
      <h2>发起纠纷</h2>
      <p style="color:var(--muted);font-size:13px;margin:4px 0 20px;">请如实陈述争议情况，平台将公正处理。</p>
      <form @submit.prevent="submitDispute">
        <div class="form-group"><label>关联订单号 *</label><input type="text" class="form-input" v-model="newDispute.order" placeholder="例如：TB-2026-0892" required /></div>
        <div class="form-group"><label>争议类型 *</label>
          <select class="form-select" v-model="newDispute.type" required>
            <option value="">选择争议类型</option>
            <option>服务质量不达标</option><option>未按时完成服务</option><option>服务内容与约定不符</option><option>费用/社区币争议</option><option>恶意差评争议</option><option>其他</option>
          </select></div>
        <div class="form-group"><label>争议描述 *</label><textarea class="form-textarea" v-model="newDispute.desc" placeholder="详细描述争议经过" required></textarea></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
          <button type="button" class="btn btn-secondary" @click="showNewDispute = false">取消</button>
          <button type="submit" class="btn btn-warm">提交纠纷申请</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Vote Modal -->
  <div class="modal-overlay" v-if="showVote" @click.self="showVote = false">
    <div class="modal">
      <button class="close-btn" @click="showVote = false">&times;</button>
      <h2>参与陪审投票</h2>
      <div class="form-group" style="margin-top:16px;"><label>你的投票</label>
        <div style="display:flex;gap:12px;margin-top:8px;">
          <label class="vote-option"><input type="radio" v-model="voteChoice" value="plaintiff" /> 支持发单方</label>
          <label class="vote-option"><input type="radio" v-model="voteChoice" value="defendant" /> 支持接单方</label>
          <label class="vote-option"><input type="radio" v-model="voteChoice" value="abstain" /> 弃权</label>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-secondary" @click="showVote = false">取消</button>
        <button class="btn btn-primary" @click="submitVote">确认投票</button>
      </div>
    </div>
  </div>

  <!-- Evidence Modal -->
  <div class="modal-overlay" v-if="showEvidence" @click.self="showEvidence = false">
    <div class="modal">
      <button class="close-btn" @click="showEvidence = false">&times;</button>
      <h2>提交举证材料</h2>
      <div class="form-group" style="margin-top:16px;"><label>举证描述 *</label><textarea class="form-textarea" v-model="evidenceDesc" placeholder="描述你的举证内容" required></textarea></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-secondary" @click="showEvidence = false">取消</button>
        <button class="btn btn-primary" @click="submitEvidence">提交举证</button>
      </div>
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

const caseTab = ref('all')
const caseTabs = [{ key: 'all', label: '全部案件' }, { key: 'active', label: '审理中' }, { key: 'closed', label: '已裁决' }]

const cases = ref([
  { id: '#DSP-2026-0018', title: '空调维修服务质量争议', time: '2026-05-27', order: '#TB-2026-0892', statusClass: 'warn', statusText: '陪审投票中', step: 3, plaintiff: '赵阿姨', defendant: '李小邻', summary: '赵阿姨认为空调维修后仍有异响要求退还社区币；李小邻认为维修达到约定标准。', votes: { for: 8, against: 4 }, verdict: '' },
  { id: '#DSP-2026-0021', title: '家政保洁未达到约定标准', time: '2026-05-28', order: '#TB-2026-0915', statusClass: 'info', statusText: '举证阶段', step: 2, plaintiff: '吴女士', defendant: '陈姐', summary: '吴女士认为油烟机清洗不彻底；陈姐认为已按标准操作。', votes: { for: 0, against: 0 }, verdict: '' },
  { id: '#DSP-2026-0012', title: '家教辅导时间不足争议', time: '2026-05-20', order: '#TB-2026-0755', statusClass: 'done', statusText: '已裁决', step: 5, plaintiff: '陈姐', defendant: '小王', summary: '陈姐认为辅导时间不足；小王认为非主观故意。', votes: { for: 11, against: 2 }, verdict: '支持发单方部分诉求。退还50%社区币(6枚)，双方信用分不做扣减。' },
])

const filteredCases = computed(() => {
  if (caseTab.value === 'all') return cases.value
  if (caseTab.value === 'active') return cases.value.filter(c => c.step < 5)
  return cases.value.filter(c => c.step === 5)
})

const showNewDispute = ref(false)
const newDispute = reactive({ order: '', type: '', desc: '' })
function submitDispute() { showNewDispute.value = false; toast.show('纠纷申请已提交，请等待审核', 'success'); newDispute.order = ''; newDispute.type = ''; newDispute.desc = '' }

const showVote = ref(false); const voteChoice = ref('')
function openVote(c) { showVote.value = true; voteChoice.value = '' }
function submitVote() { if (!voteChoice.value) { toast.show('请选择投票立场', 'error'); return }; showVote.value = false; toast.show('投票成功！感谢参与社区陪审', 'success') }

const showEvidence = ref(false); const evidenceDesc = ref('')
function submitEvidence() { showEvidence.value = false; toast.show('举证材料已提交', 'success'); evidenceDesc.value = '' }

function viewCase(c) { toast.show(c.title + ' | ' + c.plaintiff + ' vs ' + c.defendant + ' | ' + c.statusText, 'success') }
</script>

<style scoped>
.page-header{padding:32px 0 24px}
.case-header{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--gap-sm);flex-wrap:wrap}
.steps{display:flex;gap:0;margin:16px 0}.step{flex:1;text-align:center;font-size:12px;font-weight:600;color:var(--muted);position:relative;padding:12px 8px}.step.active{color:var(--accent)}.step.done{color:var(--success)}.step::after{content:"";position:absolute;top:50%;right:-50%;width:100%;height:2px;background:var(--border);z-index:0}.step:last-child::after{display:none}
.step-num{width:28px;height:28px;border-radius:50%;background:var(--border);color:var(--muted);display:inline-grid;place-items:center;font-size:13px;font-weight:700;margin-bottom:4px;position:relative;z-index:1}.step.active .step-num{background:var(--accent);color:var(--surface)}.step.done .step-num{background:var(--success);color:var(--surface)}
.case-parties{display:flex;gap:var(--gap-md);align-items:center;padding:12px 0;margin:12px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}.party{display:flex;align-items:center;gap:var(--gap-xs);font-size:14px;font-weight:500}.party-avatar{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;color:var(--surface)}.party-a{background:var(--accent)}.party-b{background:var(--warn)}.vs{font-family:var(--font-display);font-size:20px;color:var(--muted)}
.vote-bar{display:flex;height:32px;border-radius:var(--radius-sm);overflow:hidden;margin-top:8px}.vote-for{background:var(--accent);display:flex;align-items:center;justify-content:center;color:var(--surface);font-size:12px;font-weight:600}.vote-against{background:var(--danger);display:flex;align-items:center;justify-content:center;color:var(--surface);font-size:12px;font-weight:600}
.verdict-box{background:var(--success-soft);border:1px solid var(--success);border-radius:var(--radius);padding:12px 16px;margin-top:12px;font-size:13px}.verdict-box strong{color:var(--success)}
.vote-option{display:flex;align-items:center;gap:6px;cursor:pointer;padding:10px 16px;border:1px solid var(--border);border-radius:var(--radius);flex:1;justify-content:center}
@media(max-width:640px){.steps{font-size:10px}.step-num{width:22px;height:22px;font-size:11px}.case-parties{flex-direction:column;align-items:flex-start;gap:8px}}
</style>
