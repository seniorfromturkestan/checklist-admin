<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { db } from '@/firebase'
import type { Task, TaskResult } from '@/types'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  type FirestoreDataConverter,
  type DocumentData,
} from 'firebase/firestore'
import { ElMessage } from 'element-plus'
import { FirebaseError } from 'firebase/app'

defineOptions({ name: 'HistoryPage' })

// --- Конвертеры Firestore (строгая типизация, без any) ---
const taskConverter: FirestoreDataConverter<Task> = {
  toFirestore: (t: Task): DocumentData => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...rest } = t
    return rest as DocumentData
  },
  fromFirestore: (snap): Task => {
    const data = snap.data() as Omit<Task, 'id'>
    return { id: snap.id, ...data }
  },
}
const resultConverter: FirestoreDataConverter<TaskResult> = {
  toFirestore: (r: TaskResult): DocumentData => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...rest } = r
    return rest as DocumentData
  },
  fromFirestore: (snap): TaskResult => {
    const data = snap.data() as Omit<TaskResult, 'id'>
    return { id: snap.id, ...data }
  },
}

type HistoryRow = TaskResult & { title?: string | null }

const auth = useAuthStore()

const loading = ref(true)
const needsIndex = ref(false)

const results = ref<HistoryRow[]>([])
const tasks = ref<Record<string, Task>>({})

const range = ref<[Date, Date] | null>(null)
const statusFilter = ref<'All' | 'In_Review' | 'Approved' | 'Rejected' | 'Not_Done'>('All')


const fmtDate = (ts: number) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'full' }).format(ts)

const dayKey = (ts: number) => {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const statusLabel = (s: string) => {
  if (s === 'In_Review') return 'В обработке'
  if (s === 'Approved') return 'Выполнено'
  if (s === 'Rejected') return 'Отклонено'
  if (s === 'Not_Done') return 'Не выполнено'
  return s
}

const statusTagType = (s: string) => {
  if (s === 'Approved') return 'success'
  if (s === 'Rejected') return 'danger'
  if (s === 'In_Review') return 'warning'
  if (s === 'Not_Done') return 'info'
  return 'info'
}

const taskTitle = (r: HistoryRow) => {
  const directTitle = typeof r.title === 'string' && r.title.trim() ? r.title : null
  const byTask = r.task_id ? tasks.value[r.task_id]?.title : undefined
  return directTitle ?? byTask ?? '—'
}

const filtered = computed(() => {
  let list = results.value.slice()

  // фильтр по диапазону дат
  if (range.value) {
    const [from, to] = range.value
    const fromMs = from.setHours(0, 0, 0, 0)
    const toMs = to.setHours(23, 59, 59, 999)
    list = list.filter((r) => r.timestamp >= fromMs && r.timestamp <= toMs)
  }

  // фильтр по статусу
  if (statusFilter.value !== 'All') {
    list = list.filter((r) => r.status === statusFilter.value)
  }

  const prio: Record<string, number> = {
    In_Review: 0,
    Rejected: 1,
    Not_Done: 2,
    Approved: 3,
  }
  list = list.sort((a, b) => {
    const pa = prio[a.status as string] ?? 99
    const pb = prio[b.status as string] ?? 99
    if (pa !== pb) return pa - pb
    return b.timestamp - a.timestamp
  })

  return list
})

const grouped = computed(() => {
  const map = new Map<string, HistoryRow[]>()
  for (const r of filtered.value) {
    const key = dayKey(r.timestamp)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }

  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1))
  return keys.map((key) => {
    const rows = (map.get(key) ?? []).slice().sort((a, b) => b.timestamp - a.timestamp)
    const firstTs = rows[0]?.timestamp ?? Date.now()
    return { key, label: fmtDate(firstTs), rows }
  })
})

onMounted(() => {
  const shopId = auth.profile?.coffeeshop_id
  if (!shopId) {
    loading.value = false
    return
  }

  // словари для быстрых заголовков
  onSnapshot(
    query(collection(db, `coffeeshops/${shopId}/tasks`).withConverter(taskConverter)),
    (snap) => {
      const map: Record<string, Task> = {}
      snap.forEach((d) => {
        map[d.id] = d.data()
      })
      tasks.value = map
    },
  )

  // результаты с сортировкой по времени (desc)
  const col = collection(db, `coffeeshops/${shopId}/task_results`).withConverter(resultConverter)
  const qMain = query(col, orderBy('timestamp', 'desc'))

  onSnapshot(
    qMain,
    (snap) => {
      results.value = snap.docs.map((d) => d.data())
      loading.value = false
    },
    (err) => {
      if (err instanceof FirebaseError && err.code === 'failed-precondition') {
        // нет индекса — включаем fallback без orderBy
        needsIndex.value = true
        const qFallback = query(col)
        onSnapshot(qFallback, (snap2) => {
          results.value = snap2.docs.map((d) => d.data()).sort((a, b) => b.timestamp - a.timestamp)
          loading.value = false
        })
      } else {
        ElMessage.error((err as Error).message || 'Ошибка чтения истории')
        loading.value = false
      }
    },
  )
})

