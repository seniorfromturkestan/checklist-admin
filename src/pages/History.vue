<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { db } from '@/firebase'
import type { Section, Task, TaskResult } from '@/types'
import {
  collection, query, where, orderBy, onSnapshot,
  type FirestoreDataConverter, type DocumentData
} from 'firebase/firestore'
import { ElMessage } from 'element-plus'
import { FirebaseError } from 'firebase/app'

defineOptions({ name: 'HistoryPage' })

// --- Конвертеры Firestore (строгая типизация, без any) ---
const sectionConverter: FirestoreDataConverter<Section> = {
  toFirestore: (s: Section): DocumentData => { const { id, ...rest } = s; return rest as DocumentData },
  fromFirestore: (snap): Section => { const data = snap.data() as Omit<Section, 'id'>; return { id: snap.id, ...data } },
}
const taskConverter: FirestoreDataConverter<Task> = {
  toFirestore: (t: Task): DocumentData => { const { id, ...rest } = t; return rest as DocumentData },
  fromFirestore: (snap): Task => { const data = snap.data() as Omit<Task, 'id'>; return { id: snap.id, ...data } },
}
const resultConverter: FirestoreDataConverter<TaskResult> = {
  toFirestore: (r: TaskResult): DocumentData => { const { id, ...rest } = r; return rest as DocumentData },
  fromFirestore: (snap): TaskResult => { const data = snap.data() as Omit<TaskResult, 'id'>; return { id: snap.id, ...data } },
}

const auth = useAuthStore()

const loading = ref(true)
const needsIndex = ref(false)

const results = ref<TaskResult[]>([])
const tasks = ref<Record<string, Task>>({})
const sections = ref<Record<string, Section>>({})

const range = ref<[Date, Date] | null>(null)
const statusFilter = ref<'all' | 'done' | 'missed'>('all')
const sectionFilter = ref<'all' | string>('all')

const fmtDateTime = (ts: number) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(ts)

const sectionTitle = (r: TaskResult) => {
  const t = tasks.value[r.task_id]
  if (!t) return '—'
  const s = sections.value[t.section_id]
  return s ? s.title : '—'
}

const taskTitle = (r: TaskResult) => tasks.value[r.task_id]?.title ?? '—'

const sectionOptions = computed(() => {
  return Object.values(sections.value).map(s => ({ label: s.title, value: s.id }))
})

const filtered = computed(() => {
  let list = results.value.slice()

  // фильтр по диапазону дат
  if (range.value) {
    const [from, to] = range.value
    const fromMs = from.setHours(0, 0, 0, 0)
    const toMs = to.setHours(23, 59, 59, 999)
    list = list.filter(r => r.timestamp >= fromMs && r.timestamp <= toMs)
  }

  // фильтр по статусу
  if (statusFilter.value !== 'all') {
    list = list.filter(r => r.status === statusFilter.value)
  }

  // фильтр по секции
  if (sectionFilter.value !== 'all') {
    list = list.filter(r => {
      const t = tasks.value[r.task_id]
      return t?.section_id === sectionFilter.value
    })
  }

  return list
})

onMounted(() => {
  const shopId = auth.profile?.coffeeshop_id
  if (!shopId) { loading.value = false; return }

  // словари для быстрых заголовков
  onSnapshot(
    query(collection(db, 'tasks').withConverter(taskConverter), where('coffeeshop_id', '==', shopId)),
    (snap) => {
      const map: Record<string, Task> = {}
      snap.forEach(d => { map[d.id] = d.data() })
      tasks.value = map
    }
  )
  onSnapshot(
    query(collection(db, 'sections').withConverter(sectionConverter), where('coffeeshop_id', '==', shopId)),
    (snap) => {
      const map: Record<string, Section> = {}
      snap.forEach(d => { map[d.id] = d.data() })
      sections.value = map
    }
  )

  // результаты с сортировкой по времени (desc)
  const col = collection(db, 'task_results').withConverter(resultConverter)
  const qMain = query(col, where('coffeeshop_id', '==', shopId), orderBy('timestamp', 'desc'))

  onSnapshot(
    qMain,
    (snap) => {
      results.value = snap.docs.map(d => d.data())
      loading.value = false
    },
    (err) => {
      if (err instanceof FirebaseError && err.code === 'failed-precondition') {
        // нет индекса — включаем fallback без orderBy
        needsIndex.value = true
        const qFallback = query(col, where('coffeeshop_id', '==', shopId))
        onSnapshot(qFallback, (snap2) => {
          results.value = snap2.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp)
          loading.value = false
        })
      } else {
        ElMessage.error((err as Error).message || 'Ошибка чтения истории')
        loading.value = false
      }
    }
  )
})

