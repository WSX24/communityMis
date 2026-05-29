<template>
  <Transition name="toast">
    <div v-if="toast.visible" :class="['toast', 'toast-' + toast.type]" style="display:block;">
      {{ toast.message }}
    </div>
  </Transition>
</template>

<script setup>
import { useToastStore } from '@/stores/toast'
const toast = useToastStore()
</script>

<style scoped>
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 500;
  z-index: 200;
  pointer-events: none;
}
.toast-success {
  background: var(--success-soft);
  color: var(--success);
  border: 1px solid var(--success);
}
.toast-error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid var(--danger);
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}
</style>
