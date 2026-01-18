import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', component: () => import('@/pages/Login.vue') },
  {
    path: '/admin',
    component: () => import('@/pages/AdminLayout.vue'),
    children: [
      { path: 'sections', component: () => import('@/pages/Sections.vue') },
      { path: 'history', component: () => import('@/pages/History.vue') },
      { path: 'staff', component: () => import('@/pages/Staff.vue') },
      { path: 'stats', component: () => import('@/pages/Stats.vue') },
      { path: 'review', component: () => import('@/pages/Review.vue') },
      { path: '', redirect: '/admin/sections' },
    ],
    meta: { requiresAdmin: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/admin/sections' },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.init()
  if (to.meta.requiresAdmin) {
    if (!auth.fbUser || auth.profile?.role !== 'admin') return '/login'
  }
  if (to.path === '/login' && auth.profile?.role === 'admin') return '/admin'
})

export default router
