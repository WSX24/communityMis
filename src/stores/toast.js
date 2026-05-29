import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useToastStore = defineStore('toast', () => {
  const message = ref('')
  const type = ref('success')
  const visible = ref(false)
  let timer = null

  function show(msg, t = 'success') {
    message.value = msg
    type.value = t
    visible.value = true
    clearTimeout(timer)
    timer = setTimeout(() => { visible.value = false }, 2500)
  }

  return { message, type, visible, show }
})
