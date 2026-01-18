<template>
  <div class="review">
    <div class="review__head">
      <el-page-header content="Проверка фото" />
      <div class="review__sub">
        Очередь фото-задач: approve / reject + комментарий (опционально)
      </div>
    </div>

    <el-skeleton v-if="loading" :rows="8" animated />

    <el-alert
      v-else-if="errorText"
      type="warning"
      show-icon
      :title="errorText"
      description="Проверьте профиль пользователя и структуру Firestore."
    />

    <template v-else>
      <!-- KPI -->
      <el-row :gutter="12" class="review__kpi">
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="kpi">
            <div class="kpi__label">In_Review</div>
            <div class="kpi__value">{{ kpi.inReview }}</div>
            <div class="kpi__hint">Ждут проверки</div>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="kpi">
            <div class="kpi__label">Approved</div>
            <div class="kpi__value">{{ kpi.Approved }}</div>
            <div class="kpi__hint">Принято</div>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="kpi">
            <div class="kpi__label">Rejected</div>
            <div class="kpi__value">{{ kpi.Rejected }}</div>
            <div class="kpi__hint">Отклонено</div>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="kpi">
            <div class="kpi__label">Not_Done</div>
            <div class="kpi__value">{{ kpi.notDone }}</div>
            <div class="kpi__hint">Не выполнено</div>
          </el-card>
        </el-col>
      </el-row>

      <!-- filters -->
      <el-card class="review__filters">
        <div class="filters">
          <el-select v-model="statusFilter" style="width: 180px">
            <el-option label="All" value="All" />
            <el-option label="In_Review" value="In_Review" />
            <el-option label="Approved" value="Approved" />
            <el-option label="Rejected" value="Rejected" />
            <el-option label="Not_Done" value="Not_Done" />
          </el-select>

          <el-input
            v-model="search"
            placeholder="Поиск: задача или user_id"
            style="width: 320px"
            clearable
          />

          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="—"
            start-placeholder="От"
            end-placeholder="До"
            format="DD.MM.YYYY"
            value-format="x"
            style="width: 300px"
          />

          <div class="filters__hint">
            Показываются только записи с <b>photo</b> (по типу задачи или по наличию photo_url)
          </div>
        </div>
      </el-card>

      <el-empty v-if="grouped.length === 0" description="Нет записей для проверки" />

      <div v-else class="review__groups">
        <div v-for="g in grouped" :key="g.key" class="review__group">
          <div class="review__groupTitle">{{ g.label }}</div>

          <div class="review__tableWrap">
            <el-table :data="g.rows" class="review__table">
              <el-table-column label="Задача" min-width="220">
              <template #default="{ row }">
                <div class="task">
                  <div class="task__title">{{ resolveTitle(row) }}</div>
                  <div class="task__meta">Тип: {{ resolveType(row) }}</div>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="Дедлайн" width="160">
              <template #default="{ row }">{{ fmtExpected(row) }}</template>
            </el-table-column>

            <el-table-column label="Факт" width="200">
              <template #default="{ row }">{{ fmtDateTime(row.timestamp_ms) }}</template>
            </el-table-column>

            <el-table-column label="Статус" width="140">
              <template #default="{ row }">
                <el-tag :type="tagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>

            <el-table-column label="Фото" width="190">
              <template #default="{ row }">
                <el-image
                  v-if="row.photo_url"
                  :src="row.photo_url"
                  :preview-src-list="[row.photo_url]"
                  :preview-teleported="true"
                  :z-index="4000"
                  fit="cover"
                  style="width: 160px; height: 100px; border-radius: 10px"
                />
                <span v-else>—</span>
              </template>
            </el-table-column>

            <el-table-column label="Комментарий" min-width="220">
              <template #default="{ row }">
                <span v-if="row.review_comment">{{ row.review_comment }}</span>
                <span v-else style="opacity: 0.6">—</span>
              </template>
            </el-table-column>

            <el-table-column label="Сотрудник" width="180">
              <template #default="{ row }">{{ row.user_id ?? '—' }}</template>
            </el-table-column>

            <el-table-column label="Действия" width="220" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'In_Review'">
                  <el-button size="small" type="success" @click="approve(row)">Approve</el-button>
                  <el-button size="small" type="danger" @click="reject(row)">Reject</el-button>
                </template>
                <span v-else style="opacity: 0.6">—</span>
              </template>
            </el-table-column>
            </el-table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { db } from '@/firebase'
import { collection, query, onSnapshot, orderBy, limit, doc, updateDoc } from 'firebase/firestore'
import { ElMessage, ElMessageBox } from 'element-plus'

defineOptions({ name: 'ReviewPage' })

const authStore = useAuthStore()

