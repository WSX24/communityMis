//配置 Axios 请求工具（对接 SpringBoot）

import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const http = axios.create({
  baseURL: '/api', // 对应你的SpringBoot后端接口前缀
  timeout: 10000
})

// 请求拦截器：自动携带JWT Token
http.interceptors.request.use(config => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

// 响应拦截器：适配后端统一Result响应体
http.interceptors.response.use(
  res => {
    // 后端code=200时直接返回data
    if (res.data.code === 200) {
      return res.data.data
    }
    // 非200抛出错误
    return Promise.reject(res.data)
  },
  err => {
    // 401未登录：清空状态跳登录
    if (err.response?.status === 401) {
      const auth = useAuthStore()
      auth.logout()
      router.push('/auth')
    }
    return Promise.reject(err)
  }
)

export default http