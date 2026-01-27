<template>
  <div class="review-page">
    <div class="page-header">
      <h1 class="page-title">Проверка фото</h1>
      <p class="page-subtitle">Очередь фото-задач: approve / reject + комментарий (опционально)</p>
    </div>

    <el-skeleton v-if="loading" :rows="8" animated />

    <div v-else-if="errorText" class="warning-alert">
      <div class="alert-icon">⚠️</div>
      <div class="alert-content">
        <div class="alert-title">{{ errorText }}</div>
        <div class="alert-desc">Проверьте профиль пользователя и структуру Firestore.</div>
      </div>
    </div>

    <template v-else>
      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-card--review">
          <div class="kpi-card__icon">⏳</div>
          <div class="kpi-card__content">
            <div class="kpi-card__label">In Review</div>
            <div class="kpi-card__value">{{ kpi.inReview }}</div>
            <div class="kpi-card__hint">Ждут проверки</div>
          </div>
        </div>

        <div class="kpi-card kpi-card--approved">
          <div class="kpi-card__icon">✓</div>
          <div class="kpi-card__content">
            <div class="kpi-card__label">Approved</div>
            <div class="kpi-card__value">{{ kpi.Approved }}</div>
            <div class="kpi-card__hint">Принято</div>
          </div>
        </div>

        <div class="kpi-card kpi-card--rejected">
          <div class="kpi-card__icon">✕</div>
          <div class="kpi-card__content">
            <div class="kpi-card__label">Rejected</div>
            <div class="kpi-card__value">{{ kpi.Rejected }}</div>
            <div class="kpi-card__hint">Отклонено</div>
          </div>
        </div>

        <div class="kpi-card kpi-card--notdone">
          <div class="kpi-card__icon">○</div>
          <div class="kpi-card__content">
            <div class="kpi-card__label">Not Done</div>
            <div class="kpi-card__value">{{ kpi.notDone }}</div>
            <div class="kpi-card__hint">Не выполнено</div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-card">
        <el-select v-model="statusFilter" class="filter-select">
          <el-option label="All" value="All" />
          <el-option label="In_Review" value="In_Review" />
          <el-option label="Approved" value="Approved" />
          <el-option label="Rejected" value="Rejected" />
          <el-option label="Not_Done" value="Not_Done" />
        </el-select>

        <el-input
          v-model="search"
          placeholder="Поиск: задача или user_id"
          clearable
          class="filter-input"
        />

        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="—"
          start-placeholder="От"
          end-placeholder="До"
          format="DD.MM.YYYY"
          value-format="x"
          class="filter-date"
        />

        <div class="filters-hint">
          Показываются только записи с <b>photo</b> (по типу задачи или по наличию photo_url)
        </div>
      </div>

      <div v-if="grouped.length === 0" class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">Нет записей для проверки</div>
      </div>

      <div v-else class="review-groups">
        <div v-for="g in grouped" :key="g.key" class="review-group">
          <div class="group-title">{{ g.label }}</div>

          <div class="table-card">
            <div class="table-wrapper">
              <el-table :data="g.rows">
                <el-table-column label="Задача" min-width="220">
                  <template #default="{ row }">
                    <div class="task-info">
                      <div class="task-title">{{ resolveTitle(row) }}</div>
                      <div class="task-meta">Тип: {{ resolveType(row) }}</div>
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
                    <span :class="['status-badge', `status-badge--${row.status.toLowerCase()}`]">
                      {{ statusLabel(row.status) }}
                    </span>
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
                      class="task-image"
                    />
                    <span v-else class="no-photo">—</span>
                  </template>
                </el-table-column>

                <el-table-column label="Комментарий" min-width="220">
                  <template #default="{ row }">
                    <span v-if="row.review_comment" class="comment-text">{{ row.review_comment }}</span>
                    <span v-else class="no-comment">—</span>
                  </template>
                </el-table-column>

                <el-table-column label="Сотрудник" width="180">
                  <template #default="{ row }">{{ row.user_id ?? '—' }}</template>
                </el-table-column>

                <el-table-column label="Действия" width="220" fixed="right">
                  <template #default="{ row }">
                    <div v-if="row.status === 'In_Review'" class="action-buttons">
                      <button class="approve-btn" @click="approve(row)">Approve</button>
                      <button class="reject-btn" @click="reject(row)">Reject</button>
                    </div>
                    <span v-else class="no-action">—</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
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

const statusLabel = (s: ResultStatus) => {
  if (s === 'Approved') return 'Approved'
  if (s === 'Rejected') return 'Rejected'
  if (s === 'In_Review') return 'In Review'
  if (s === 'Not_Done') return 'Not Done'
  return s
}
</script>

<style scoped>
.review-page {
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
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 8px 0;
}

.page-subtitle {
  font-size: 14px;
  color: #666666;
  margin: 0;
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

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
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

.kpi-card--review .kpi-card__icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.kpi-card--approved .kpi-card__icon {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
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

.filters-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 20px 24px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-select {
  width: 180px;
}

.filter-input {
  width: 320px;
}

.filter-date {
  width: 300px;
}

.filters-hint {
  font-size: 12px;
  color: #666666;
  flex-basis: 100%;
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
}

.review-groups {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.review-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  padding: 0 4px;
}

.table-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 20px;
  overflow: hidden;
}

.table-wrapper {
  width: 100%;
  overflow-x: auto;
}

.task-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-title {
  font-weight: 600;
  color: #1a1a1a;
}

.task-meta {
  font-size: 12px;
  color: #999999;
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

.task-image {
  width: 160px;
  height: 100px;
  border-radius: 10px;
  overflow: hidden;
}

.no-photo {
  color: #999999;
}

.comment-text {
  color: #1a1a1a;
  font-size: 14px;
}

.no-comment {
  color: #999999;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.approve-btn,
.reject-btn {
  height: 32px;
  padding: 0 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid;
}

.approve-btn {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.approve-btn:hover {
  background: rgba(34, 197, 94, 0.2);
}

.reject-btn {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.reject-btn:hover {
  background: rgba(239, 68, 68, 0.2);
}

.no-action {
  color: #999999;
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
  min-width: 980px;
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

:deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
}

:deep(.el-date-editor) {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
}

:deep(.el-skeleton) {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 24px;
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

.el-image-viewer__wrapper {
  z-index: 4000 !important;
}

/* Адаптивность */
@media (max-width: 768px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .filters-card {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-select,
  .filter-input,
  .filter-date {
    width: 100%;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .action-buttons {
    flex-direction: column;
    gap: 4px;
  }

  .approve-btn,
  .reject-btn {
    width: 100%;
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
}
</style>