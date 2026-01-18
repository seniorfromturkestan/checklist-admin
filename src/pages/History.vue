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
    batch.map((r) =>
      setDoc(doc(colRes, r.id), {
        // required
        task_id: r.task_id,
        timestamp: r.timestamp,
        created_at: r.timestamp,
        status: r.status,

        // optional info for admin UI
        title: r.title ?? null,
        type: tasks.value[r.task_id]?.type ?? null,

        // deadlines (string in your current DB)
        expected_finish_time: tasks.value[r.task_id]?.expected_finish_time ?? '09:00',
        actual_finish_time: null,

        // review/photo
        photo_url: r.photo_url ?? null,
        review_comment: r.review_comment ?? null,

        // staff
        user_id: r.user_id ?? null,
      }),
    ),
  )
  ElMessage.success('Демо-результаты созданы')
}
</script>

<template>
  <div style="padding: 16px">
    <el-page-header content="История выполнения" />

    <el-alert
      v-if="needsIndex"
      type="warning"
      show-icon
      style="margin: 12px 0"
      title="Требуется индекс для task_results"
      description="Создайте индекс: timestamp (Descending). Firestore → Indexes → Composite Indexes."
    />

    <div style="margin: 12px 0; display: flex; gap: 12px; flex-wrap: wrap; align-items: center">
      <el-date-picker
        v-model="range"
        type="daterange"
        range-separator="—"
        start-placeholder="От"
        end-placeholder="До"
        unlink-panels
      />
      <el-select v-model="statusFilter" style="width: 180px">
        <el-option label="Все статусы" value="All" />
        <el-option label="В обработке" value="In_Review" />
        <el-option label="Выполнено" value="Approved" />
        <el-option label="Отклонено" value="Rejected" />
        <el-option label="Не выполнено" value="Not_Done" />
      </el-select>
      <el-button
        @click="
          range = null;
          statusFilter = 'All'
        "
        >Сбросить фильтры</el-button
      >
      <el-button type="primary" @click="createDemoResults"
        >Создать демо-результаты за сегодня</el-button
      >
    </div>

    <el-skeleton v-if="loading" :rows="6" animated />
    <el-empty v-else-if="!grouped.length" description="Пока пусто" />

    <div v-else class="history__groups">
      <div v-for="g in grouped" :key="g.key" class="history__group">
        <div class="history__groupTitle">{{ g.label }}</div>

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
                style="width: 140px; height: 90px; border-radius: 8px"
              />
              <span v-else>—</span>
            </template>
          </el-table-column>

          <el-table-column prop="user_id" label="Сотрудник" width="160" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<style>
/* Make Element Plus image preview always appear above fixed columns/sidebar */
.el-image-viewer__wrapper {
  z-index: 4000 !important;
}

.history__groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.history__groupTitle {
  font-weight: 900;
  margin: 10px 0 10px;
}
</style>
