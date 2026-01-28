<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue'
  import { collection, doc, getDocs, orderBy, query, setDoc } from 'firebase/firestore'
  import { ElMessage } from 'element-plus'
  import { db } from '@/firebase'
  import { useRouter } from 'vue-router'
  import { GeoPoint } from 'firebase/firestore'

  defineOptions({ name: 'SuperCoffeeshopsPage' })

  // Типы для Leaflet
  interface LeafletLatLng {
    lat: number
    lng: number
  }

  interface LeafletEvent {
    latlng: LeafletLatLng
  }

  interface LeafletMarker {
    setLatLng: (latlng: [number, number]) => LeafletMarker
    getLatLng: () => LeafletLatLng
    on: (event: string, handler: () => void) => void
  }

  interface LeafletMap {
    setView: (center: [number, number], zoom: number) => LeafletMap
    on: (event: string, handler: (e: LeafletEvent) => void) => void
    remove: () => void
    getZoom: () => number
  }

  interface LeafletStatic {
    map: (element: HTMLElement) => LeafletMap
    tileLayer: (url: string, options: Record<string, unknown>) => {
      addTo: (map: LeafletMap) => void
    }
    marker: (
      latlng: [number, number],
      options: { draggable: boolean }
    ) => LeafletMarker & { addTo: (map: LeafletMap) => LeafletMarker }
  }

  declare global {
    interface Window {
      L?: LeafletStatic
    }
  }

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
    name: '',
    lat: '43.238293',  // Алматы по умолчанию
    lng: '76.945465',
  })

  const mapContainer = ref<HTMLDivElement | null>(null)
  let map: LeafletMap | null = null
  let marker: LeafletMarker | null = null

  const resetForm = () => {
    form.value = { name: '', lat: '43.238293', lng: '76.945465' }
    if (marker) {
      marker.setLatLng([43.238293, 76.945465])
      map?.setView([43.238293, 76.945465], 13)
    }
  }

  // Получить следующий свободный ID (число)
  const getNextId = () => {
    const numericIds = list.value
      .map(s => parseInt(s.id))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b)

    if (numericIds.length === 0) return '1'

    const maxId = numericIds[numericIds.length - 1]
    if (maxId === undefined) return '1'

    // Найти первый пропущенный номер или взять следующий после максимального
    for (let i = 1; i <= maxId; i++) {
      if (!numericIds.includes(i)) {
        return String(i)
      }
    }

    return String(maxId + 1)
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

  const initMap = async () => {
    if (!mapContainer.value) return

    // Подключаем Leaflet динамически
    if (!window.L) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)

      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      await new Promise<void>(resolve => {
        script.onload = () => resolve()
        document.head.appendChild(script)
      })
    }

    // Проверяем что Leaflet загружен
    if (!window.L) {
      console.error('Leaflet failed to load')
      return
    }

    const lat = parseFloat(form.value.lat) || 43.238293
    const lng = parseFloat(form.value.lng) || 76.945465

    map = window.L.map(mapContainer.value).setView([lat, lng], 13)

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    marker = window.L.marker([lat, lng], { draggable: true }).addTo(map)

    // При перетаскивании маркера обновляем поля
    marker.on('dragend', () => {
      if (!marker) return
      const pos = marker.getLatLng()
      form.value.lat = pos.lat.toFixed(6)
      form.value.lng = pos.lng.toFixed(6)
    })

    // При клике на карту перемещаем маркер
    map.on('click', (e: LeafletEvent) => {
      if (!marker) return
      marker.setLatLng([e.latlng.lat, e.latlng.lng])
      form.value.lat = e.latlng.lat.toFixed(6)
      form.value.lng = e.latlng.lng.toFixed(6)
    })
  }

  // Отслеживаем изменения координат в полях ввода и обновляем карту
  watch([() => form.value.lat, () => form.value.lng], () => {
    const lat = parseFloat(form.value.lat)
    const lng = parseFloat(form.value.lng)
    if (marker && !isNaN(lat) && !isNaN(lng)) {
      marker.setLatLng([lat, lng])
      map?.setView([lat, lng], map.getZoom())
    }
  })

  watch(dialog, (isOpen) => {
    if (isOpen) {
      setTimeout(initMap, 100)
    } else {
      if (map) {
        map.remove()
        map = null
        marker = null
      }
    }
  })

  const create = async () => {
    const name = form.value.name.trim()
    if (!name) return ElMessage.warning('Введите название')

    const lat = Number(form.value.lat)
    const lng = Number(form.value.lng)
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)

    if (!hasCoords) {
      return ElMessage.warning('Введите корректные координаты')
    }

    try {
      const nextId = getNextId()

      const payload: Record<string, unknown> = {
        name,
        location: new GeoPoint(lat, lng),
        created_at: Date.now(),
      }

      await setDoc(doc(db, 'coffeeshops', nextId), payload)

      ElMessage.success(`Кофешоп создан с ID: ${nextId}`)
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
  <div class="coffeeshops-page">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">Кофешопы</h1>
        <p class="page-subtitle">Создание и выбор кофейни для просмотра статистики</p>
      </div>
      <button class="create-btn" @click="dialog = true">
        <span class="btn-icon">+</span>
        Создать кофешоп
      </button>
    </div>

    <div v-if="!loading && rows.length === 0" class="empty-state">
      <div class="empty-icon">☕</div>
      <div class="empty-text">Пока нет кофешопов</div>
      <button class="empty-btn" @click="dialog = true">Создать первый кофешоп</button>
    </div>

    <div v-else class="table-card">
      <el-table :data="rows" v-loading="loading">
        <el-table-column prop="id" label="ID" width="100">
          <template #default="{ row }">
            <span class="id-badge">{{ row.id }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="name" label="Название" min-width="240">
          <template #default="{ row }">
            <span class="shop-name">{{ row.name }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="coords" label="Координаты" min-width="220">
          <template #default="{ row }">
            <span class="coords-text">{{ row.coords }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Действия" width="240">
          <template #default="{ row }">
            <div class="action-buttons">
              <button class="stats-btn" @click="goOverview(row.id)">Статистика</button>
              <button class="users-btn" @click="$router.push('/super/users')">Пользователи</button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="dialog"
      title="Создать кофешоп"
      width="720px"
      @closed="resetForm"
      class="coffeeshop-dialog"
    >
      <el-form label-position="top">
        <el-form-item label="Название кофешопа">
          <el-input v-model="form.name" placeholder="CoffeeShop A" />
        </el-form-item>

        <!-- <div class="form-note">
          <strong>ID будет назначен автоматически:</strong> {{ getNextId() }}
        </div> -->

        <div class="coords-section">
          <div class="coords-header">Координаты на карте</div>

          <div class="coords-grid">
            <el-form-item label="Latitude (широта)">
              <el-input v-model="form.lat" placeholder="43.238293" />
            </el-form-item>
            <el-form-item label="Longitude (долгота)">
              <el-input v-model="form.lng" placeholder="76.945465" />
            </el-form-item>
          </div>

          <div class="map-container">
            <div ref="mapContainer" class="map"></div>
          </div>

          <div class="map-hint">
            💡 Кликните на карту или перетащите маркер для выбора координат
          </div>
        </div>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <button class="cancel-btn" @click="dialog = false">Отмена</button>
          <button class="submit-btn" @click="create">Создать</button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.coffeeshops-page {
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

.id-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.shop-name {
  font-weight: 600;
  color: #1a1a1a;
  font-size: 14px;
}

.coords-text {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #666666;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.stats-btn,
.users-btn {
  height: 32px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid;
}

.stats-btn {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.stats-btn:hover {
  background: rgba(34, 197, 94, 0.2);
}

.users-btn {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.2);
  color: #6366f1;
}

.users-btn:hover {
  background: rgba(99, 102, 241, 0.2);
}

.coords-section {
  margin-top: 20px;
}

.coords-header {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 16px;
}

.coords-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.form-note {
  font-size: 13px;
  color: #666666;
  padding: 12px 16px;
  background: rgba(99, 102, 241, 0.05);
  border-left: 3px solid #6366f1;
  border-radius: 8px;
  margin-top: 12px;
}

.form-note strong {
  color: #6366f1;
}

.map-container {
  width: 100%;
  height: 300px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.1);
  margin-bottom: 12px;
}

.map {
  width: 100%;
  height: 100%;
}

.map-hint {
  font-size: 12px;
  color: #666666;
  text-align: center;
  padding: 8px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
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

:deep( .el-dialog) {
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

:deep(.el-loading-mask) {
  background-color: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
}

/* Leaflet overrides */
:deep(.leaflet-control-attribution) {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(4px);
}

/* Адаптивность для планшетов */
@media (max-width: 1024px) {
  .page-header {
    padding: 16px 20px;
  }

  .table-card {
    padding: 16px;
  }

  .map-container {
    height: 300px;
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

  .table-card {
    padding: 12px;
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
  .users-btn {
    width: 100%;
  }

  :deep(.coffeeshop-dialog .el-dialog) {
    width: 95% !important;
  }

  .coords-grid {
    grid-template-columns: 1fr;
  }

  .map-container {
    height: 250px;
  }
}

/* Очень маленькие экраны */
@media (max-width: 480px) {
  .coffeeshops-page {
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

  .map-container {
    height: 200px;
  }
}
</style>