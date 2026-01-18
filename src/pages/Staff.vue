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
    <div class="staff">
      <div class="staff__head">
        <div class="staff__title">Сотрудники</div>
        <el-button type="primary" @click="openCreate">Добавить сотрудника</el-button>
      </div>

      <el-alert
        v-if="!shopId"
        type="warning"
        show-icon
        title="У админа нет coffeeshop_id — невозможно привязать сотрудников."
        style="margin-bottom: 12px"
      />

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column prop="name" label="Имя" min-width="180" />
        <el-table-column prop="email" label="Email" min-width="240" />
        <el-table-column prop="role" label="Роль" width="120" />
        <el-table-column prop="coffeeshop_id" label="CoffeeShop" width="140" />
        <el-table-column label="Создан" width="190">
          <template #default="{ row }">
            <span v-if="row.created_at">{{ new Date(row.created_at).toLocaleString('ru-RU') }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
      </el-table>

      <el-dialog v-model="modalOpen" title="Новый сотрудник" width="520px">
        <el-form label-position="top">
          <el-form-item label="Имя (опционально)">
            <el-input v-model="formName" placeholder="Например: Алия" />
          </el-form-item>
          <el-form-item label="Email">
            <el-input v-model="formEmail" placeholder="staff@mail.ru" />
          </el-form-item>
          <el-form-item label="Пароль">
            <el-input v-model="formPassword" type="password" show-password placeholder="Минимум 6 символов" />
          </el-form-item>
        </el-form>

        <template #footer>
          <div style="display: flex; justify-content: flex-end; gap: 8px">
            <el-button @click="closeCreate">Отмена</el-button>
            <el-button type="primary" :loading="loading" @click="createStaff">Создать</el-button>
          </div>
        </template>
      </el-dialog>
    </div>
  </template>

  <style scoped>
  .staff__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .staff__title {
    font-weight: 900;
    font-size: 18px;
  }
  </style>