// — демо-создание пары результатов на сегодня (для быстрой проверки интерфейса)
async function createDemoResults() {
  const shopId = auth.profile?.coffeeshop_id
  if (!shopId) return
  const now = Date.now()

  // берём первые 2 задачи (если есть)
  const allTasks = Object.values(tasks.value)
  if (!allTasks.length) {
    ElMessage.warning('Нет задач — создайте задачи')
    return
  }

  const batch: HistoryRow[] = []

  const t1 = allTasks[0]
  if (!t1) return

  const photoTask = allTasks.find((t) => t.type === 'photo') ?? t1

  // 4 demo results with all 4 statuses
  batch.push({
    id: crypto.randomUUID(),
    task_id: t1.id,
    timestamp: now - 30 * 60 * 1000,
    status: 'In_Review',
    title: t1.title,
    photo_url: 'https://picsum.photos/seed/checklist/800/500',
    user_id: null,
    review_comment: null,
    expected_finish_time: null,
    actual_finish_time: null,
    date: ''
  })

  batch.push({
    id: crypto.randomUUID(),
    task_id: photoTask.id,
    timestamp: now - 20 * 60 * 1000,
    status: 'Approved',
    title: photoTask.title,
    photo_url: 'https://picsum.photos/seed/checklist-approved/800/500',
    user_id: null,
    review_comment: null,
    expected_finish_time: null,
    actual_finish_time: null,
    date: ''
  })

  batch.push({
    id: crypto.randomUUID(),
    task_id: photoTask.id,
    timestamp: now - 15 * 60 * 1000,
    status: 'Rejected',
    title: photoTask.title,
    photo_url: 'https://picsum.photos/seed/checklist-rejected/800/500',
    user_id: null,
    review_comment: 'не видно фотки',
    expected_finish_time: null,
    actual_finish_time: null,
    date: ''
  })

  batch.push({
    id: crypto.randomUUID(),
    task_id: t1.id,
    timestamp: now - 10 * 60 * 1000,
    status: 'Not_Done',
    title: t1.title,
    photo_url: null,
    user_id: null,
    review_comment: null,
    expected_finish_time: null,
    actual_finish_time: null,
    date: ''
  })

  // запись результатов
  const { doc, setDoc, collection } = await import('firebase/firestore')
  const colRes = collection(db, `coffeeshops/${shopId}/task_results`)
  await Promise.all(
    batch.map((r) => {
      if (!r.task_id) return
      return setDoc(doc(colRes, r.id), {
        // required
        task_id: r.task_id,
        timestamp: r.timestamp,
        created_at: r.timestamp,
        status: r.status,

        // optional info for admin UI
        title: r.title ?? null,
        type: r.task_id ? tasks.value[r.task_id]?.type ?? null : null,

        // deadlines (string in your current DB)
        expected_finish_time: r.task_id
          ? tasks.value[r.task_id]?.expected_finish_time ?? '09:00'
          : '09:00',
        actual_finish_time: null,

        // review/photo
        photo_url: r.photo_url ?? null,
        review_comment: r.review_comment ?? null,

        // staff
        user_id: r.user_id ?? null,
      })
    }),
  )
  ElMessage.success('Демо-результаты созданы')
}
</script>

