<script setup lang="ts">
  import { computed } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { ElMessage } from 'element-plus'
  import { useAuthStore } from '@/stores/auth'

  defineOptions({ name: 'SuperAdminLayout' })

  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()

  // const displayName = computed(() => {
  //   const p = auth.profile
  //   return p?.name || p?.email || p?.login || 'Superadmin'
  // })

  const active = computed(() => route.path)

  const logout = async () => {
    await auth.logout()
    ElMessage.success('Вы вышли')
    await router.replace('/login')
  }
  </script>

  <template>
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">Checklist SuperADM</div>

        <el-menu :default-active="active" router class="menu">
          <el-menu-item index="/super/overview">Обзор</el-menu-item>
          <el-menu-item index="/super/coffeeshops">Кофешопы</el-menu-item>
          <el-menu-item index="/super/users">Пользователи</el-menu-item>
        </el-menu>
      </aside>

      <main class="content">
        <div class="topbar">
          <div class="left">
            <div class="title">Панель SUPERADMIN</div>
          </div>

          <div class="right">
            <!-- <el-tag type="info" effect="plain">SUPERADMIN</el-tag>
            <div class="user">{{ displayName }}</div> -->
            <el-button type="danger" plain @click="logout">Выйти</el-button>
          </div>
        </div>

        <div class="page">
          <router-view />
        </div>
      </main>
    </div>
  </template>

  <style scoped>
  .layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    height: 100vh;
    background: #f7f8fa;
  }
  .sidebar {
    background: #fff;
    border-right: 1px solid #ececec;
    padding: 16px 12px;
  }
  .brand {
    font-weight: 900;
    font-size: 18px;
    padding: 8px 12px 14px;
  }
  .menu {
    border-right: none;
  }
  .content {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .topbar {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    background: #fff;
    border-bottom: 1px solid #ececec;
  }
  .title {
    font-weight: 800;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .user {
    font-weight: 700;
    opacity: 0.85;
  }
  .page {
    padding: 18px;
    overflow: auto;
  }
  </style>