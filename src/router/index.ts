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
  {
    path: '/super',
    component: () => import('@/pages/SuperLayout.vue'),
    children: [
      { path: 'coffeeshops', component: () => import('@/pages/SuperCoffeeshops.vue') },
      { path: 'users', component: () => import('@/pages/SuperUsers.vue') },
      { path: 'overview', component: () => import('@/pages/SuperOverview.vue') },
      { path: '', redirect: '/super/overview' },
    ],
    meta: { requiresSuperadmin: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/admin/sections' },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.init()

  if (to.meta.requiresSuperadmin) {
    if (!auth.fbUser || auth.profile?.role !== 'superadmin') return '/login'
  }

  if (to.meta.requiresAdmin) {
    if (!auth.fbUser || auth.profile?.role !== 'admin') return '/login'
  }

  if (to.path === '/login') {
    if (auth.profile?.role === 'superadmin') return '/super'
    if (auth.profile?.role === 'admin') return '/admin'
  }
})

export default router
