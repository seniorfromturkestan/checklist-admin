<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db } from '@/firebase'

defineOptions({ name: 'SuperOverviewPage' })

type CoffeeShop = {
  id: string
  name: string
}

type TaskType = 'checkbox' | 'photo'

type TaskResultStatus = 'Not_Done' | 'In_Review' | 'Approved' | 'Rejected'

type TaskResultRow = {
  id: string
  task_id: string | null
  user_id: string | null
  user_name?: string | null
  title: string
  type: TaskType | null
  status: TaskResultStatus
  date?: string | null
  timestamp?: number | null
  expected_finish_time?: string | number | null
  actual_finish_time?: number | null
  photo_url?: string | null
  review_comment?: string | null
}

const route = useRoute()
const router = useRouter()

const shops = ref<CoffeeShop[]>([])
const shopId = ref<string>('')

const loadingShops = ref(false)
const loading = ref(false)

const tasksTotal = ref(0)
const tasksPhoto = ref(0)

const results = ref<TaskResultRow[]>([])

const daysBack = ref(7)

const fromDate = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() - (daysBack.value - 1))
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
})

const fromMs = computed(() => {
  const d = new Date()
  d.setHours(0, 1, 0, 0) // 00:01 local
  d.setDate(d.getDate() - (daysBack.value - 1))
  return d.getTime()
})

const hasShop = computed(() => !!shopId.value)

const counts = computed(() => {
  const c: Record<TaskResultStatus, number> = {
    Not_Done: 0,
    In_Review: 0,
    Approved: 0,
    Rejected: 0,
  }
  for (const r of results.value) c[r.status] = (c[r.status] ?? 0) + 1
  return c
})

const statusLabel = (s: TaskResultStatus) => {
  if (s === 'Not_Done') return 'Не выполнено'
  if (s === 'In_Review') return 'В обработке'
  if (s === 'Approved') return 'Выполнено'
  return 'Отклонено'
}

// const statusTag = (s: TaskResultStatus): 'info' | 'warning' | 'success' | 'danger' => {
//   if (s === 'Approved') return 'success'
//   if (s === 'Rejected') return 'danger'
//   if (s === 'In_Review') return 'warning'
//   return 'info'
// }

const openPhoto = (url?: string | null) => {
  if (!url) return
  // Use noopener/noreferrer to avoid popup blockers and security issues
  window.open(url, '_blank', 'noopener,noreferrer')
}

const fmtDate = (ymd?: string | null) => {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  return `${d}.${m}.${y}`
}

