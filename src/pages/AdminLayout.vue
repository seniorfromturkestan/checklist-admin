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

const shouldRender = computed(() => {
  // Не рендерим если идет процесс выхода или нет профиля
  return !auth.loggingOut && auth.profile !== null
})

const onLogout = async () => {
  await auth.logout()
  ElMessage.success('Вы вышли из системы')
  await router.replace('/login')
}
</script>

<template>
  <div v-if="shouldRender" class="layout">
    <aside class="sidebar">
      <div class="sidebar__header">
        <div class="logo">
          <img src="../assets/img/checklist-logo.png" alt="">

        </div>
        <div class="sidebar__title">Checklist Admin</div>
      </div>

      <el-menu :default-active="active" router class="sidebar__menu">
        <el-menu-item index="/admin/sections">
          <span class="menu-text">Разделы</span>
        </el-menu-item>
        <el-menu-item index="/admin/history">
          <span class="menu-text">История</span>
        </el-menu-item>
        <el-menu-item index="/admin/review">
          <span class="menu-text">Проверка</span>
        </el-menu-item>
        <el-menu-item index="/admin/staff">
          <span class="menu-text">Сотрудники</span>
        </el-menu-item>
        <el-menu-item index="/admin/stats">
          <span class="menu-text">Статистика</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <main class="content">
      <div class="topbar">
        <div class="topbar__left">
          <div class="topbar__title">Добро пожаловать!</div>
          <div class="topbar__user">{{ adminName }}</div>
        </div>
        <button class="logout-btn" @click="onLogout">Выйти</button>
      </div>

      <div class="content__body">
        <router-view />
      </div>
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  min-height: 100vh;
  background: #ffffff;
  gap: 16px;
  padding: 16px;
  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.sidebar {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 24px;
  height: fit-content;
  position: sticky;
  top: 16px;
}

.sidebar__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.logo {
  width: 40px;
  height: 40px;
  background: rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(8px);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}

.logo img {
  width: 36px;
  height: 36px;
  color: #1a1a1a;
}

.sidebar__title {
  font-weight: 600;
  font-size: 18px;
  color: #1a1a1a;
}

.sidebar__menu {
  border: none;
  background: transparent;
}

:deep(*) {
  font-family: inherit;
}

:deep(.el-menu-item) {
  height: 44px;
  line-height: 44px;
  margin-bottom: 4px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid transparent;
  transition: all 0.3s ease;
  color: #666666;
  font-weight: 500;
}

:deep(.el-menu-item:hover) {
  background: rgba(0, 0, 0, 0.03);
  backdrop-filter: blur(8px);
  color: #1a1a1a;
}

:deep(.el-menu-item.is-active) {
  background: rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #1a1a1a;
  font-weight: 600;
}

.menu-text {
  font-size: 15px;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.topbar {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
}

.topbar__left {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.topbar__title {
  font-weight: 500;
  font-size: 14px;
  color: #666666;
}

.topbar__user {
  font-weight: 600;
  font-size: 20px;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.logout-btn {
  height: 40px;
  padding: 0 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #1a1a1a;
  transition: all 0.3s ease;
  cursor: pointer;
}

.logout-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.logout-btn:active {
  transform: translateY(0);
}

.content__body {
  min-height: 400px;
}

/* Адаптивность для планшетов */
@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 240px 1fr;
    gap: 12px;
    padding: 12px;
  }

  .sidebar {
    padding: 20px;
  }

  .topbar {
    padding: 16px 20px;
  }

  .content__body {
    padding: 20px;
  }
}

/* Адаптивность для мобильных устройств */
@media (max-width: 768px) {
  .layout {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 12px;
  }

  .sidebar {
    position: static;
    height: auto;
  }

  .sidebar__header {
    margin-bottom: 20px;
    padding-bottom: 20px;
  }

  .topbar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .topbar__left {
    text-align: center;
  }

  .topbar__user {
    font-size: 18px;
  }

  .logout-btn {
    width: 100%;
  }

  .content__body {
    padding: 16px;
  }
}

/* Очень маленькие экраны */
@media (max-width: 480px) {
  .layout {
    padding: 8px;
    gap: 8px;
  }

  .sidebar {
    padding: 16px;
    border-radius: 12px;
  }

  .sidebar__header {
    margin-bottom: 16px;
    padding-bottom: 16px;
  }

  .logo {
    width: 36px;
    height: 36px;
  }

  .logo svg {
    width: 18px;
    height: 18px;
  }

  .sidebar__title {
    font-size: 16px;
  }

  :deep(.el-menu-item) {
    height: 40px;
    line-height: 40px;
  }

  .menu-text {
    font-size: 14px;
  }

  .topbar {
    padding: 16px;
    border-radius: 12px;
  }

  .topbar__user {
    font-size: 16px;
  }

  .content__body {
    padding: 16px;
    border-radius: 12px;
  }
}

/* Element Plus Button Overrides */
:deep(.el-button--primary) {
  background: rgba(0, 0, 0, 0.9) !important;
  backdrop-filter: blur(8px);
  border-color: rgba(0, 0, 0, 0.2) !important;
  color: #ffffff !important;
  box-shadow: none !important;
}

:deep(.el-button--primary:hover) {
  background: rgba(0, 0, 0, 1) !important;
  border-color: rgba(0, 0, 0, 0.3) !important;
}

:deep(.el-button--primary:focus) {
  background: rgba(0, 0, 0, 0.9) !important;
  border-color: rgba(0, 0, 0, 0.2) !important;
}

:deep(.el-button--default) {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: #1a1a1a;
}

:deep(.el-button--default:hover) {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.2);
}
</style>