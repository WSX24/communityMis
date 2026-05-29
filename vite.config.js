import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src') // 让@指向src目录
    }
  },
  // 提前配置好对接SpringBoot的跨域代理（后面直接用）
  server: {
    proxy: {
      '/api': {//后续可替换为服务器ip
        target: 'http://localhost:8080', // 你的SpringBoot后端地址
        changeOrigin: true
      }
    }
  }
})