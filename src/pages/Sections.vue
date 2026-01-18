<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { db } from '@/firebase'
import {
  collection,
  query,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  type FirestoreDataConverter,
  type DocumentData,
} from 'firebase/firestore'
import { ElMessage, ElMessageBox } from 'element-plus'
import { FirebaseError } from 'firebase/app'

defineOptions({ name: 'TasksPage' })

// Local types for this page (sections removed)

type TaskType = 'checkbox' | 'photo'

type RepeatType = 'once' | 'weekly'

interface TaskDoc {
  id: string
  title: string
  type: TaskType
  repeat_type: RepeatType
  /** only for weekly */
  days?: number[]
  /** e.g. '09:30' */
  expected_finish_time: string
  created_at?: number
}

const auth = useAuthStore()
const loading = ref(true)
const items = ref<TaskDoc[]>([])
const dialogOpen = ref(false)
const permWarn = ref<string | null>(null)

const mode = ref<'create' | 'edit'>('create')
const currentId = ref<string | null>(null)

const allDays = [1, 2, 3, 4, 5, 6, 7]

const form = ref({
  title: '',
  type: 'checkbox' as TaskType,
  repeat_type: 'once' as RepeatType,
  days: [] as number[],
  expected_finish_time: '09:00',
})

const isAllSelected = computed(() => form.value.days.length === 7)
const isIndeterminate = computed(() => form.value.days.length > 0 && form.value.days.length < 7)

const toggleAllDays = (val: boolean) => {
  form.value.days = val ? [...allDays] : []
}

watch(
  () => form.value.repeat_type,
  (v) => {
    if (v === 'once') form.value.days = []
  },
)

const canSave = computed(() => {
  if (form.value.title.trim().length < 2) return false
  if (form.value.repeat_type === 'weekly' && form.value.days.length === 0) return false
  return true
})

const taskConverter: FirestoreDataConverter<TaskDoc> = {
  toFirestore: (t: TaskDoc): DocumentData => {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...rest } = t
    return rest as DocumentData
  },
  fromFirestore: (snap): TaskDoc => {
    const data = snap.data() as Omit<TaskDoc, 'id'>
    return { id: snap.id, ...data }
  },
}

onMounted(() => {
  void loadTasks()
})

async function loadTasks() {
  const shopId = auth.profile?.coffeeshop_id
  if (!shopId) {
    loading.value = false
    permWarn.value = 'В профиле нет coffeeshop_id'
    return
  }

  const col = collection(db, `coffeeshops/${shopId}/tasks`).withConverter(taskConverter)

  onSnapshot(
    query(col),
    (snap) => {
      items.value = snap.docs
        .map((d) => d.data())
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      loading.value = false
      permWarn.value = null
    },
    (err) => {
      loading.value = false
      const msg = err instanceof FirebaseError ? err.message : String(err)
      permWarn.value = `Ошибка Firestore: ${msg}`
      ElMessage.error(
        msg.includes('requires an index')
          ? 'Нужен индекс Firestore для этого запроса (или уберите сортировку).'
          : 'Ошибка Firestore. Проверьте правила и подключение.',
      )
    },
  )
}

const openCreate = () => {
  mode.value = 'create'
  currentId.value = null
  resetForm()
  dialogOpen.value = true
}

const openEdit = (t: TaskDoc) => {
  mode.value = 'edit'
  currentId.value = t.id
  form.value.title = t.title
  form.value.type = t.type
  form.value.repeat_type = 'weekly'
  form.value.days = Array.isArray(t.days) ? [...t.days] : []
  form.value.expected_finish_time = t.expected_finish_time
  dialogOpen.value = true
}

const save = async () => {
  const shopId = auth.profile?.coffeeshop_id
  if (!shopId) {
    ElMessage.error('Нет coffeeshop_id в профиле')
    return
  }

  const now = Date.now()

  const weeklyPayload: Omit<TaskDoc, 'id'> = {
    title: form.value.title.trim(),
    type: form.value.type,
    repeat_type: 'weekly',
    expected_finish_time: form.value.expected_finish_time,
    created_at: now,
    days: [...form.value.days].sort((a, b) => a - b),
  }

  // одноразовую задачу сразу кладём в task_results (без tasks)
  const onceResultPayload = {
    title: form.value.title.trim(),
    type: form.value.type,
    status: 'Not_Done',
    photo_url: null,
    expected_finish_time: form.value.expected_finish_time,
    actual_finish_time: null,
    timestamp: now,
    user_id: null,
    created_at: now,
  }

  try {
    if (mode.value === 'create') {
      if (form.value.repeat_type === 'weekly') {
        await addDoc(collection(db, `coffeeshops/${shopId}/tasks`), weeklyPayload)
        ElMessage.success('Задача (недельная) создана')
      } else {
        await addDoc(collection(db, `coffeeshops/${shopId}/task_results`), onceResultPayload)
        ElMessage.success('Одноразовая задача добавлена в результаты')
      }
    } else if (mode.value === 'edit' && currentId.value) {
      // редактируем только недельные задачи (они живут в tasks)
      const ref = doc(db, `coffeeshops/${shopId}/tasks`, currentId.value)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { created_at: _createdAt, ...updatePayload } = weeklyPayload
      await updateDoc(ref, updatePayload)
      ElMessage.success('Задача обновлена')
    }

    dialogOpen.value = false
    resetForm()
  } catch (err: unknown) {
    const msg =
      err instanceof FirebaseError ? err.message : err instanceof Error ? err.message : String(err)
    ElMessage.error(msg)
  }
}