const loading = ref(true)
const errorText = ref<string | null>(null)

type ResultStatus = 'Not_Done' | 'In_Review' | 'Approved' | 'Rejected' | string

type TaskType = 'checkbox' | 'photo' | string

interface TaskRow {
  id: string
  title: string
  type: TaskType
}

interface ResultRow {
  id: string
  task_id?: string | null
  title?: string | null
  type?: TaskType | null
  status: ResultStatus
  photo_url?: string | null
  user_id?: string | null
  timestamp_ms: number
  review_comment?: string | null
  reviewed_at_ms?: number | null
  reviewed_by?: string | null
  expected_finish_time?: unknown
}

const tasks = ref<Record<string, TaskRow>>({})
const results = ref<ResultRow[]>([])

const statusFilter = ref<ResultStatus | 'All'>('All')
const search = ref('')

const dateRange = ref<[string, string]>([String('-'), String('-')])


// --- helpers ---
const toMs = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (!v || typeof v !== 'object') return null
  const anyV = v as { toMillis?: () => number; seconds?: number }
    if (typeof anyV.toMillis === 'function') return anyV.toMillis()
    if (typeof anyV.seconds === 'number') return anyV.seconds * 1000
  return null
}

const fmtDateTime = (ms: number) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(ms)

const fmtDate = (ms: number) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'full' }).format(ms)

const fmtExpected = (row: ResultRow) => {
  const v = row.expected_finish_time
  const ms = toMs(v)
  if (ms !== null) return fmtDateTime(ms)
  if (typeof v === 'string' && v.trim()) return v
  return '—'
}

const dayKey = (ms: number) => {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const resolveTitle = (r: ResultRow) =>
  r.title ?? (r.task_id ? tasks.value[r.task_id]?.title : undefined) ?? '—'
const resolveType = (r: ResultRow) =>
  r.type ?? (r.task_id ? tasks.value[r.task_id]?.type : undefined) ?? '—'

const isPhoto = (r: ResultRow) => resolveType(r) === 'photo' || Boolean(r.photo_url)

const filtered = computed(() => {
  let list = results.value.filter(isPhoto)

  const [fromStr, toStr] = dateRange.value
  const from = Number(fromStr)
  const to = Number(toStr)
  if (!Number.isNaN(from) && !Number.isNaN(to)) {
    list = list.filter((r) => r.timestamp_ms >= from && r.timestamp_ms <= to)
  }

  if (statusFilter.value !== 'All') {
    list = list.filter((r) => r.status === statusFilter.value)
  }

  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter((r) => {
      const t = resolveTitle(r).toLowerCase()
      const u = (r.user_id ?? '').toLowerCase()
      return t.includes(q) || u.includes(q)
    })
  }

  return list
})

const grouped = computed(() => {
  const map = new Map<string, ResultRow[]>()
  for (const r of filtered.value) {
    const key = dayKey(r.timestamp_ms)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }

  // sort keys desc
  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1))
  return keys.map((key) => {
    const rows = (map.get(key) ?? []).slice().sort((a, b) => b.timestamp_ms - a.timestamp_ms)
    const firstMs = rows[0]?.timestamp_ms ?? Date.now()
    return { key, label: fmtDate(firstMs), rows }
  })
})

const kpi = computed(() => {
  let inReview = 0
  let Approved = 0
  let Rejected = 0
  let notDone = 0

  for (const r of results.value) {
    if (!isPhoto(r)) continue
    if (r.status === 'In_Review') inReview++
    else if (r.status === 'Approved') Approved++
    else if (r.status === 'Rejected') Rejected++
    else if (r.status === 'Not_Done') notDone++
  }

  return { inReview, Approved, Rejected, notDone }
})

