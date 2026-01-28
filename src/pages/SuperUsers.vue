<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query } from 'firebase/firestore'
  import { db } from '@/firebase'
  import { getFunctions, httpsCallable } from 'firebase/functions'

  defineOptions({ name: 'SuperUsersPage' })

  type Role = 'superadmin' | 'admin' | 'staff' | string

  type UserRow = {
    id: string
    name: string
    login: string
    role: Role
    coffeeshop_id: string | null
    created_at: number | null
  }

  type CoffeeshopRow = {
    id: string
    name: string
  }


  const loading = ref(false)
  const users = ref<UserRow[]>([])
  const coffeeshops = ref<CoffeeshopRow[]>([])

  const filterRole = ref<Role | 'all'>('all')
  const filterShop = ref<string>('') // string id
  const search = ref('')

  const dialog = ref(false)
  const form = ref({
    name: '',
    email: '',
    password: '',
    role: 'admin' as Role,
    coffeeshop_id: '',
  })

  const resetForm = () => {
    form.value = { name: '', email: '', password: '', role: 'admin', coffeeshop_id: '' }
  }

  // Маппинг ID -> название кофешопа
  const coffeeshopMap = computed(() => {
    const map: Record<string, string> = {}
    coffeeshops.value.forEach(shop => {
      map[shop.id] = shop.name
    })
    return map
  })

  // Получить название кофешопа по ID
  const getShopName = (id: string | null) => {
    if (!id) return '—'
    return coffeeshopMap.value[id] || id
  }

  // Загрузка кофешопов
  const loadCoffeeshops = async () => {
    try {
      const q = query(collection(db, 'coffeeshops'), orderBy('created_at', 'desc'))
      const snaps = await getDocs(q)
      coffeeshops.value = snaps.docs.map((d) => {
        const data = d.data() as Record<string, unknown>
        return {
          id: d.id,
          name: typeof data['name'] === 'string' ? data['name'] : d.id,
        }
      })
    } catch (e) {
      console.error('Failed to load coffeeshops:', e)
    }
  }

  const load = async () => {
    try {
      loading.value = true
      const q = query(collection(db, 'Users'), orderBy('created_at', 'desc'))
      const snaps = await getDocs(q)
      users.value = snaps.docs.map((d) => {
        const data = d.data() as Record<string, unknown>
        return {
          id: d.id,
          name: typeof data['name'] === 'string' ? data['name'] : '—',
          login:
            typeof data['login'] === 'string'
              ? data['login']
              : typeof data['email'] === 'string'
                ? data['email']
                : '—',
          role: typeof data['role'] === 'string' ? (data['role'] as Role) : 'staff',
          coffeeshop_id: data['coffeeshop_id'] == null ? null : String(data['coffeeshop_id']),
          created_at: typeof data['created_at'] === 'number' ? data['created_at'] : null,
        }
      })
    } catch (e) {
      console.error(e)
      ElMessage.error('Не удалось загрузить Users')
    } finally {
      loading.value = false
    }
  }

  const createUser = async () => {
    const email = form.value.email.trim()
    const pass = form.value.password.trim()
    const name = form.value.name.trim()
    const role = form.value.role
    const shop = form.value.coffeeshop_id.trim()

    if (!email) return ElMessage.warning('Введите email')
    if (!pass) return ElMessage.warning('Введите пароль')
    if (!name) return ElMessage.warning('Введите имя')

    if (role !== 'superadmin' && !shop) {
      return ElMessage.warning('Для admin/staff обязателен кофешоп')
    }

    try {
      const fn = httpsCallable(getFunctions(), 'createUserAccount')

      try {
        const res = await fn({
          email,
          password: pass,
          name,
          role,
          coffeeshop_id: role === 'superadmin' ? null : shop,
        })

        const data = res.data as Record<string, unknown>
        if (typeof data?.uid === 'string') {
          ElMessage.success(`Пользователь создан (uid: ${data.uid})`)
          dialog.value = false
          resetForm()
          await load()
          return
        }
      } catch (e) {
        console.warn('createUserAccount not available, fallback to Firestore only', e)
      }

      await addDoc(collection(db, 'Users'), {
        name,
        login: email,
        email,
        password: pass,
        role,
        coffeeshop_id: role === 'superadmin' ? null : shop,
        created_at: Date.now(),
      })

      ElMessage.success('Создан профиль в Firestore (без Auth). Лучше сделать через Cloud Function.')
      dialog.value = false
      resetForm()
      await load()
    } catch (e) {
      console.error(e)
      ElMessage.error('Ошибка при создании пользователя')
    }
  }

  const deleteUser = async (user: UserRow) => {
    try {
      await ElMessageBox.confirm(
        `Вы уверены, что хотите удалить пользователя "${user.name}" (${user.login})?`,
        'Подтверждение удаления',
        {
          confirmButtonText: 'Удалить',
          cancelButtonText: 'Отмена',
          type: 'warning',
        }
      )

      // Удаляем документ из Firestore
      await deleteDoc(doc(db, 'Users', user.id))

      ElMessage.success('Пользователь удален')
      await load()
    } catch (e) {
      if (e === 'cancel') {
        // Пользователь отменил удаление
        return
      }
      console.error('Delete user error:', e)
      ElMessage.error('Ошибка при удалении пользователя')
    }
  }

  const filtered = computed(() => {
    const s = search.value.trim().toLowerCase()
    return users.value.filter((u) => {
      if (filterRole.value !== 'all' && u.role !== filterRole.value) return false
      if (filterShop.value.trim() && String(u.coffeeshop_id || '') !== filterShop.value.trim())
        return false
      if (!s) return true

      const shopName = getShopName(u.coffeeshop_id).toLowerCase()
      return (
        u.name.toLowerCase().includes(s) ||
        u.login.toLowerCase().includes(s) ||
        shopName.includes(s) ||
        u.role.toLowerCase().includes(s)
      )
    })
  })

  onMounted(async () => {
    await loadCoffeeshops()
    await load()
  })
