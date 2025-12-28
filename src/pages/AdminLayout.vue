<!-- src/pages/AdminLayout.vue -->
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter, useRoute } from 'vue-router'
import { computed } from 'vue'
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const active = computed(() => route.path)
const logout = async () => {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <el-container style="height:100vh;">
    <el-aside width="220px" style="border-right:1px solid var(--el-border-color);">
      <div style="padding:16px; font-weight:700;">Админ • Менеджер точки</div>
      <el-menu :default-active="active" router>
        <el-menu-item index="/admin/sections">
          <i class="el-icon-menu" /> <span style="margin-left:8px;">Секции</span>
        </el-menu-item>
        <el-menu-item index="/admin/history">
          <i class="el-icon-document" /> <span style="margin-left:8px;">История</span>
        </el-menu-item>
        <el-menu-item index="/admin/stats">
          <i class="el-icon-data-analysis" /> <span style="margin-left:8px;">Статистика</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header style="display:flex; align-items:center; justify-content:space-between;">
        <div>Панель управления</div>
        <div style="display:flex; gap:12px; align-items:center;">
          <el-tag type="info" v-if="auth.profile">
            {{ auth.profile.name || 'Admin' }}
          </el-tag>
          <el-button @click="logout">Выйти</el-button>
        </div>
      </el-header>
      <el-main style="background: var(--el-fill-color-light);">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>