<template>
  <div class="history-page">
    <div class="page-header">
      <h1 class="page-title">История выполнения</h1>
    </div>

    <div v-if="needsIndex" class="index-alert">
      <div class="alert-icon">⚠️</div>
      <div class="alert-content">
        <div class="alert-title">Требуется индекс для task_results</div>
        <div class="alert-desc">Создайте индекс: timestamp (Descending). Firestore → Indexes → Composite Indexes.</div>
      </div>
    </div>

    <div class="filters-card">
      <el-date-picker
        v-model="range"
        type="daterange"
        range-separator="—"
        start-placeholder="От"
        end-placeholder="До"
        unlink-panels
        class="date-picker"
      />
      <el-select v-model="statusFilter" class="status-select">
        <el-option label="Все статусы" value="All" />
        <el-option label="В обработке" value="In_Review" />
        <el-option label="Выполнено" value="Approved" />
        <el-option label="Отклонено" value="Rejected" />
        <el-option label="Не выполнено" value="Not_Done" />
      </el-select>
      <button
        class="filter-btn"
        @click="
          range = null;
          statusFilter = 'All'
        "
      >
        Сбросить фильтры
      </button>
      <button class="demo-btn" @click="createDemoResults">
        Создать демо-результаты
      </button>
    </div>

    <el-skeleton v-if="loading" :rows="6" animated />

    <div v-else-if="!grouped.length" class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-text">Пока пусто</div>
    </div>

    <div v-else class="history-groups">
      <div v-for="g in grouped" :key="g.key" class="history-group">
        <div class="group-title">{{ g.label }}</div>

        <div class="table-card">
          <el-table :data="g.rows" style="width: 100%">
            <el-table-column label="Задача" min-width="220">
              <template #default="{ row }">{{ taskTitle(row) }}</template>
            </el-table-column>

            <el-table-column label="Статус" width="160">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>

            <el-table-column label="Фото" width="170">
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

            <el-table-column prop="user_id" label="Сотрудник" width="160" />
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-page {
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
  margin: 0;
}

.index-alert {
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

.date-picker {
  min-width: 280px;
}

.status-select {
  width: 180px;
}

.filter-btn,
.demo-btn {
  height: 40px;
  padding: 0 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  color: #1a1a1a;
  cursor: pointer;
  transition: all 0.3s ease;
}

.filter-btn:hover,
.demo-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.filter-btn:active,
.demo-btn:active {
  transform: translateY(0);
}

.demo-btn {
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
  color: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

.demo-btn:hover {
  background: rgba(0, 0, 0, 1);
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

.history-groups {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.history-group {
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

.task-image {
  width: 140px;
  height: 90px;
  border-radius: 8px;
  overflow: hidden;
}

.no-photo {
  color: #999999;
  font-size: 14px;
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

:deep(.el-table--enable-row-hover .el-table__body tr:hover > td) {
  background: rgba(0, 0, 0, 0.02);
}

:deep(.el-table::before) {
  display: none;
}

:deep(.el-date-editor) {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
}

:deep(.el-date-editor:hover) {
  border-color: rgba(0, 0, 0, 0.2);
}

:deep(.el-date-editor.is-active) {
  border-color: rgba(0, 0, 0, 0.3);
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
  border-color: rgba(0, 0, 0, 0.3) !important;
}

:deep(.el-button--primary:focus) {
  background: rgba(0, 0, 0, 0.9) !important;
  border-color: rgba(0, 0, 0, 0.2) !important;
}

:deep(.el-button--primary:active) {
  background: rgba(0, 0, 0, 1) !important;
}

:deep(.el-button--default) {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: #1a1a1a;
}

:deep(.el-button--default:hover) {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.2);
}

:deep(.el-popper) {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

:deep(.el-picker-panel) {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

:deep(.el-select-dropdown) {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

/* Image preview */
.el-image-viewer__wrapper {
  z-index: 4000 !important;
}

/* Адаптивность для планшетов */
@media (max-width: 1024px) {
  .filters-card {
    padding: 16px 20px;
  }

  .page-header {
    padding: 16px 20px;
  }

  .table-card {
    padding: 16px;
  }
}

/* Адаптивность для мобильных устройств */
@media (max-width: 768px) {
  .page-title {
    font-size: 20px;
  }

  .filters-card {
    flex-direction: column;
    align-items: stretch;
  }

  .date-picker,
  .status-select,
  .filter-btn,
  .demo-btn {
    width: 100%;
    min-width: auto;
  }

  .group-title {
    font-size: 16px;
  }

  .table-card {
    padding: 12px;
    overflow-x: auto;
  }

  :deep(.el-table) {
    min-width: 600px;
  }
}

/* Очень маленькие экраны */
@media (max-width: 480px) {
  .history-page {
    gap: 12px;
  }

  .page-header,
  .filters-card,
  .table-card {
    border-radius: 12px;
  }

  .page-title {
    font-size: 18px;
  }

  .empty-icon {
    font-size: 40px;
  }

  .empty-state {
    padding: 40px 20px;
  }
}
</style>