</script>

<template>
  <div class="users-page">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">Пользователи</h1>
        <p class="page-subtitle">Создание admin/staff и контроль по кофейням</p>
      </div>
      <button class="create-btn" @click="dialog = true">
        <span class="btn-icon">+</span>
        Создать пользователя
      </button>
    </div>

    <div class="content-card">
      <div class="filters-wrapper">
        <el-select v-model="filterRole" placeholder="Роль" class="filter-select">
          <el-option label="Все роли" value="all" />
          <el-option label="superadmin" value="superadmin" />
          <el-option label="admin" value="admin" />
          <el-option label="staff" value="staff" />
        </el-select>

        <el-select
          v-model="filterShop"
          placeholder="Фильтр по кофешопу"
          class="filter-input"
          clearable
        >
          <el-option label="Все кофешопы" value="" />
          <el-option
            v-for="shop in coffeeshops"
            :key="shop.id"
            :label="shop.name"
            :value="shop.id"
          />
        </el-select>

        <el-input
          v-model="search"
          placeholder="Поиск: имя / email / role / shop"
          class="filter-search"
        />

        <button class="refresh-btn" @click="load">Обновить</button>
      </div>

      <div class="table-wrapper">
        <el-table :data="filtered" v-loading="loading">
          <el-table-column prop="name" label="Имя" min-width="180" />

          <el-table-column prop="login" label="Email/Login" min-width="220" />

          <el-table-column label="Роль" width="140">
            <template #default="{ row }">
              <span :class="['role-badge', `role-badge--${row.role}`]">
                {{ row.role }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="Кофешоп" min-width="180">
            <template #default="{ row }">
              <span v-if="row.coffeeshop_id" class="shop-name">
                {{ getShopName(row.coffeeshop_id) }}
              </span>
              <span v-else class="no-data">—</span>
            </template>
          </el-table-column>

          <el-table-column label="Действия" width="200">
            <template #default="{ row }">
              <div class="action-buttons">
                <button
                  class="stats-btn"
                  :disabled="!row.coffeeshop_id"
                  @click="$router.push({ path: '/super/overview', query: { shop: row.coffeeshop_id } })"
                >
                  Статистика
                </button>
                <button class="delete-btn" @click="deleteUser(row)">
                  Удалить
                </button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <el-dialog v-model="dialog" title="Создать пользователя" width="560px" @closed="resetForm">
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="Имя">
            <el-input v-model="form.name" placeholder="Aiya" />
          </el-form-item>
          <el-form-item label="Роль">
            <el-select v-model="form.role" style="width: 100%">
              <el-option label="admin" value="admin" />
              <el-option label="staff" value="staff" />
              <el-option label="superadmin" value="superadmin" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="Email (login)">
          <el-input v-model="form.email" placeholder="user@mail.ru" />
        </el-form-item>

        <el-form-item label="Пароль">
          <el-input v-model="form.password" show-password placeholder="password" />
        </el-form-item>

        <el-form-item
          v-if="form.role !== 'superadmin'"
          label="Кофешоп (обязательно для admin/staff)"
        >
          <el-select v-model="form.coffeeshop_id" placeholder="Выберите кофешоп" style="width: 100%">
            <el-option
              v-for="shop in coffeeshops"
              :key="shop.id"
              :label="shop.name"
              :value="shop.id"
            />
          </el-select>
        </el-form-item>

        <div v-if="form.role === 'superadmin'" class="form-note">
          Для superadmin кофешоп не требуется
        </div>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <button class="cancel-btn" @click="dialog = false">Отмена</button>
          <button class="submit-btn" @click="createUser">Создать</button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.users-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.page-header {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.header-content {
  flex: 1;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 4px 0;
}

.page-subtitle {
  font-size: 14px;
  color: #666666;
  margin: 0;
}

.create-btn {
  height: 40px;
  padding: 0 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.2);
  color: #ffffff;
  cursor: pointer;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.create-btn:hover {
  background: rgba(0, 0, 0, 1);
  transform: translateY(-1px);
}

.create-btn:active {
  transform: translateY(0);
}

.btn-icon {
  font-size: 18px;
  font-weight: 600;
}

.content-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 20px;
}

.filters-wrapper {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-select {
  width: 180px;
}

.filter-input {
  width: 220px;
}

.filter-search {
  flex: 1;
  max-width: 360px;
}

.refresh-btn {
  height: 40px;
  padding: 0 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #1a1a1a;
  cursor: pointer;
  transition: all 0.3s ease;
}

.refresh-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.table-wrapper {
  width: 100%;
  overflow-x: auto;
}

.role-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

.role-badge--superadmin {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.role-badge--admin {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.role-badge--staff {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.shop-name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
}

.no-data {
  color: #999999;
}

.action-buttons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.stats-btn {
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
  color: #22c55e;
  cursor: pointer;
  transition: all 0.3s ease;
}

.stats-btn:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.2);
}

.stats-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delete-btn {
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #ef4444;
  cursor: pointer;
  transition: all 0.3s ease;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-note {
  font-size: 13px;
  color: #666666;
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  margin-top: 8px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.cancel-btn,
.submit-btn {
  height: 40px;
  padding: 0 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  color: #1a1a1a;
}

.cancel-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.submit-btn {
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
  color: #ffffff;
  border-color: rgba(0, 0, 0, 0.2);
}

.submit-btn:hover {
  background: rgba(0, 0, 0, 1);
}

/* Element Plus overrides */
:deep(*) {
  font-family: inherit;
}

:deep(.el-overlay) {
  background-color: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(8px);
}

:deep(.el-table) {
  background: transparent;
  color: #1a1a1a;
}

:deep(.el-table__header-wrapper) {
  background: transparent;
}

:deep(.el-table th.el-table__cell) {
  background: rgba(0, 0, 0, 0.03);
  backdrop-filter: blur(8px);
  color: #666666;
  font-weight: 600;
  font-size: 13px;
  border: none;
}

:deep(.el-table td.el-table__cell) {
  background: transparent;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

:deep(.el-table__row:hover > td) {
  background: rgba(0, 0, 0, 0.02) !important;
}

:deep(.el-table::before) {
  display: none;
}

:deep(.el-select .el-input__wrapper) {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
}

:deep(.el-select .el-input__wrapper:hover) {
  border-color: rgba(0, 0, 0, 0.2);
}

:deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
}

:deep(.el-input__wrapper:hover) {
  border-color: rgba(0, 0, 0, 0.2);
}

:deep(.el-input__wrapper.is-focus) {
  border-color: rgba(0, 0, 0, 0.3);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

:deep(.el-dialog) {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

:deep(.el-dialog__header) {
  padding: 24px 24px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

:deep(.el-dialog__title) {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
}

:deep(.el-dialog__body) {
  padding: 24px;
}

:deep(.el-dialog__footer) {
  padding: 16px 24px 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: #333333;
  font-size: 14px;
  margin-bottom: 8px;
}

:deep(.el-button--primary) {
  background: rgba(0, 0, 0, 0.9) !important;
  backdrop-filter: blur(8px);
  border-color: rgba(0, 0, 0, 0.2) !important;
  color: #ffffff !important;
  box-shadow: none !important;
}

:deep(.el-button--primary:hover) {
  background: rgba(0, 0, 0, 1) !important;
}

:deep(.el-button--danger) {
  background: rgba(239, 68, 68, 0.9) !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
  color: #ffffff !important;
  box-shadow: none !important;
}

:deep(.el-button--danger:hover) {
  background: rgba(239, 68, 68, 1) !important;
}

:deep(.el-message-box) {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 12px;
}

:deep(.el-popper) {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

:deep(.el-loading-mask) {
  background-color: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
}

/* Адаптивность для планшетов */
@media (max-width: 1024px) {
  .page-header {
    padding: 16px 20px;
  }

  .content-card {
    padding: 16px;
  }

  .filters-wrapper {
    flex-direction: column;
  }

  .filter-select,
  .filter-input,
  .filter-search {
    width: 100%;
    max-width: none;
  }
}

/* Адаптивность для мобильных устройств */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .create-btn {
    width: 100%;
    justify-content: center;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  :deep(.el-table) {
    min-width: 800px;
  }

  .action-buttons {
    flex-direction: column;
    gap: 4px;
  }

  .stats-btn,
  .delete-btn {
    width: 100%;
  }

  :deep(.el-dialog) {
    width: 90% !important;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}

/* Очень маленькие экраны */
@media (max-width: 480px) {
  .users-page {
    gap: 12px;
  }

  .page-header {
    border-radius: 12px;
  }

  .page-title {
    font-size: 20px;
  }

  .page-subtitle {
    font-size: 13px;
  }

  .content-card {
    padding: 16px;
  }

  :deep(.el-dialog) {
    width: 95% !important;
  }
}
</style>