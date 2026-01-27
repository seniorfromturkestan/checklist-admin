<script setup lang="ts">
  defineOptions({ name: 'StaffPage' })
  import { computed, onMounted, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { collection, doc, getDocs, limit, query, setDoc, where } from 'firebase/firestore'
  import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth'
  import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app'

  import { db } from '@/firebase'
  import { useAuthStore } from '@/stores/auth'

  type StaffRow = {
    id: string
    name: string
    email: string
    role: string
    coffeeshop_id: string | null
    created_at: number | null
  }

  const authStore = useAuthStore()
  const shopId = computed(() => authStore.profile?.coffeeshop_id ?? null)

  const loading = ref(false)
  const rows = ref<StaffRow[]>([])

  const modalOpen = ref(false)
  const formEmail = ref('')
  const formName = ref('')
  const formPassword = ref('')

  const openCreate = () => {
    modalOpen.value = true
    formEmail.value = ''
    formName.value = ''
    formPassword.value = ''
  }
  const closeCreate = () => (modalOpen.value = false)

  const loadStaff = async () => {
    if (!shopId.value) {
      rows.value = []
      return
    }

    loading.value = true
    try {
      const readFrom = async (colName: 'Users' | 'users') => {
        const colRef = collection(db, colName)
        const q = query(colRef, where('coffeeshop_id', '==', String(shopId.value)), limit(500))
        const snap = await getDocs(q)

        // Filter + sort in-memory to avoid composite indexes
        const docs = snap.docs
          .map((d) => {
            const data = d.data() as Record<string, unknown>
            const role = typeof data['role'] === 'string' ? data['role'] : ''
            const createdAt = typeof data['created_at'] === 'number' ? data['created_at'] : 0
            return { d, data, role, createdAt }
          })
          .filter((x) => x.role === 'staff')
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

        return docs.map(({ d, data, createdAt }) => {
          const name = typeof data['name'] === 'string' ? data['name'] : String(data['name'] ?? '')
          const email =
            typeof data['email'] === 'string'
              ? data['email']
              : typeof data['login'] === 'string'
                ? data['login']
                : String(data['email'] ?? data['login'] ?? '')

          return {
            id: d.id,
            name,
            email,
            role: typeof data['role'] === 'string' ? data['role'] : 'staff',
            coffeeshop_id: data['coffeeshop_id'] == null ? null : String(data['coffeeshop_id']),
            created_at: createdAt,
          } as StaffRow
        })
      }

      const a = await readFrom('Users')
      const b = await readFrom('users')

      const map = new Map<string, StaffRow>()
      for (const r of b) map.set(r.id, r)
      for (const r of a) map.set(r.id, r)

      rows.value = Array.from(map.values())
    } catch (e) {
      console.error(e)
      ElMessage.error('Не удалось загрузить сотрудников')
    } finally {
      loading.value = false
    }
  }

  const getSecondaryAuth = () => {
    const primaryApp = getApps().length ? getApp() : null
    const opts = (primaryApp?.options ?? null) as FirebaseOptions | null
    if (!opts) throw new Error('Firebase app is not initialized')

    const secondary = getApps().find((a) => a.name === 'secondary') ?? initializeApp(opts, 'secondary')
    return getAuth(secondary)
  }

  const createStaff = async () => {
    if (!shopId.value) return ElMessage.warning('У админа нет coffeeshop_id')

    const email = formEmail.value.trim()
    const name = formName.value.trim()
    const password = formPassword.value.trim()

    if (!email || !password) return ElMessage.warning('Введите email и пароль')
    if (password.length < 6) return ElMessage.warning('Пароль минимум 6 символов')

    loading.value = true
    try {
      const secondaryAuth = getSecondaryAuth()
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
      const uid = cred.user.uid

      await setDoc(doc(db, 'Users', uid), {
        id: uid,
        name: name || null,
        email,
        login: email,
        role: 'staff',
        coffeeshop_id: String(shopId.value),
        created_at: Date.now(),
      })

      ElMessage.success('Сотрудник создан')
      closeCreate()
      await loadStaff()
    } catch (e) {
      console.error(e)
      ElMessage.error('Не удалось создать сотрудника (проверьте email/пароль/доступы)')
    } finally {
      loading.value = false
    }
  }

  onMounted(async () => {
    if (!authStore.ready) await authStore.init()
    await loadStaff()
  })
  </script>

  <template>
    <div class="staff-page">
      <div class="page-header">
        <div class="header-content">
          <h1 class="page-title">Сотрудники</h1>
          <p class="page-subtitle">Управление персоналом кофейни</p>
        </div>
        <button class="add-btn" @click="openCreate">
          <span class="btn-icon">+</span>
          Добавить сотрудника
        </button>
      </div>

      <div v-if="!shopId" class="warning-alert">
        <div class="alert-icon">⚠️</div>
        <div class="alert-content">
          <div class="alert-title">У админа нет coffeeshop_id</div>
          <div class="alert-desc">Невозможно привязать сотрудников.</div>
        </div>
      </div>

      <div v-if="!loading && rows.length === 0 && shopId" class="empty-state">
        <div class="empty-icon">👥</div>
        <div class="empty-text">Пока нет сотрудников</div>
        <button class="empty-btn" @click="openCreate">Добавить первого сотрудника</button>
      </div>

      <div v-else class="table-card">
        <el-table v-loading="loading" :data="rows">
          <el-table-column prop="name" label="Имя" min-width="180" />
          <el-table-column prop="email" label="Email" min-width="240" />
          <el-table-column prop="role" label="Роль" width="120">
            <template #default="{ row }">
              <span class="role-badge">{{ row.role }}</span>
            </template>
          </el-table-column>
          <!-- <el-table-column prop="coffeeshop_id" label="CoffeeShop" width="140" /> -->
          <el-table-column label="Создан" width="190">
            <template #default="{ row }">
              <span v-if="row.created_at" class="date-text">{{ new Date(row.created_at).toLocaleString('ru-RU') }}</span>
              <span v-else class="no-data">—</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <el-dialog v-model="modalOpen" title="Новый сотрудник" width="520px" class="staff-dialog">
        <el-form label-position="top">
          <el-form-item label="Имя (опционально)">
            <el-input v-model="formName" placeholder="Например: Алия" class="form-input" />
          </el-form-item>
          <el-form-item label="Email">
            <el-input v-model="formEmail" placeholder="staff@mail.ru" class="form-input" />
          </el-form-item>
          <el-form-item label="Пароль">
            <el-input
              v-model="formPassword"
              type="password"
              show-password
              placeholder="Минимум 6 символов"
              class="form-input"
            />
          </el-form-item>
        </el-form>

        <template #footer>
          <div class="dialog-footer">
            <button class="cancel-btn" @click="closeCreate">Отмена</button>
            <button class="create-btn" :disabled="loading" @click="createStaff">
              {{ loading ? 'Создание...' : 'Создать' }}
            </button>
          </div>
        </template>
      </el-dialog>
    </div>
  </template>

  <style scoped>
  .staff-page {
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

  .add-btn {
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

  .add-btn:hover {
    background: rgba(0, 0, 0, 1);
    transform: translateY(-1px);
  }

  .add-btn:active {
    transform: translateY(0);
  }

  .btn-icon {
    font-size: 18px;
    font-weight: 600;
  }

  .warning-alert {
    background: rgba(255, 243, 205, 0.7);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 12px;
    padding: 16px 20px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .alert-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .alert-content {
    flex: 1;
  }

  .alert-title {
    font-weight: 600;
    font-size: 14px;
    color: #92400e;
    margin-bottom: 4px;
  }

  .alert-desc {
    font-size: 13px;
    color: #78350f;
    line-height: 1.5;
  }

  .empty-state {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 16px;
    padding: 60px 24px;
    text-align: center;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 16px;
    font-weight: 500;
    color: #666666;
    margin-bottom: 20px;
  }

  .empty-btn {
    height: 40px;
    padding: 0 24px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(0, 0, 0, 0.2);
    color: #ffffff;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .empty-btn:hover {
    background: rgba(0, 0, 0, 1);
    transform: translateY(-1px);
  }

  .table-card {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 16px;
    padding: 20px;
    overflow: hidden;
  }

  .role-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    background: rgba(99, 102, 241, 0.1);
    color: #6366f1;
  }

  .date-text {
    color: #1a1a1a;
    font-size: 14px;
  }

  .no-data {
    color: #999999;
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .cancel-btn,
  .create-btn {
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

  .create-btn {
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(8px);
    color: #ffffff;
    border-color: rgba(0, 0, 0, 0.2);
  }

  .create-btn:hover:not(:disabled) {
    background: rgba(0, 0, 0, 1);
  }

  .create-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

    .table-card {
      padding: 16px;
    }
  }

  /* Адаптивность для мобильных устройств */
  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .add-btn {
      width: 100%;
      justify-content: center;
    }

    .table-card {
      padding: 12px;
      overflow-x: auto;
    }

    :deep(.el-table) {
      min-width: 800px;
    }

    :deep(.el-dialog) {
      width: 90% !important;
    }
  }

  /* Очень маленькие экраны */
  @media (max-width: 480px) {
    .staff-page {
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

    .empty-icon {
      font-size: 40px;
    }

    .empty-state {
      padding: 40px 20px;
    }

    :deep(.el-dialog) {
      width: 95% !important;
    }
  }
  </style>