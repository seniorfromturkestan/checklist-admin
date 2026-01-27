

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

const statusTag = (s: TaskResultStatus): 'info' | 'warning' | 'success' | 'danger' => {
  if (s === 'Approved') return 'success'
  if (s === 'Rejected') return 'danger'
  if (s === 'In_Review') return 'warning'
  return 'info'
}

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
  <div class="wrap">
    <div class="head">
      <div>
        <div class="h1">Обзор</div>
        показать, что происходит в выбранной кофейне (последние {{ daysBack }} дней)
      </div>

      <div class="actions">
        <el-select
          v-model="shopId"
          :loading="loadingShops"
          placeholder="Выберите кофешоп"
          style="width: 300px"
        >
          <el-option v-for="s in shops" :key="s.id" :label="`${s.name} (ID: ${s.id})`" :value="s.id" />
        </el-select>

        <el-select v-model="daysBack" style="width: 140px">
          <el-option :value="7" label="7 дней" />
          <el-option :value="14" label="14 дней" />
          <el-option :value="30" label="30 дней" />
        </el-select>

        <el-button :disabled="!hasShop" @click="loadOverview">Обновить</el-button>
      </div>
    </div>

    <el-card v-loading="loading" class="cards">
      <div class="grid">
        <div class="card">
          <div class="label">Задачи (всего)</div>
          <div class="value">{{ tasksTotal }}</div>
          <div class="sub">Фото-задачи: {{ tasksPhoto }}</div>
        </div>

        <div class="card">
          <div class="label">Выполнено</div>
          <div class="value">{{ counts.Approved }}</div>
          <div class="sub">Статус: Approved</div>
        </div>

        <div class="card">
          <div class="label">В обработке</div>
          <div class="value">{{ counts.In_Review }}</div>
          <div class="sub">Статус: In_Review</div>
        </div>


        <div class="card">
          <div class="label">Отклонено</div>
          <div class="value">{{ counts.Rejected }}</div>
          <div class="sub">Статус: Rejected</div>
        </div>

        <div class="card">
          <div class="label">Не выполнено</div>
          <div class="value">{{ counts.Not_Done }}</div>
          <div class="sub">Статус: Not_Done</div>
        </div>
      </div>
    </el-card>

    <el-card v-loading="loading">
      <div class="h2">Кто что делал</div>
      <div class="muted">Сводка по сотрудникам за последние {{ daysBack }} дней</div>

      <!-- (Пока убрали блоки "Топ сотрудников" и "Последние активности") -->

      <div class="miniTitle" style="margin-top: 14px">Все сотрудники (детально)</div>
      <el-table :data="byUser" style="width: 100%" size="small">
        <el-table-column prop="user_name" label="Сотрудник" min-width="220" />
        <el-table-column prop="Approved" label="Выполнено" width="120" />
        <el-table-column prop="In_Review" label="В обработке" width="130" />
        <el-table-column prop="Rejected" label="Отклонено" width="120" />
        <el-table-column prop="Not_Done" label="Не выполнено" width="130" />
        <el-table-column prop="total" label="Всего" width="90" />
        <el-table-column label="Эффективность" width="170">
          <template #default="{ row }">
            <div class="rate">
              <div class="rate__bar"><el-progress :percentage="row.rate" /></div>
              <div class="rate__text">{{ row.rate }}%</div>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="muted small" style="margin-top: 10px">
        * Эффективность считается по базе Approved / Not_Done (без In_Review и Rejected).
      </div>
    </el-card>

    <el-card v-loading="loading">
      <div class="h2">Последние результаты</div>
      <div class="muted">Фильтр по дате: от {{ fmtDate(fromDate) }}</div>

      <el-table :data="results" style="width: 100%; margin-top: 10px">
        <el-table-column prop="date" label="День" width="120">
          <template #default="{ row }">{{ fmtDate(row.date) }}</template>
        </el-table-column>

        <el-table-column prop="title" label="Задача" min-width="220" />

        <el-table-column prop="type" label="Тип" width="120">
          <template #default="{ row }">{{ row.type ?? '—' }}</template>
        </el-table-column>

        <el-table-column label="Дедлайн" width="130">
          <template #default="{ row }">{{ fmtTime(row.expected_finish_time) }}</template>
        </el-table-column>

        <el-table-column label="Факт" width="180">
          <template #default="{ row }">{{ fmtDateTime(row.timestamp ?? row.actual_finish_time ?? null) }}</template>
        </el-table-column>

        <el-table-column label="Статус" width="150">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="plain">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Фото" width="120">
          <template #default="{ row }">
            <el-button v-if="row.photo_url" size="small" type="primary" plain @click="openPhoto(row.photo_url)">
              Открыть
            </el-button>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>

        <el-table-column prop="user_id" label="Сотрудник" width="160" />

        <el-table-column prop="review_comment" label="Комментарий" min-width="220" />
      </el-table>

      <!-- <div class="muted small" style="margin-top: 10px">
        Если понадобится точная агрегация (быстрее и без limit), добавим индексы и where('date','>=',fromDate).
      </div> -->
    </el-card>
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

.h2 {
  font-weight: 900;
  font-size: 16px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.cards .grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(180px, 1fr));
  gap: 12px;
}

@media (max-width: 1200px) {
  .cards .grid {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
}

.card {
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  padding: 12px 14px;
}

.label {
  opacity: 0.7;
  font-size: 12px;
}

.value {
  font-size: 26px;
  font-weight: 900;
  margin-top: 2px;
}

.sub {
  opacity: 0.7;
  font-size: 12px;
  margin-top: 4px;
}

.muted {
  opacity: 0.7;
}

.small {
  font-size: 12px;
}

.miniTitle {
  font-weight: 800;
  margin: 6px 0 8px;
}

.rate {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rate__bar {
  flex: 1;
  min-width: 120px;
}

.rate__text {
  width: 52px;
  text-align: right;
  font-weight: 700;
}
</style>