const removeTask = async (t: TaskDoc) => {
  try {
    await ElMessageBox.confirm(`Удалить задачу «${t.title}»?`, 'Подтверждение', {
      type: 'warning',
      confirmButtonText: 'Удалить',
      cancelButtonText: 'Отмена',
    })
    const shopId = auth.profile?.coffeeshop_id
    if (!shopId) throw new Error('Нет coffeeshop_id в профиле')
    await deleteDoc(doc(db, `coffeeshops/${shopId}/tasks`, t.id))
    ElMessage.success('Удалено')
  } catch {
    /* canceled */
  }
}

const resetForm = () => {
  form.value = {
    title: '',
    type: 'checkbox',
    repeat_type: 'once',
    days: [],
    expected_finish_time: '09:00',
  }
}

const daysLabel = (days?: number[]) => {
  if (!days || !days.length) return '—'
  const map: Record<number, string> = {
    1: 'Пн',
    2: 'Вт',
    3: 'Ср',
    4: 'Чт',
    5: 'Пт',
    6: 'Сб',
    7: 'Вс',
  }
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => map[d] ?? String(d))
    .join(', ')
}
</script>

<template>
  <div style="padding: 16px">
    <el-page-header content="Задачи" />

    <el-alert
      v-if="permWarn"
      type="warning"
      show-icon
      style="margin: 12px 0"
      :title="permWarn"
      description="Проверьте Firestore Rules и профиль пользователя."
    />

    <div style="margin: 12px 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <el-button type="primary" @click="openCreate">Новая задача</el-button>
    </div>

    <el-skeleton v-if="loading" :rows="5" animated />
    <el-empty v-else-if="!items.length" description="Задач пока нет" />

    <el-table v-else :data="items" style="width: 100%">
      <el-table-column prop="title" label="Задача" />
      <el-table-column label="Тип" width="140">
        <template #default="{ row }">
          {{ row.type === 'photo' ? 'Фото' : 'Чекбокс' }}
        </template>
      </el-table-column>
      <el-table-column label="Повтор" width="160">
        <template #default="{ row }">
          {{ row.repeat_type === 'weekly' ? 'Дни недели' : 'Одноразовый' }}
        </template>
      </el-table-column>
      <el-table-column label="Дни" width="220">
        <template #default="{ row }">
          {{ row.repeat_type === 'weekly' ? daysLabel(row.days) : '—' }}
        </template>
      </el-table-column>
      <el-table-column prop="expected_finish_time" label="Время" width="120" />
      <el-table-column label="Действия" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">Изменить</el-button>
          <el-button size="small" type="danger" @click="removeTask(row)">Удалить</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogOpen"
      :title="mode === 'create' ? 'Новая задача' : 'Редактировать задачу'"
      width="720px"
      @close="resetForm"
    >
      <el-form label-width="160">
        <el-form-item label="Название">
          <el-input v-model="form.title" placeholder="Например: Протереть витрину" />
        </el-form-item>

        <el-form-item label="Тип">
          <el-select v-model="form.type" style="width: 220px">
            <el-option label="Чекбокс" value="checkbox" />
            <el-option label="Фото-отчёт" value="photo" />
          </el-select>
        </el-form-item>

        <el-form-item label="Повтор">
          <el-radio-group v-model="form.repeat_type">
            <el-radio-button label="once">Одноразовый</el-radio-button>
            <el-radio-button label="weekly">Дни недели</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="form.repeat_type === 'weekly'" label="Календарь недели">
          <div style="display: flex; flex-direction: column; gap: 10px">
            <el-checkbox
              :model-value="isAllSelected"
              :indeterminate="isIndeterminate"
              @change="toggleAllDays"
            >
              Выбрать все
            </el-checkbox>

            <el-checkbox-group v-model="form.days">
              <el-checkbox :label="1">Пн</el-checkbox>
              <el-checkbox :label="2">Вт</el-checkbox>
              <el-checkbox :label="3">Ср</el-checkbox>
              <el-checkbox :label="4">Чт</el-checkbox>
              <el-checkbox :label="5">Пт</el-checkbox>
              <el-checkbox :label="6">Сб</el-checkbox>
              <el-checkbox :label="7">Вс</el-checkbox>
            </el-checkbox-group>
          </div>
        </el-form-item>

        <el-form-item label="Дедлайн">
          <el-time-select
            v-model="form.expected_finish_time"
            start="06:00"
            step="00:15"
            end="23:45"
            placeholder="Выберите дедлайн"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogOpen = false">Отмена</el-button>
        <el-button type="primary" :disabled="!canSave" @click="save">
          {{ mode === 'create' ? 'Сохранить' : 'Обновить' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
