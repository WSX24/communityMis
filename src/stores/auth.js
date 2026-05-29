import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
  const isLoggedIn = computed(() => !!token.value)

  async function login(credentials) {
    const res = {
      token: 'jwt_' + Date.now(),
      user: { id: 'TB-2026-0042', name: '李小邻', phone: '138****6789', role: 'user' }
    }
    token.value = res.token
    user.value = res.user
    localStorage.setItem('token', res.token)
    localStorage.setItem('user', JSON.stringify(res.user))
  }

  async function register(data) {
    const res = {
      token: 'jwt_' + Date.now(),
      user: { name: '新用户', phone: data.phone, role: 'user' }
    }
    token.value = res.token
    user.value = res.user
    localStorage.setItem('token', res.token)
    localStorage.setItem('user', JSON.stringify(res.user))
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return { token, user, isLoggedIn, login, register, logout }
})
