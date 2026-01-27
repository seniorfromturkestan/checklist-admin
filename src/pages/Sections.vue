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
  <div class="tasks-page">
    <div class="page-header">
      <h1 class="page-title">Задачи</h1>
    </div>

    <div v-if="permWarn" class="warning-alert">
      <div class="alert-icon">⚠️</div>
      <div class="alert-content">
        <div class="alert-title">{{ permWarn }}</div>
        <div class="alert-desc">Проверьте Firestore Rules и профиль пользователя.</div>
      </div>
    </div>

    <div class="actions-card">
      <button class="create-btn" @click="openCreate">
        <span class="btn-icon">+</span>
        Новая задача
      </button>
    </div>

    <el-skeleton v-if="loading" :rows="5" animated />

    <div v-else-if="!items.length" class="empty-state">
      <div class="empty-icon">📝</div>
      <div class="empty-text">Задач пока нет</div>
      <button class="empty-btn" @click="openCreate">Создать первую задачу</button>
    </div>

    <div v-else class="table-card">
      <el-table :data="items" style="width: 100%">
        <el-table-column prop="title" label="Задача" min-width="200" />

        <el-table-column label="Тип" width="140">
          <template #default="{ row }">
            <span class="type-badge">
              {{ row.type === 'photo' ? 'Фото' : 'Чекбокс' }}
            </span>
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
            <div class="action-buttons">
              <button class="edit-btn" @click="openEdit(row)">Изменить</button>
              <button class="delete-btn" @click="removeTask(row)">Удалить</button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="dialogOpen"
      :title="mode === 'create' ? 'Новая задача' : 'Редактировать задачу'"
      width="720px"
      @close="resetForm"
      class="task-dialog"
    >
      <el-form label-width="160" class="task-form">
        <el-form-item label="Название">
          <el-input
            v-model="form.title"
            placeholder="Например: Протереть витрину"
            class="form-input"
          />
        </el-form-item>

        <el-form-item label="Тип">
          <el-select v-model="form.type" style="width: 220px" class="form-select">
            <el-option label="Чекбокс" value="checkbox" />
            <el-option label="Фото-отчёт" value="photo" />
          </el-select>
        </el-form-item>

        <el-form-item label="Повтор">
          <el-radio-group v-model="form.repeat_type" class="repeat-group">
            <el-radio-button label="once">Одноразовый</el-radio-button>
            <el-radio-button label="weekly">Дни недели</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="form.repeat_type === 'weekly'" label="Календарь недели">
          <div class="days-selector">
            <el-checkbox
              :model-value="isAllSelected"
              :indeterminate="isIndeterminate"
              @change="toggleAllDays"
              class="all-days-check"
            >
              Выбрать все
            </el-checkbox>

            <el-checkbox-group v-model="form.days" class="days-group">
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
            class="time-select"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <button class="cancel-btn" @click="dialogOpen = false">Отмена</button>
          <button class="save-btn" :disabled="!canSave" @click="save">
            {{ mode === 'create' ? 'Сохранить' : 'Обновить' }}
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tasks-page {
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

.actions-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 20px 24px;
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

.type-badge {
  font-size: 13px;
  color: #666666;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.edit-btn,
.delete-btn {
  height: 32px;
  padding: 0 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.edit-btn {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  color: #1a1a1a;
}

.edit-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.delete-btn {
  background: rgba(239, 68, 68, 0.1);
  backdrop-filter: blur(8px);
  color: #dc2626;
  border-color: rgba(239, 68, 68, 0.2);
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.cancel-btn,
.save-btn {
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

.save-btn {
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
  color: #ffffff;
  border-color: rgba(0, 0, 0, 0.2);
}

.save-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 1);
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.days-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.days-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Element Plus Table Overrides */
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

/* Element Plus Dialog Overrides */
:deep(.el-overlay) {
  background-color: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(8px);
}

:deep(.el-dialog) {
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

/* Element Plus Form Overrides */
:deep(.el-form-item__label) {
  font-weight: 500;
  color: #333333;
  font-size: 14px;
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

:deep(.el-select .el-input__wrapper) {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

:deep(.el-radio-button__inner) {
  background: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  color: #1a1a1a !important;
  font-weight: 500;
  transition: all 0.3s ease;
  box-shadow: none !important;
}

:deep(.el-radio-button__inner:hover) {
  background: rgba(0, 0, 0, 0.05) !important;
  border-color: rgba(0, 0, 0, 0.2) !important;
}

:deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: rgba(0, 0, 0, 0.9) !important;
  backdrop-filter: blur(8px);
  border-color: rgba(0, 0, 0, 0.2) !important;
  color: #ffffff !important;
  box-shadow: none !important;
}

:deep(.el-checkbox) {
  font-weight: 500;
  color: #333333;
}

:deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background: rgba(0, 0, 0, 0.9) !important;
  border-color: rgba(0, 0, 0, 0.2) !important;
}

:deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner) {
  background: rgba(0, 0, 0, 0.9) !important;
  border-color: rgba(0, 0, 0, 0.2) !important;
}

:deep(.el-checkbox__input.is-checked .el-checkbox__inner::after) {
  border-color: #ffffff !important;
}

:deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner::before) {
  background: #ffffff !important;
}

:deep(.el-checkbox__label) {
  color: #1a1a1a !important;
  font-weight: 500;
}

:deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #1a1a1a !important;
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

:deep(.el-message-box) {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
}

:deep(.el-message-box__btns .el-button--primary) {
  background: rgba(239, 68, 68, 0.9);
  border-color: rgba(239, 68, 68, 0.2);
}

:deep(.el-message-box__btns .el-button--primary:hover) {
  background: rgba(239, 68, 68, 1);
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

:deep(.el-skeleton) {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 24px;
}

/* Адаптивность для планшетов */
@media (max-width: 1024px) {
  .page-header,
  .actions-card,
  .table-card {
    padding: 16px 20px;
  }

  :deep(.el-dialog) {
    width: 90% !important;
    max-width: 600px;
  }
}

/* Адаптивность для мобильных устройств */
@media (max-width: 768px) {
  .page-title {
    font-size: 20px;
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

  .edit-btn,
  .delete-btn {
    width: 100%;
  }

  :deep(.el-dialog) {
    width: 95% !important;
  }



  .days-group {
    flex-direction: column;
  }
}

/* Очень маленькие экраны */
@media (max-width: 480px) {
  .tasks-page {
    gap: 12px;
  }

  .page-header,
  .actions-card,
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

  :deep(.el-form-item__label) {
    font-size: 13px;
  }
}
</style>