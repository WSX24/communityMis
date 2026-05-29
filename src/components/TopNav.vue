<template>
  <header class="topnav">
    <div class="container topnav-inner">
      <router-link to="/" class="logo">邻<span>帮</span></router-link>
      <nav>
        <router-link to="/demand" active-class="active">需求大厅</router-link>
        <router-link to="/profile" active-class="active">个人中心</router-link>
        <router-link to="/dispute" active-class="active">纠纷法庭</router-link>
        <router-link to="/admin" active-class="active">管理后台</router-link>
      </nav>
      <div class="nav-actions" v-if="!auth.isLoggedIn">
        <router-link to="/auth" class="btn btn-secondary btn-sm">登录</router-link>
        <router-link to="/auth" class="btn btn-primary btn-sm">注册</router-link>
      </div>
      <router-link to="/profile" v-else class="nav-actions" style="text-decoration:none;display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);">
        <span style="width:32px;height:32px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-weight:700;font-size:14px;">
          {{ auth.user?.name?.[0] || '用' }}
        </span>
        <span>{{ auth.user?.name || '用户' }}</span>
      </router-link>
    </div>
  </header>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
</script>