const fmtTime = (v?: string | number | null) => {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  const dt = new Date(v)
  const hh = String(dt.getHours()).padStart(2, '0')
  const mm = String(dt.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

const fmtDateTime = (ms?: number | null) => {
  if (!ms) return '—'
  const dt = new Date(ms)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  const hh = String(dt.getHours()).padStart(2, '0')
  const mm = String(dt.getMinutes()).padStart(2, '0')
  return `${d}.${m}.${y} ${hh}:${mm}`
}

const toDayKey = (ms: number) => {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const pickMs = (row: TaskResultRow): number => {
  return (
    row.timestamp ??
    row.actual_finish_time ??
    (typeof row.expected_finish_time === 'number' ? row.expected_finish_time : null) ??
    0
  )
}

// --- Aggregations by user ---
const byUser = computed(() => {
  const map: Record<
    string,
    {
      user_id: string
      user_name: string
      Approved: number
      In_Review: number
      Rejected: number
      Not_Done: number
      total: number
      rate: number
    }
  > = {}

  for (const r of results.value) {
    const id = r.user_id ?? '—'
    const name = r.user_name ?? (r.user_id ?? '—')

    if (!map[id]) {
      map[id] = {
        user_id: id,
        user_name: name,
        Approved: 0,
        In_Review: 0,
        Rejected: 0,
        Not_Done: 0,
        total: 0,
        rate: 0,
      }
    }

    map[id].total += 1
    if (r.status === 'Approved') map[id].Approved += 1
    else if (r.status === 'In_Review') map[id].In_Review += 1
    else if (r.status === 'Rejected') map[id].Rejected += 1
    else map[id].Not_Done += 1
  }

  const arr = Object.values(map).map((u) => {
    const base = u.Approved + u.Not_Done
    const rate = base > 0 ? Math.round((u.Approved * 100) / base) : 0
    return { ...u, rate }
  })

  arr.sort((a, b) => {
    if (b.Approved !== a.Approved) return b.Approved - a.Approved
    return b.total - a.total
  })

  return arr
})


const loadShops = async () => {
  try {
    loadingShops.value = true
    const snap = await getDocs(query(collection(db, 'coffeeshops'), orderBy('created_at', 'desc')))
    shops.value = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>
      return { id: d.id, name: typeof data.name === 'string' ? data.name : d.id }
    })

    const qShop = String(route.query.shop ?? '')
    if (qShop && shops.value.some((s) => s.id === qShop)) {
      shopId.value = qShop
    } else if (!shopId.value && shops.value.length) {
      const first = shops.value[0]
      if (first) shopId.value = first.id
    }
  } catch (e) {
    console.error(e)
    ElMessage.error('Не удалось загрузить coffeeshops')
  } finally {
    loadingShops.value = false
  }
}

const loadOverview = async () => {
  if (!shopId.value) return

  try {
    loading.value = true

    // 1) tasks count
    const tasksSnap = await getDocs(collection(db, `coffeeshops/${shopId.value}/tasks`))
    tasksTotal.value = tasksSnap.size
    tasksPhoto.value = tasksSnap.docs.filter((d) => {
      const data = d.data() as Record<string, unknown>
      return data.type === 'photo'
    }).length

    // 2) task_results (newest first)
    // Use timestamp as primary sort because it's always present in ваших демо.
    const q = query(
      collection(db, `coffeeshops/${shopId.value}/task_results`),
      orderBy('timestamp', 'desc'),
      limit(500),
    )

    const resSnap = await getDocs(q)

    const rows: TaskResultRow[] = resSnap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>

        const status = (data.status as TaskResultStatus) ?? 'Not_Done'
        const type = (data.type as TaskType) ?? null

        const ts = typeof data.timestamp === 'number' ? data.timestamp : null
        const actual = typeof data.actual_finish_time === 'number' ? data.actual_finish_time : null
        const ms = ts ?? actual ?? null

        const date = typeof data.date === 'string' ? data.date : ms ? toDayKey(ms) : null

        return {
          id: d.id,
          task_id: typeof data.task_id === 'string' ? data.task_id : null,
          user_id: typeof data.user_id === 'string' ? data.user_id : null,
          user_name: typeof data.user_name === 'string' ? data.user_name : null,
          title: typeof data.title === 'string' ? data.title : '—',
          type,
          status,
          date,
          timestamp: ts,
          expected_finish_time:
            typeof data.expected_finish_time === 'string' || typeof data.expected_finish_time === 'number'
              ? (data.expected_finish_time as string | number)
              : null,
          actual_finish_time: actual,
          photo_url: typeof data.photo_url === 'string' ? data.photo_url : null,
          review_comment: typeof data.review_comment === 'string' ? data.review_comment : null,
        }
      })
      .filter((r) => {
        // keep last N days by ms (preferred) or by date string
        const ms = pickMs(r)
        if (ms) return ms >= fromMs.value
        if (!r.date) return true
        return r.date >= fromDate.value
      })

    results.value = rows
  } catch (e) {
    console.error(e)
    ElMessage.error('Не удалось загрузить обзор по кофейне')
  } finally {
    loading.value = false
  }
}

watch(shopId, async (v) => {
  if (!v) return
  await router.replace({ path: route.path, query: { ...route.query, shop: v } })
  await loadOverview()
})

watch(daysBack, async () => {
  await loadOverview()
})

onMounted(async () => {
  await loadShops()
  if (shopId.value) await loadOverview()
})
</script>

