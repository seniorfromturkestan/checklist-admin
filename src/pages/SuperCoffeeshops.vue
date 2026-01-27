<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { addDoc, collection, doc, getDocs, orderBy, query, setDoc } from 'firebase/firestore'
  import { ElMessage } from 'element-plus'
  import { db } from '@/firebase'
  import { useRouter } from 'vue-router'
  import { GeoPoint } from 'firebase/firestore'

  defineOptions({ name: 'SuperCoffeeshopsPage' })

  type CoffeeShopDoc = {
    id: string
    name: string
    location?: GeoPoint | null
    created_at?: number | null
  }

  const router = useRouter()
  const list = ref<CoffeeShopDoc[]>([])
  const loading = ref(false)

  const dialog = ref(false)
  const form = ref({
    id: '', // optional: если хочешь docId = "1", "2"
    name: '',
    lat: '',
    lng: '',
  })

  const resetForm = () => {
    form.value = { id: '', name: '', lat: '', lng: '' }
  }

  const load = async () => {
    try {
      loading.value = true
      const q = query(collection(db, 'coffeeshops'), orderBy('created_at', 'desc'))
      const snaps = await getDocs(q)
      list.value = snaps.docs.map((d) => {
        const data = d.data() as Record<string, unknown>
        return {
          id: d.id,
          name: typeof data['name'] === 'string' ? data['name'] : d.id,
          location: data['location'] instanceof GeoPoint ? data['location'] : null,
          created_at: typeof data['created_at'] === 'number' ? data['created_at'] : null,
        }
      })
    } catch (e) {
      console.error(e)
      ElMessage.error('Не удалось загрузить coffeeshops')
    } finally {
      loading.value = false
    }
  }

  const create = async () => {
    const name = form.value.name.trim()
    if (!name) return ElMessage.warning('Введите название')

    const lat = Number(form.value.lat)
    const lng = Number(form.value.lng)
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)

    try {
      const payload: Record<string, unknown> = {
        name,
        created_at: Date.now(),
      }
      if (hasCoords) payload['location'] = new GeoPoint(lat, lng)

      if (form.value.id.trim()) {
        const id = form.value.id.trim()
        await setDoc(doc(db, 'coffeeshops', id), payload, { merge: true })
      } else {
        await addDoc(collection(db, 'coffeeshops'), payload)
      }

      ElMessage.success('Кофешоп создан')
      dialog.value = false
      resetForm()
      await load()
    } catch (e) {
      console.error(e)
      ElMessage.error('Ошибка при создании coffeeshop')
    }
  }

  const goOverview = (shopId: string) => {
    router.push({ path: '/super/overview', query: { shop: shopId } })
  }

  onMounted(load)

  const rows = computed(() =>
    list.value.map((s) => ({
      ...s,
      coords:
        s.location && typeof s.location.latitude === 'number'
          ? `${s.location.latitude.toFixed(6)}, ${s.location.longitude.toFixed(6)}`
          : '—',
    }))
  )
  </script>

  <template>
    <div class="wrap">
      <div class="head">
        <div>
          <div class="h1">Кофешопы</div>
          <div class="muted">Создание и выбор кофейни для просмотра статистики</div>
        </div>
        <div class="actions">
          <el-button type="primary" @click="dialog = true">Создать кофешоп</el-button>
        </div>
      </div>

      <el-card>
        <el-table :data="rows" v-loading="loading" style="width: 100%">
          <el-table-column prop="id" label="ID" width="140" />
          <el-table-column prop="name" label="Название" min-width="240" />
          <el-table-column prop="coords" label="GeoPoint" min-width="220" />
          <el-table-column label="Действия" width="220">
            <template #default="{ row }">
              <el-button size="small" @click="goOverview(row.id)">Статистика</el-button>
              <el-button size="small" type="info" plain @click="$router.push('/super/users')">
                Пользователи
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-dialog v-model="dialog" title="Создать coffeeshop" width="520px" @closed="resetForm">
        <el-form label-position="top">
          <el-form-item label="ID (необязательно, если хочешь '1', '2')">
            <el-input v-model="form.id" placeholder="например: 1" />
          </el-form-item>

          <el-form-item label="Название">
            <el-input v-model="form.name" placeholder="CoffeeShop A" />
          </el-form-item>

          <div class="grid">
            <el-form-item label="Latitude">
              <el-input v-model="form.lat" placeholder="43.207154" />
            </el-form-item>
            <el-form-item label="Longitude">
              <el-input v-model="form.lng" placeholder="76.669387" />
            </el-form-item>
          </div>

          <div class="muted small">
            Пока без карты: вводим координаты руками. Потом подключим карту и выбор точки.
          </div>
        </el-form>

        <template #footer>
          <el-button @click="dialog = false">Отмена</el-button>
          <el-button type="primary" @click="create">Создать</el-button>
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
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  </style>
