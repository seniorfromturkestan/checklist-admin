<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { addDoc, collection, getDocs, orderBy, query, where } from 'firebase/firestore'
  import { db } from '@/firebase'
  import { useRouter } from 'vue-router'
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

  const router = useRouter()

  const loading = ref(false)
  const users = ref<UserRow[]>([])

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
      return ElMessage.warning('Для admin/staff обязателен coffeeshop_id')
    }

    try {
      // 1) Пытаемся вызвать Cloud Function (если она есть)
      // callable: createUserAccount({ email, password, name, role, coffeeshop_id })
      // должна создать Auth user + Users/{uid}
      const fn = httpsCallable(getFunctions(), 'createUserAccount')

      try {
        const res = await fn({
          email,
          password: pass,
          name,
          role,
          coffeeshop_id: role === 'superadmin' ? null : shop,
        })

        // если вернула uid
        const data = res.data as Record<string, unknown>
        if (typeof data?.uid === 'string') {
          ElMessage.success(`Пользователь создан (uid: ${data.uid})`)
          dialog.value = false
          resetForm()
          await load()
          return
        }
      } catch (e) {
        // если функции ещё нет — просто продолжим и создадим profile в Firestore
        console.warn('createUserAccount not available, fallback to Firestore only', e)
      }

      // 2) Fallback: создаём ТОЛЬКО профиль в Firestore (без Auth)
      await addDoc(collection(db, 'Users'), {
        name,
        login: email,
        email,
        password: pass, // ⚠️ хранить пароль так НЕ безопасно. Потом убери!
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

  const filtered = computed(() => {
    const s = search.value.trim().toLowerCase()
    return users.value.filter((u) => {
      if (filterRole.value !== 'all' && u.role !== filterRole.value) return false
      if (filterShop.value.trim() && String(u.coffeeshop_id || '') !== filterShop.value.trim())
        return false
      if (!s) return true
      return (
        u.name.toLowerCase().includes(s) ||
        u.login.toLowerCase().includes(s) ||
        String(u.coffeeshop_id || '').toLowerCase().includes(s) ||
        u.role.toLowerCase().includes(s)
      )
    })
  })

  onMounted(load)
  </script>

  <template>
    <div class="wrap">
      <div class="head">
        <div>
          <div class="h1">Пользователи</div>
          <div class="muted">Создание admin/staff и контроль по кофейням</div>
        </div>
        <div class="actions">
          <el-button type="primary" @click="dialog = true">Создать пользователя</el-button>
        </div>
      </div>

      <el-card>
        <div class="filters">
          <el-select v-model="filterRole" placeholder="Роль" style="width: 180px">
            <el-option label="Все роли" value="all" />
            <el-option label="superadmin" value="superadmin" />
            <el-option label="admin" value="admin" />
            <el-option label="staff" value="staff" />
          </el-select>

          <el-input v-model="filterShop" placeholder="coffeeshop_id (например 1)" style="width: 220px" />
          <el-input v-model="search" placeholder="Поиск: имя / email / role / shop" style="max-width: 360px" />
          <el-button @click="load">Обновить</el-button>
        </div>

        <el-table :data="filtered" v-loading="loading" style="width: 100%">
          <el-table-column prop="name" label="Имя" min-width="180" />
          <el-table-column prop="login" label="Email/Login" min-width="220" />
          <el-table-column prop="role" label="Роль" width="140" />
          <el-table-column prop="coffeeshop_id" label="Shop" width="110" />
          <el-table-column label="Действия" width="200">
            <template #default="{ row }">
              <el-button
                size="small"
                type="info"
                plain
                :disabled="!row.coffeeshop_id"
                @click="$router.push({ path: '/super/overview', query: { shop: row.coffeeshop_id } })"
              >
                Статистика
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-dialog v-model="dialog" title="Создать пользователя" width="560px" @closed="resetForm">
        <el-form label-position="top">
          <div class="grid2">
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

          <el-form-item label="coffeeshop_id (обязательно для admin/staff)">
            <el-input v-model="form.coffeeshop_id" placeholder="1" />
          </el-form-item>

          <!-- <div class="muted small">
            Рекомендация: создание Auth-аккаунта делай через Cloud Function (createUserAccount). Сейчас есть fallback
            (создаст профиль в Firestore).
          </div> -->
        </el-form>

        <template #footer>
          <el-button @click="dialog = false">Отмена</el-button>
          <el-button type="primary" @click="createUser">Создать</el-button>
        </template>
      </el-dialog>
    </div>
  </template>

  <style scoped>
  .wrap {
    display: grid;
    gap: 14px;
  }
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .h1 {
    font-weight: 900;
    font-size: 20px;
  }
  .muted {
    opacity: 0.7;
  }
  .small {
    font-size: 12px;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  </style>