onMounted(() => {
  const shopId = authStore.profile?.coffeeshop_id
  if (!shopId) {
    loading.value = false
    errorText.value = 'В профиле нет coffeeshop_id (нельзя определить кофейню).'
    return
  }

  // tasks map (для названий)
  onSnapshot(
    query(collection(db, `coffeeshops/${shopId}/tasks`)),
    (snap) => {
      const map: Record<string, TaskRow> = {}
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>
          map[d.id] = {
          id: d.id,
          title: String((data['title'] ?? '') as unknown),
          type: (data['type'] ?? 'checkbox') as TaskType,
        }
      })
      tasks.value = map
    },
    (err) => {
      // tasks словарь не критичен
      console.warn('tasks snapshot error', err)
    },
  )

  // results stream (newest first)
  onSnapshot(
    query(
      collection(db, `coffeeshops/${shopId}/task_results`),
      orderBy('timestamp', 'desc'),
      limit(500),
    ),
    (snap) => {
      const rows: ResultRow[] = []
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>
        const ms = toMs(data['timestamp']) ?? toMs(data['actual_finish_time']) ?? Date.now()
        rows.push({
          id: d.id,
          task_id: (data['task_id'] as string | null | undefined) ?? null,
          title: (data['title'] as string | null | undefined) ?? null,
          type: (data['type'] as TaskType | null | undefined) ?? null,
          status: (data['status'] ?? 'Not_Done') as ResultStatus,
          photo_url: (data['photo_url'] as string | null | undefined) ?? null,
          user_id: (data['user_id'] as string | null | undefined) ?? null,
          timestamp_ms: ms,
          review_comment: (data['review_comment'] as string | null | undefined) ?? null,
          reviewed_at_ms: toMs(data['reviewed_at']),
          reviewed_by: (data['reviewed_by'] as string | null | undefined) ?? null,
          expected_finish_time: data['expected_finish_time'],
        })
      })

      // already sorted by query, but keep stable
      rows.sort((a, b) => b.timestamp_ms - a.timestamp_ms)
      results.value = rows
      loading.value = false
      errorText.value = null
    },
    (err) => {
      loading.value = false
      errorText.value = err instanceof Error ? err.message : String(err)
    },
  )
})

async function approve(row: ResultRow) {
  const shopId = authStore.profile?.coffeeshop_id
  if (!shopId) return

  try {
    const input = await ElMessageBox.prompt('Комментарий (опционально)', 'Approve', {
      inputPlaceholder: 'Можно оставить комментарий (необязательно)',
      confirmButtonText: 'Подтвердить',
      cancelButtonText: 'Отмена',
      inputType: 'textarea',
      inputValue: row.review_comment ?? '',
    })

    const comment = (input.value ?? '').trim()
    await updateDoc(doc(db, `coffeeshops/${shopId}/task_results`, row.id), {
      status: 'Approved',
      review_comment: comment || null,
    })

    ElMessage.success('Approved')
  } catch {
    // canceled
  }
}

async function reject(row: ResultRow) {
  const shopId = authStore.profile?.coffeeshop_id
  if (!shopId) return

  try {
    const input = await ElMessageBox.prompt('Комментарий (необязательно)', 'Reject', {
      inputPlaceholder: 'Например: фото не видно / нужно сделать заново',
      confirmButtonText: 'Отклонить',
      cancelButtonText: 'Отмена',
      inputType: 'textarea',
    })

    const comment = (input.value ?? '').trim()

    await updateDoc(doc(db, `coffeeshops/${shopId}/task_results`, row.id), {
      status: 'Rejected',
      review_comment: comment || null,
    })

    ElMessage.success('Rejected')
  } catch {
    // canceled
  }
}

const tagType = (s: ResultStatus) => {
  if (s === 'Approved') return 'success'
  if (s === 'Rejected') return 'danger'
  if (s === 'In_Review') return 'warning'
  if (s === 'Not_Done') return 'info'
  return 'info'
}

const statusLabel = (s: ResultStatus) => {
  if (s === 'Approved') return 'Approved'
  if (s === 'Rejected') return 'Rejected'
  if (s === 'In_Review') return 'In_Review'
  if (s === 'Not_Done') return 'Not_Done'
  return s
}
</script>

<style scoped>
.review {
  padding: 16px;
  max-width: 100%;
  overflow-x: hidden;
}

.review__head {
  margin-bottom: 12px;
}

.review__sub {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.75;
}

.review__kpi {
  margin-bottom: 12px;
}

.kpi {
  height: 100%;
}

.kpi__label {
  font-size: 12px;
  opacity: 0.75;
  margin-bottom: 6px;
}

.kpi__value {
  font-size: 28px;
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 6px;
}

.kpi__hint {
  font-size: 12px;
  opacity: 0.65;
}

.review__filters {
  margin-bottom: 12px;
}

.filters {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.filters__hint {
  font-size: 12px;
  opacity: 0.7;
}

.review__tableWrap {
  width: 100%;
  overflow-x: auto;
}

.review__table {
  width: 100%;
  min-width: 980px; /* keeps fixed-right column from expanding the whole page */
}

.task__title {
  font-weight: 800;
}

.task__meta {
  font-size: 12px;
  opacity: 0.7;
}

.review__groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.review__groupTitle {
  font-weight: 900;
  margin: 4px 0 10px;
}
/* Make Element Plus image preview always appear above fixed columns/sidebar */
.el-image-viewer__wrapper {
  z-index: 4000 !important;
}
.review__groups {
  min-width: 0;
}

.review__group {
  min-width: 0;
}

.review__tableWrap {
  min-width: 0;
}
</style>




