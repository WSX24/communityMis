import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/',        name: 'home',     component: () => import('@/views/HomePage.vue') },
  { path: '/auth',    name: 'auth',     component: () => import('@/views/AuthPage.vue') },
  { path: '/demand',  name: 'demand',   component: () => import('@/views/DemandHallPage.vue') },
  { path: '/profile', name: 'profile',  component: () => import('@/views/ProfilePage.vue'),  meta: { requiresAuth: true } },
  { path: '/dispute', name: 'dispute',  component: () => import('@/views/DisputePage.vue'),  meta: { requiresAuth: true } },
  { path: '/admin',   name: 'admin',    component: () => import('@/views/AdminPage.vue'),    meta: { requiresAuth: true, role: 'admin' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { top: 0 } },
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isLoggedIn) return next('/auth')
  if (to.meta.role === 'admin' && auth.user?.role !== 'admin') return next('/')
  next()
})

export default router
