<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const active = computed(() => {
  const p = route.path
  if (p.startsWith('/admin/sections')) return '/admin/sections'
  if (p.startsWith('/admin/history')) return '/admin/history'
  if (p.startsWith('/admin/review')) return '/admin/review'
  if (p.startsWith('/admin/staff')) return '/admin/staff'
  if (p.startsWith('/admin/stats')) return '/admin/stats'
  return '/admin/sections'
})
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
  min-width: 0;        /* ✅ главное: разрешаем колонке сжиматься */
  overflow-x: hidden;  /* чтобы не было общего горизонтального скролла */
}
</style>