<template>
  <div class="overview-page">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">Обзор</h1>
        <p class="page-subtitle">Показать, что происходит в выбранной кофейне (последние {{ daysBack }} дней)</p>
      </div>

      <div class="header-actions">
        <el-select
          v-model="shopId"
          :loading="loadingShops"
          placeholder="Выберите кофешоп"
          class="shop-select"
        >
          <el-option v-for="s in shops" :key="s.id" :label="`${s.name} (ID: ${s.id})`" :value="s.id" />
        </el-select>

        <el-select v-model="daysBack" class="days-select">
          <el-option :value="7" label="7 дней" />
          <el-option :value="14" label="14 дней" />
          <el-option :value="30" label="30 дней" />
        </el-select>

        <button class="refresh-btn" :disabled="!hasShop" @click="loadOverview">Обновить</button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="kpi-grid">
      <div class="kpi-card kpi-card--tasks">
        <div class="kpi-card__icon">📊</div>
        <div class="kpi-card__content">
          <div class="kpi-card__label">Задачи (всего)</div>
          <div class="kpi-card__value">{{ tasksTotal }}</div>
          <div class="kpi-card__hint">Фото-задачи: {{ tasksPhoto }}</div>
        </div>
      </div>

      <div class="kpi-card kpi-card--approved">
        <div class="kpi-card__icon">✓</div>
        <div class="kpi-card__content">
          <div class="kpi-card__label">Выполнено</div>
          <div class="kpi-card__value">{{ counts.Approved }}</div>
          <div class="kpi-card__hint">Статус: Approved</div>
        </div>
      </div>

      <div class="kpi-card kpi-card--review">
        <div class="kpi-card__icon">⏳</div>
        <div class="kpi-card__content">
          <div class="kpi-card__label">В обработке</div>
          <div class="kpi-card__value">{{ counts.In_Review }}</div>
          <div class="kpi-card__hint">Статус: In_Review</div>
        </div>
      </div>

      <div class="kpi-card kpi-card--rejected">
        <div class="kpi-card__icon">✕</div>
        <div class="kpi-card__content">
          <div class="kpi-card__label">Отклонено</div>
          <div class="kpi-card__value">{{ counts.Rejected }}</div>
          <div class="kpi-card__hint">Статус: Rejected</div>
        </div>
      </div>

      <div class="kpi-card kpi-card--notdone">
        <div class="kpi-card__icon">○</div>
        <div class="kpi-card__content">
          <div class="kpi-card__label">Не выполнено</div>
          <div class="kpi-card__value">{{ counts.Not_Done }}</div>
          <div class="kpi-card__hint">Статус: Not_Done</div>
        </div>
      </div>
    </div>

    <!-- Staff Performance -->
    <div class="content-card">
      <div class="card-header">
        <h2 class="card-title">Кто что делал</h2>
        <p class="card-subtitle">Сводка по сотрудникам за последние {{ daysBack }} дней</p>
      </div>

      <div class="section-title">Все сотрудники (детально)</div>

      <div class="table-wrapper">
        <el-table :data="byUser" v-loading="loading">
          <el-table-column prop="user_name" label="Сотрудник" min-width="220" />

          <el-table-column label="Выполнено" width="120">
            <template #default="{ row }">
              <span class="stat-value stat-value--approved">{{ row.Approved }}</span>
            </template>
          </el-table-column>

          <el-table-column label="В обработке" width="130">
            <template #default="{ row }">
              <span class="stat-value stat-value--review">{{ row.In_Review }}</span>
            </template>
          </el-table-column>

          <el-table-column label="Отклонено" width="120">
            <template #default="{ row }">
              <span class="stat-value stat-value--rejected">{{ row.Rejected }}</span>
            </template>
          </el-table-column>

          <el-table-column label="Не выполнено" width="130">
            <template #default="{ row }">
              <span class="stat-value stat-value--notdone">{{ row.Not_Done }}</span>
            </template>
          </el-table-column>

          <el-table-column prop="total" label="Всего" width="90" />

          <el-table-column label="Эффективность" width="200">
            <template #default="{ row }">
              <div class="efficiency">
                <div class="efficiency-bar">
                  <div class="efficiency-fill" :style="{ width: row.rate + '%' }"></div>
                </div>
                <div class="efficiency-text">{{ row.rate }}%</div>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="card-note">
        * Эффективность считается по базе Approved / Not_Done (без In_Review и Rejected).
      </div>
    </div>

    <!-- Recent Results -->
    <div class="content-card">
      <div class="card-header">
        <h2 class="card-title">Последние результаты</h2>
        <p class="card-subtitle">Фильтр по дате: от {{ fmtDate(fromDate) }}</p>
      </div>

      <div class="table-wrapper">
        <el-table :data="results" v-loading="loading">
          <el-table-column label="День" width="120">
            <template #default="{ row }">{{ fmtDate(row.date) }}</template>
          </el-table-column>

          <el-table-column prop="title" label="Задача" min-width="220" />

          <el-table-column label="Тип" width="120">
            <template #default="{ row }">
              <span class="type-badge">{{ row.type ?? '—' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="Дедлайн" width="130">
            <template #default="{ row }">{{ fmtTime(row.expected_finish_time) }}</template>
          </el-table-column>

          <el-table-column label="Факт" width="180">
            <template #default="{ row }">{{ fmtDateTime(row.timestamp ?? row.actual_finish_time ?? null) }}</template>
          </el-table-column>

          <el-table-column label="Статус" width="150">
            <template #default="{ row }">
              <span :class="['status-badge', `status-badge--${row.status.toLowerCase()}`]">
                {{ statusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="Фото" width="120">
            <template #default="{ row }">
              <button v-if="row.photo_url" class="photo-btn" @click="openPhoto(row.photo_url)">
                Открыть
              </button>
              <span v-else class="no-data">—</span>
            </template>
          </el-table-column>

          <el-table-column prop="user_id" label="Сотрудник" width="160" />

          <el-table-column prop="review_comment" label="Комментарий" min-width="220">
            <template #default="{ row }">
              <span v-if="row.review_comment" class="comment-text">{{ row.review_comment }}</span>
              <span v-else class="no-data">—</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overview-page {
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
  align-items: flex-end;
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

.header-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.shop-select {
  width: 300px;
}

.days-select {
  width: 140px;
}

.refresh-btn {
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
}

.refresh-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 1);
  transform: translateY(-1px);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.kpi-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  gap: 16px;
  align-items: center;
  transition: all 0.3s ease;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.kpi-card__icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}

.kpi-card--tasks .kpi-card__icon {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.kpi-card--approved .kpi-card__icon {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.kpi-card--review .kpi-card__icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.kpi-card--rejected .kpi-card__icon {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.kpi-card--notdone .kpi-card__icon {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}

.kpi-card__content {
  flex: 1;
}

.kpi-card__label {
  font-size: 13px;
  color: #666666;
  margin-bottom: 4px;
  font-weight: 500;
}

.kpi-card__value {
  font-size: 32px;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1;
  margin-bottom: 4px;
}

.kpi-card__hint {
  font-size: 12px;
  color: #999999;
}

.content-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 24px;
}

.card-header {
  margin-bottom: 20px;
}

.card-title {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 8px 0;
}

.card-subtitle {
  font-size: 13px;
  color: #666666;
  margin: 0;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 16px 0;
}

.table-wrapper {
  width: 100%;
  overflow-x: auto;
  margin-bottom: 12px;
}

.card-note {
  font-size: 12px;
  color: #999999;
  margin-top: 12px;
}

.stat-value {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
}

.stat-value--approved {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.stat-value--review {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.stat-value--rejected {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.stat-value--notdone {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}

.efficiency {
  display: flex;
  align-items: center;
  gap: 12px;
}

.efficiency-bar {
  flex: 1;
  height: 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  overflow: hidden;
  min-width: 100px;
}

.efficiency-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e 0%, #16a34a 100%);
  border-radius: 4px;
  transition: width 0.6s ease;
}

.efficiency-text {
  min-width: 45px;
  text-align: right;
  font-weight: 600;
  color: #1a1a1a;
  font-size: 14px;
}

.type-badge {
  font-size: 13px;
  color: #666666;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge--in_review {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.status-badge--approved {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.status-badge--rejected {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.status-badge--not_done {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}

.photo-btn {
  height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: #6366f1;
  cursor: pointer;
  transition: all 0.3s ease;
}

.photo-btn:hover {
  background: rgba(99, 102, 241, 0.2);
}

.comment-text {
  color: #1a1a1a;
  font-size: 14px;
}

.no-data {
  color: #999999;
}

/* Element Plus overrides */
:deep(*) {
  font-family: inherit;
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

:deep(.el-select .el-input.is-focus .el-input__wrapper) {
  border-color: rgba(0, 0, 0, 0.3);
}

:deep(.el-popper) {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
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

/* Адаптивность */
@media (max-width: 1024px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    justify-content: stretch;
  }

  .shop-select,
  .days-select {
    flex: 1;
    min-width: 140px;
  }

  .kpi-grid {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
}

@media (max-width: 768px) {
  .header-actions {
    flex-direction: column;
  }

  .shop-select,
  .days-select,
  .refresh-btn {
    width: 100%;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  :deep(.el-table) {
    min-width: 1000px;
  }
}

@media (max-width: 480px) {
  .page-title {
    font-size: 20px;
  }

  .kpi-card {
    padding: 16px;
  }

  .kpi-card__value {
    font-size: 28px;
  }

  .content-card {
    padding: 20px;
  }
}
</style>