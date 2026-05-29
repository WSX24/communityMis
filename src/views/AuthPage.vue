<template>
  <div style="min-height:100vh;display:grid;place-items:center;padding:40px 20px;">
    <div style="width:100%;max-width:440px;">
      <router-link to="/" class="back-link">&larr; 返回首页</router-link>

      <div class="auth-wrapper">
        <div class="auth-header">
          <div class="auth-logo">邻<span>帮</span></div>
          <p>社区互助服务平台</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab" :class="{ active: activeTab === 'login' }" @click="activeTab = 'login'">账号登录</button>
          <button class="auth-tab" :class="{ active: activeTab === 'register' }" @click="activeTab = 'register'">手机注册</button>
        </div>
        <!-- 登录表单 -->
        <div class="auth-body" v-if="activeTab === 'login'">
          <form @submit.prevent="handleLogin" novalidate>
            <div class="form-group">
              <label>手机号 / 账号</label>
              <input type="text" class="form-input" :class="{ error: loginErrors.account }" v-model="loginForm.account" placeholder="请输入手机号或账号" />
              <span class="form-error" v-if="loginErrors.account">请输入有效的手机号或账号</span>
            </div>
            <div class="form-group">
              <label>密码</label>
              <input type="password" class="form-input" :class="{ error: loginErrors.password }" v-model="loginForm.password" placeholder="请输入密码" />
              <span class="form-error" v-if="loginErrors.password">密码长度至少 6 位</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);cursor:pointer;">
                <input type="checkbox" style="accent-color:var(--accent);" v-model="loginForm.remember" /> 记住登录状态
              </label>
              <a href="#" style="font-size:13px;" @click.prevent="toast.show('请联系管理员重置密码', 'error')">忘记密码？</a>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;">登录</button>
          </form>
          <div class="divider">或使用以下方式登录</div>
          <div class="social-btns">
            <button class="btn-social" @click="toast.show('第三方登录暂未开放', 'error')">微信登录</button>
            <button class="btn-social" @click="toast.show('第三方登录暂未开放', 'error')">支付宝</button>
          </div>
        </div>

        <!-- 注册表单 -->
        <div class="auth-body" v-if="activeTab === 'register'">
          <form @submit.prevent="handleRegister" novalidate>
            <div class="form-group">
              <label>手机号 <span class="required">*</span></label>
              <input type="tel" class="form-input" :class="{ error: regErrors.phone }" v-model="regForm.phone" placeholder="请输入手机号" maxlength="11" />
              <span class="form-error" v-if="regErrors.phone">请输入有效的 11 位手机号</span>
            </div>
            <div class="form-group">
              <label>验证码 <span class="required">*</span></label>
              <div class="code-row">
                <input type="text" class="form-input" :class="{ error: regErrors.code }" v-model="regForm.code" placeholder="请输入短信验证码" maxlength="6" />
                <button type="button" class="btn-code" :disabled="codeCountdown > 0" @click="sendCode">
                  {{ codeCountdown > 0 ? codeCountdown + 's 后重试' : '获取验证码' }}
                </button>
              </div>
              <span class="form-error" v-if="regErrors.code">请输入 6 位验证码</span>
            </div>
            <div class="form-group">
              <label>设置密码 <span class="required">*</span></label>
              <input type="password" class="form-input" :class="{ error: regErrors.password }" v-model="regForm.password" placeholder="6-20 位，建议包含字母和数字" />
              <span class="form-error" v-if="regErrors.password">密码长度需在 6-20 位之间</span>
            </div>
            <div class="form-group">
              <label>确认密码 <span class="required">*</span></label>
              <input type="password" class="form-input" :class="{ error: regErrors.password2 }" v-model="regForm.password2" placeholder="请再次输入密码" />
              <span class="form-error" v-if="regErrors.password2">两次输入的密码不一致</span>
            </div>
            <div style="margin-bottom:20px;">
              <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--muted);cursor:pointer;">
                <input type="checkbox" v-model="regForm.agree" style="accent-color:var(--accent);margin-top:3px;" />
                <span>我已阅读并同意 <a href="#">用户服务协议</a> 和 <a href="#">隐私政策</a></span>
              </label>
              <span class="form-error" v-if="regErrors.agree">请先阅读并同意服务协议</span>
            </div>
            <button type="submit" class="btn btn-warm" style="width:100%;">注册并登录</button>
          </form>
        </div>

        <div class="auth-footer">
          登录即表示同意 <a href="#">服务条款</a> 与 <a href="#">隐私政策</a>
        </div>
      </div>
    </div>
  </div>
  <AiChatFAB />
</template>


