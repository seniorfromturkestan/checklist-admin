<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const active = computed(() => {
  const p = route.path
  if (p.startsWith('/admin/sections')) return '/admin/sections'
  if (p.startsWith('/admin/history')) return '/admin/history'
  if (p.startsWith('/admin/review')) return '/admin/review'
  if (p.startsWith('/admin/staff')) return '/admin/staff'
  if (p.startsWith('/admin/stats')) return '/admin/stats'
  return '/admin/sections'
})

const adminName = computed(() => {
  const p = auth.profile
  return (p?.name || p?.email || p?.login || 'Админ') as string
})

const onLogout = async () => {
  try {
    await auth.logout()
    ElMessage.success('Вы вышли из системы')
    await router.replace('/login')
  } catch (err) {
    console.error('Logout error:', err)
    ElMessage.success('Вы вышли из системы')
    await router.replace('/login')
  }
}
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar__title">Checklist Admin</div>

      <el-menu :default-active="active" router class="sidebar__menu">
        <el-menu-item index="/admin/sections">Разделы</el-menu-item>
        <el-menu-item index="/admin/history">История</el-menu-item>
        <el-menu-item index="/admin/review">Проверка</el-menu-item>
        <el-menu-item index="/admin/staff">Сотрудники</el-menu-item>
        <el-menu-item index="/admin/stats">Статистика</el-menu-item>
      </el-menu>
    </aside>

    <main class="content">
      <div class="topbar">
        <div class="topbar__left">
          <div class="topbar__title">Добро пожаловать!</div>
          <div class="topbar__user">{{ adminName }}</div>
        </div>
        <el-button type="danger" plain @click="onLogout">Выйти</el-button>
      </div>

      <router-view />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}

.sidebar {
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  padding: 14px;
}

.sidebar__title {
  font-weight: 900;
  font-size: 18px;
  margin-bottom: 12px;
}

.sidebar__menu {
  width: 100%;
}

.content {
  padding: 16px;
  min-width: 0;
  overflow-x: hidden;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 12px;
}

.topbar__left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.topbar__title {
  font-weight: 900;
  font-size: 14px;
  opacity: 0.8;
}

.topbar__user {
  font-weight: 900;
  font-size: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
