<template>
  <button class="ai-fab" @click="open = !open" title="AI 助手小 T">💬</button>
  <Transition name="chat">
    <div v-if="open" class="ai-chat-panel">
      <div class="ai-chat-header">
        <span>🤖 小 T · AI 助手</span>
        <button @click="open = false">&times;</button>
      </div>
      <div class="ai-chat-body">
        <div class="ai-msg bot">
          你好！我是小 T，你的社区互助助手。我可以帮你：<br>
          · 推荐适合你技能的需求<br>
          · 解答平台使用疑问<br>
          · 引导纠纷处理流程
        </div>
        <div class="ai-msg user">我想找一些适合我的接单需求</div>
        <div class="ai-msg bot">
          好的！请先在个人中心设置你的职业技能标签，然后去需求大厅查看「智能推荐」列表。
        </div>
      </div>
      <div class="ai-chat-input">
        <input type="text" placeholder="输入你的问题..." v-model="input" @keyup.enter="send" />
        <button class="btn btn-primary btn-sm" @click="send">发送</button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref } from 'vue'

const open = ref(false)
const input = ref('')

function send() {
  if (!input.value.trim()) return
  // TODO: 接入真实 AI 接口
  input.value = ''
}
</script>

<style scoped>
.ai-chat-panel {
  position: fixed;
  bottom: 96px;
  right: 28px;
  z-index: 19;
  width: 360px;
  max-width: calc(100vw - 40px);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(26, 24, 21, 0.1);
  overflow: hidden;
}
.ai-chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 15px;
}
.ai-chat-header button {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--muted);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.ai-chat-body {
  padding: 16px 20px;
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ai-msg {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  max-width: 85%;
}
.ai-msg.bot {
  background: var(--fg-soft);
  color: var(--muted);
  align-self: flex-start;
}
.ai-msg.user {
  background: var(--accent-soft);
  color: var(--accent);
  align-self: flex-end;
}
.ai-chat-input {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
}
.ai-chat-input input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  outline: none;
}
.ai-chat-input input:focus {
  border-color: var(--accent);
}
.chat-enter-active,
.chat-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.chat-enter-from,
.chat-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