<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import AiChatFAB from '@/components/AiChatFAB.vue'

const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()

const activeTab = ref('login')
onMounted(() => {
  if (window.location.hash === '#register') activeTab.value = 'register'
})

const loginForm = reactive({ account: '', password: '', remember: false })
const loginErrors = reactive({ account: false, password: false })

function handleLogin() {
  loginErrors.account = !loginForm.account.trim()
  loginErrors.password = !loginForm.password || loginForm.password.length < 6
  if (loginErrors.account || loginErrors.password) return
  auth.login({ account: loginForm.account, password: loginForm.password })
  toast.show('登录成功！即将跳转到个人中心...', 'success')
  setTimeout(() => router.push('/profile'), 1200)
}

const regForm = reactive({ phone: '', code: '', password: '', password2: '', agree: false })
const regErrors = reactive({ phone: false, code: false, password: false, password2: false, agree: false })

function handleRegister() {
  const phoneRe = /^1[3-9]\d{9}$/
  const codeRe = /^\d{6}$/
  regErrors.phone = !phoneRe.test(regForm.phone.trim())
  regErrors.code = !codeRe.test(regForm.code.trim())
  regErrors.password = !regForm.password || regForm.password.length < 6 || regForm.password.length > 20
  regErrors.password2 = regForm.password !== regForm.password2
  regErrors.agree = !regForm.agree
  if (Object.values(regErrors).some(Boolean)) return
  auth.register({ phone: regForm.phone, code: regForm.code, password: regForm.password })
  toast.show('注册成功！欢迎加入邻帮社区', 'success')
  setTimeout(() => router.push('/profile'), 1200)
}

const codeCountdown = ref(0)
let codeTimer = null

function sendCode() {
  const phoneRe = /^1[3-9]\d{9}$/
  if (!phoneRe.test(regForm.phone.trim())) {
    regErrors.phone = true
    return
  }
  regErrors.phone = false
  codeCountdown.value = 60
  codeTimer = setInterval(() => {
    codeCountdown.value--
    if (codeCountdown.value <= 0) {
      clearInterval(codeTimer)
      codeCountdown.value = 0
    }
  }, 1000)
  toast.show('验证码已发送至 ' + regForm.phone, 'success')
}
</script>

<style scoped>
.back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--muted); margin-bottom: 24px; text-decoration: none; }
.back-link:hover { color: var(--fg); }
.auth-wrapper { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: 0 12px 40px rgba(26, 24, 21, 0.1); overflow: hidden; }
.auth-header { text-align: center; padding: 36px 32px 20px; border-bottom: 1px solid var(--border); }
.auth-logo { font-family: var(--font-display); font-size: 28px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: var(--accent); }
.auth-logo span { color: var(--fg); }
.auth-header p { color: var(--muted); font-size: 13px; margin: 4px 0 0; }
.auth-tabs { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border); }
.auth-tab { padding: 14px; text-align: center; font-size: 15px; font-weight: 600; color: var(--muted); background: transparent; border: none; position: relative; transition: color 0.2s; cursor: pointer; }
.auth-tab.active { color: var(--accent); }
.auth-tab.active::after { content: ''; position: absolute; bottom: -1px; left: 20%; right: 20%; height: 2px; background: var(--accent); border-radius: 1px; }
.auth-tab:hover { color: var(--fg); }
.auth-body { padding: 32px; }
.auth-footer { padding: 20px 32px; text-align: center; border-top: 1px solid var(--border); font-size: 13px; color: var(--muted); }
.auth-footer a { color: var(--accent); }
.required { color: var(--danger); margin-left: 2px; }
.form-error { color: var(--danger); font-size: 12px; margin-top: 4px; }
.form-input.error { border-color: var(--danger); }
.code-row { display: grid; grid-template-columns: 1fr 120px; gap: var(--gap-sm); }
.btn-code { padding: 11px 8px; background: var(--fg-soft); color: var(--accent); border: 1px solid var(--border); border-radius: var(--radius); font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
.btn-code:hover { background: var(--accent-soft); }
.btn-code:disabled { color: var(--muted); cursor: not-allowed; opacity: 0.6; }
.divider { display: flex; align-items: center; gap: var(--gap-sm); margin: 24px 0; color: var(--muted); font-size: 12px; }
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.social-btns { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-sm); }
.btn-social { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--fg); font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
.btn-social:hover { background: var(--fg-soft); border-color: var(--fg); }
@media (max-width: 480px) {
  .auth-body { padding: 24px 20px; }
  .auth-header { padding: 28px 20px 16px; }
  .auth-footer { padding: 16px 20px; }
  .code-row { grid-template-columns: 1fr 100px; }
}
</style>