// — демо-создание пары результатов на сегодня (для быстрой проверки интерфейса)
async function createDemoResults() {
  const shopId = auth.profile?.coffeeshop_id
  if (!shopId) return
  const now = Date.now()

  // берём первые 2 задачи (если есть)
  const allTasks = Object.values(tasks.value)
  if (!allTasks.length) { ElMessage.warning('Нет задач — создайте секцию и задачи'); return }

  const batch: TaskResult[] = []
  const t1 = allTasks[0]
  batch.push({ id: crypto.randomUUID(), coffeeshop_id: shopId, task_id: t1.id, timestamp: now - 15 * 60 * 1000, status: 'done', user_id: 'demo' })

  const photoTask = allTasks.find(t => t.type === 'photo')
  if (photoTask) {
    batch.push({
      id: crypto.randomUUID(),
      coffeeshop_id: shopId,
      task_id: photoTask.id,
      timestamp: now - 10 * 60 * 1000,
      status: 'done',
      // демо-превью вместо настоящей загрузки
      photo_url: 'https://picsum.photos/seed/checklist/800/500',
      user_id: 'demo'
    })
  }

  // запись результатов
  const { doc, setDoc, collection } = await import('firebase/firestore')
  const colRes = collection(db, 'task_results')
  await Promise.all(batch.map(r => setDoc(doc(colRes, r.id), {
    coffeeshop_id: r.coffeeshop_id,
    task_id: r.task_id,
    timestamp: r.timestamp,
    status: r.status,
    user_id: r.user_id ?? null,
    photo_url: r.photo_url ?? null,
  })))
  ElMessage.success('Демо-результаты созданы')
}
</script>

<template>
  <div style="padding:16px;">
    <el-page-header content="История выполнения" />

    <el-alert
      v-if="needsIndex"
      type="warning"
      show-icon
      style="margin:12px 0"
      title="Требуется индекс для task_results"
      description="Создайте индекс: coffeeshop_id (Ascending) + timestamp (Descending). Firestore → Indexes → Composite Indexes."
    />

    <div style="margin:12px 0; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
      <el-date-picker v-model="range" type="daterange" range-separator="—" start-placeholder="От" end-placeholder="До" unlink-panels />
      <el-select v-model="statusFilter" style="width:160px">
        <el-option label="Все статусы" value="all" />
        <el-option label="Выполнено" value="done" />
        <el-option label="Пропущено" value="missed" />
      </el-select>
      <el-select v-model="sectionFilter" style="width:240px" clearable placeholder="Секция">
        <el-option label="Все секции" value="all" />
        <el-option v-for="opt in sectionOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
      </el-select>
      <el-button @click="range=null; statusFilter='all'; sectionFilter='all'">Сбросить фильтры</el-button>
      <el-button type="primary" @click="createDemoResults">Создать демо-результаты за сегодня</el-button>
    </div>

    <el-skeleton v-if="loading" :rows="6" animated />
    <el-empty v-else-if="!filtered.length" description="Пока пусто" />

    <el-table v-else :data="filtered" style="width:100%;">
      <el-table-column label="Дата/время" width="200">
        <template #default="{ row }">{{ fmtDateTime(row.timestamp) }}</template>
      </el-table-column>

      <el-table-column label="Секция" width="240">
        <template #default="{ row }">{{ sectionTitle(row) }}</template>
      </el-table-column>

      <el-table-column label="Задача" min-width="200">
        <template #default="{ row }">{{ taskTitle(row) }}</template>
      </el-table-column>

      <el-table-column label="Статус" width="140">
        <template #default="{ row }">
          <el-tag :type="row.status === 'done' ? 'success' : 'danger'">
            {{ row.status === 'done' ? 'Выполнено' : 'Пропущено' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="Фото" width="170">
        <template #default="{ row }">
          <el-image
            v-if="row.photo_url"
            :src="row.photo_url"
            :preview-src-list="[row.photo_url]"
            style="width:140px; height:90px; object-fit:cover; border-radius:8px;"
          />
          <span v-else>—</span>
        </template>
      </el-table-column>

      <el-table-column prop="user_id" label="Сотрудник" width="160" />
    </el-table>
  </div>
</template>