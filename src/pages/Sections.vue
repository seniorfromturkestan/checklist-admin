<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { db } from '@/firebase'
defineOptions({ name: 'SectionsPage' })
import {
  collection, query, where, orderBy, onSnapshot, doc, writeBatch,
  getDocs, updateDoc, type FirestoreDataConverter, type DocumentData
} from 'firebase/firestore'
import type { Section, Task, TaskType, RepeatType } from '@/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import { FirebaseError } from 'firebase/app'

const auth = useAuthStore()
const loading = ref(true)
const items = ref<Section[]>([])
const dialogOpen = ref(false)
const needsIndex = ref(false)
const permWarn = ref<string | null>(null)

// режим формы: создание / редактирование
const mode = ref<'create' | 'edit'>('create')
const currentSectionId = ref<string | null>(null)

// форма секции
const form = ref({
  title: '',
  start_time: '09:00',
  end_time: '13:00',
  repeat_type: 'daily' as RepeatType,
  tasks: [] as Array<{ title: string; type: TaskType; deadline: string }>,
})
const addTask = () => form.value.tasks.push({ title: '', type: 'checkbox', deadline: form.value.start_time })
const removeTask = async (i: number) => {
  try {
    await ElMessageBox.confirm('Удалить задачу?', 'Подтверждение', {
      type: 'warning',
      confirmButtonText: 'Удалить',
      cancelButtonText: 'Отмена',
    })
    form.value.tasks.splice(i, 1)
  } catch {/* canceled */}
}

// --- Firestore converters (строгая типизация, без any) ---
const sectionConverter: FirestoreDataConverter<Section> = {
  toFirestore: (s: Section): DocumentData => {
    const { id, ...rest } = s
    return rest as DocumentData
  },
  fromFirestore: (snap): Section => {
    const data = snap.data() as Omit<Section, 'id'>
    return { id: snap.id, ...data }
  },
}
const taskConverter: FirestoreDataConverter<Task> = {
  toFirestore: (t: Task): DocumentData => {
    const { id, ...rest } = t
    return rest as DocumentData
  },
  fromFirestore: (snap): Task => {
    const data = snap.data() as Omit<Task, 'id'>
    return { id: snap.id, ...data }
  },
}

onMounted(() => {
  void loadSections()
})

// Универсальная загрузка секций с резервными сценариями
async function loadSections() {
  const shopId = auth.profile?.coffeeshop_id
  if (!shopId) { loading.value = false; permWarn.value = 'В профиле нет coffeeshop_id'; return }

  const colWith = collection(db, 'sections').withConverter(sectionConverter)

  // 1) Основной слушатель: where + orderBy (typed)
  onSnapshot(
    query(colWith, where('coffeeshop_id', '==', shopId), orderBy('start_time', 'asc')),
    (snap) => {
      items.value = snap.docs.map(d => d.data())
      loading.value = false
      permWarn.value = null
    },
    (err) => {
      if (err instanceof FirebaseError) {
        if (err.code === 'failed-precondition') {
          // нет индекса — fallback без orderBy (typed)
          needsIndex.value = true
          onSnapshot(
            query(colWith, where('coffeeshop_id', '==', shopId)),
            (snap2) => {
              const list = snap2.docs.map(d => d.data())
              list.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
              items.value = list
              loading.value = false
              permWarn.value = null
            },
            (err2) => {
              // 3) Полный fallback: без where — используем неконвертированную коллекцию и ручную фильтрацию
              if (err2 instanceof FirebaseError && err2.code === 'permission-denied') {
                const colPlain = collection(db, 'sections')
                onSnapshot(
                  query(colPlain, orderBy('start_time', 'asc')),
                  (snap3) => {
                    const rawList = snap3.docs.map(d => ({ id: d.id, ...(d.data() as DocumentData) })) as Array<Partial<Section> & { id: string }>
                    const filtered = rawList.filter(r => r.coffeeshop_id == null || r.coffeeshop_id === shopId)
                    items.value = filtered as Section[]
                    loading.value = false
                    permWarn.value = 'Часть документов без coffeeshop_id — нажми «Миграция»'
                  },
                  (err3) => showPerm(err3)
                )
              } else {
                showPerm(err2)
              }
            }
          )
        } else if (err.code === 'permission-denied') {
          // Прямо идём в запрос без where
          const colPlain = collection(db, 'sections')
          onSnapshot(
            query(colPlain, orderBy('start_time', 'asc')),
            (snap3) => {
              const rawList = snap3.docs.map(d => ({ id: d.id, ...(d.data() as DocumentData) })) as Array<Partial<Section> & { id: string }>
              const filtered = rawList.filter(r => r.coffeeshop_id == null || r.coffeeshop_id === shopId)
              items.value = filtered as Section[]
              loading.value = false
              permWarn.value = 'Часть документов без coffeeshop_id — нажми «Миграция»'
            },
            (err3) => showPerm(err3)
          )
        } else {
          ElMessage.error(err.message)
          loading.value = false
        }
      } else {
        ElMessage.error((err as Error).message)
        loading.value = false
      }
    }
  )
}

function showPerm(err: unknown) {
  loading.value = false
  const msg = err instanceof FirebaseError ? err.message : String(err)
  permWarn.value = `Нет доступа к части документов: ${msg}`
  ElMessage.error('Недостаточно прав. Проверьте профиль и правила Firestore.')
}

const canSave = computed(() =>
  form.value.title.trim().length > 1 &&
  form.value.tasks.every(t => t.title.trim().length > 0)
)

const openCreate = () => {
  mode.value = 'create'
  currentSectionId.value = null
  resetForm()
  dialogOpen.value = true
}

const openEdit = async (section: Section) => {
  mode.value = 'edit'
  currentSectionId.value = section.id
  // заполняем поля секции
  form.value.title = section.title
  form.value.start_time = section.start_time
  form.value.end_time = section.end_time
  form.value.repeat_type = section.repeat_type as RepeatType

  // подтягиваем задачи этой секции (typed)
  const snap = await getDocs(query(collection(db, 'tasks').withConverter(taskConverter), where('section_id', '==', section.id)))
  const tasks: Array<{ title: string; type: TaskType; deadline: string }> = snap.docs
    .map(d => d.data())
    .map(td => ({ title: td.title, type: td.type, deadline: td.deadline }))
  // сортировка дедлайнов (по времени)
  tasks.sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
  form.value.tasks = tasks

  dialogOpen.value = true
}

const save = async () => {
  if (!auth.profile?.coffeeshop_id) { ElMessage.error('Нет coffeeshop_id в профиле'); return }
  try {
    if (mode.value === 'create') {
      const batch = writeBatch(db)
      // 1) создаём секцию
      const secRef = doc(collection(db, 'sections'))
      const section: Omit<Section,'id'> = {
        coffeeshop_id: auth.profile.coffeeshop_id!,
        title: form.value.title.trim(),
        start_time: form.value.start_time,
        end_time: form.value.end_time,
        repeat_type: form.value.repeat_type,
        created_at: Date.now(),
      }
      batch.set(secRef, section)
      // 2) добавляем задачи
      const tasksCol = collection(db, 'tasks')
      for (const t of form.value.tasks) {
        const tRef = doc(tasksCol)
        const task: Omit<Task,'id'> = {
          coffeeshop_id: auth.profile.coffeeshop_id!,
          section_id: secRef.id,
          title: t.title.trim(),
          type: t.type,
          deadline: t.deadline,
          is_active: true,
          created_at: Date.now(),
        }
        batch.set(tRef, task)
      }
      await batch.commit()
      ElMessage.success('Секция и задачи созданы')
    } else if (mode.value === 'edit' && currentSectionId.value) {
      // обновляем секцию
      const secRef = doc(db, 'sections', currentSectionId.value)
      await updateDoc(secRef, {
        title: form.value.title.trim(),
        start_time: form.value.start_time,
        end_time: form.value.end_time,
        repeat_type: form.value.repeat_type,
        coffeeshop_id: auth.profile!.coffeeshop_id!, // важно для правил
      })
      // пересоздаём задачи (проще и надёжнее)
      const existing = await getDocs(query(collection(db, 'tasks'), where('section_id', '==', currentSectionId.value)))
      const batch = writeBatch(db)
      existing.forEach(d => batch.delete(d.ref))
      const tasksCol = collection(db, 'tasks')
      for (const t of form.value.tasks) {
        const tRef = doc(tasksCol)
        const task: Omit<Task,'id'> = {
          coffeeshop_id: auth.profile.coffeeshop_id!,
          section_id: currentSectionId.value,
          title: t.title.trim(),
          type: t.type,
          deadline: t.deadline,
          is_active: true,
          created_at: Date.now(),
        }
        batch.set(tRef, task)
      }
      await batch.commit()
      ElMessage.success('Секция обновлена')
    }

    dialogOpen.value = false
    resetForm()
  } catch (err: unknown) {
    let msg = 'Произошла ошибка'
    if (err instanceof FirebaseError) msg = err.message
    else if (err instanceof Error) msg = err.message
    else msg = String(err)
    ElMessage.error(msg)
  }
}

const removeSection = async (section: Section) => {
  try {
    await ElMessageBox.confirm(
      `Удалить секцию «${section.title}» и все её задачи?`,
      'Подтверждение',
      { type: 'warning', confirmButtonText: 'Удалить', cancelButtonText: 'Отмена' }
    )
    // удалить все задачи секции и саму секцию
    const snap = await getDocs(query(collection(db, 'tasks'), where('section_id', '==', section.id)))
    const batch = writeBatch(db)
    snap.forEach(d => batch.delete(d.ref))
    batch.delete(doc(db, 'sections', section.id))
    await batch.commit()
    ElMessage.success('Секция удалена')
  } catch {
    /* canceled */
  }
}

const duplicateSection = async (section: Section) => {
  try {
    const title = `${section.title} (копия)`
    const batch = writeBatch(db)
    // читаем задачи исходной секции
    const tSnap = await getDocs(query(collection(db, 'tasks').withConverter(taskConverter), where('section_id', '==', section.id)))
    // создаём новую секцию
    const secRef = doc(collection(db, 'sections'))
    batch.set(secRef, {
      coffeeshop_id: auth.profile!.coffeeshop_id!, // берем из профиля
      title,
      start_time: section.start_time,
      end_time: section.end_time,
      repeat_type: section.repeat_type,
      created_at: Date.now(),
    } as Omit<Section,'id'>)
    // копируем задачи
    const tasksCol = collection(db, 'tasks')
    tSnap.forEach(d => {
      const src = d.data()
      const tRef = doc(tasksCol)
      batch.set(tRef, {
        coffeeshop_id: auth.profile!.coffeeshop_id!, // берем из профиля
        section_id: secRef.id,
        title: src.title,
        type: src.type,
        deadline: src.deadline,
        is_active: true,
        created_at: Date.now(),
      } as Omit<Task,'id'>)
    })
    await batch.commit()
    ElMessage.success('Секция склонирована')
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

// Одноразовая миграция: проставить coffeeshop_id там, где его нет
const migrateShopId = async () => {
  const shopId = auth.profile?.coffeeshop_id
  if (!shopId) { ElMessage.error('Нет coffeeshop_id в профиле'); return }
  try {
    const allSecs = await getDocs(collection(db, 'sections'))
    const batch = writeBatch(db)
    const fixIds: string[] = []
    allSecs.forEach(d => {
      const data = d.data() as Partial<Section>
      if (data.coffeeshop_id == null) {
        batch.update(d.ref, { coffeeshop_id: shopId })
        fixIds.push(d.id)
      }
    })
    await batch.commit()
    // фиксим задачи для этих секций
    for (const secId of fixIds) {
      const tSnap = await getDocs(query(collection(db, 'tasks'), where('section_id', '==', secId)))
      const b2 = writeBatch(db)
      tSnap.forEach(td => {
        const tdata = td.data() as Partial<Task>
        if (tdata.coffeeshop_id == null) {
          b2.update(td.ref, { coffeeshop_id: shopId })
        }
      })
      await b2.commit()
    }
    ElMessage.success('Миграция завершена')
    permWarn.value = null
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const resetForm = () => {
  form.value = {
    title: '',
    start_time: '09:00',
    end_time: '13:00',
    repeat_type: 'daily',
    tasks: [],
  }
}
</script>

<template>
  <div style="padding:16px;">
    <el-page-header content="Секции задач" />

    <el-alert
      v-if="needsIndex"
      type="warning"
      show-icon
      style="margin:12px 0"
      title="Требуется композитный индекс"
      description="Создайте индекс: sections by coffeeshop_id (Ascending), start_time (Ascending)."
    />

    <el-alert
      v-if="permWarn"
      type="warning"
      show-icon
      style="margin:12px 0"
      :title="permWarn"
      description="Если документы старые и без поля coffeeshop_id — нажмите «Миграция», поле будет проставлено автоматически."
    />

    <div style="margin:12px 0; display:flex; gap:8px; align-items:center; flex-wrap: wrap;">
      <el-button type="primary" @click="openCreate">Новая секция</el-button>
      <el-button @click="migrateShopId">Миграция (проставить coffeeshop_id)</el-button>
    </div>

    <el-skeleton v-if="loading" :rows="5" animated />
    <el-empty v-else-if="!items.length" description="Секций пока нет" />

    <el-table v-else :data="items" style="width:100%;">
      <el-table-column prop="title" label="Секция" />
      <el-table-column label="Время" width="220">
        <template #default="{row}">
          {{ row.start_time }} — {{ row.end_time }}
        </template>
      </el-table-column>
      <el-table-column prop="repeat_type" label="Повтор" width="160" />
      <el-table-column label="Действия" width="260" fixed="right">
        <template #default="{row}">
          <el-button size="small" @click="openEdit(row)">Изм.</el-button>
          <el-button size="small" @click="duplicateSection(row)">Клон</el-button>
          <el-button size="small" type="danger" @click="removeSection(row)">Удалить</el-button>
        </template>
      </el-table-column>
    </el-table>
    
    <el-dialog v-model="dialogOpen" :title="mode === 'create' ? 'Новая секция' : 'Редактировать секцию'" width="720px" @close="resetForm">
      <el-form label-width="140">
        <el-form-item label="Название">
          <el-input v-model="form.title" placeholder="Открытие смены" />
        </el-form-item>
        <el-form-item label="Интервал">
          <div style="display:flex; gap:8px; align-items:center;">
            <el-time-select v-model="form.start_time" start="06:00" step="00:15" end="23:45" placeholder="Начало"/>
            <span>—</span>
            <el-time-select v-model="form.end_time" start="06:00" step="00:15" end="23:45" placeholder="Конец"/>
          </div>
        </el-form-item>
        <el-form-item label="Повтор">
          <el-select v-model="form.repeat_type" style="width:200px">
            <el-option label="Ежедневно" value="daily"/>
            <el-option label="По будням" value="weekdays"/>
            <el-option label="Одноразово" value="once"/>
          </el-select>
        </el-form-item>

        <el-divider>Задачи в секции</el-divider>
        <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
          <el-button size="small" @click="addTask">Добавить задачу</el-button>
        </div>

        <el-table :data="form.tasks" style="width:100%">
          <el-table-column label="Название">
            <template #default="{row}">
              <el-input v-model="row.title" placeholder="Протереть витрину"/>
            </template>
          </el-table-column>
          <el-table-column label="Тип" width="180">
            <template #default="{row}">
              <el-select v-model="row.type" style="width:160px">
                <el-option label="Обычная" value="checkbox" />
                <el-option label="Фото-отчёт" value="photo" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="Дедлайн" width="180">
            <template #default="{row}">
              <el-time-select v-model="row.deadline" start="06:00" step="00:15" end="23:45"/>
            </template>
          </el-table-column>
          <el-table-column width="80">
            <template #default="{ $index }">
              <el-button type="danger" text @click="removeTask($index)">Удалить</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>

      <template #footer>
        <el-button @click="dialogOpen=false">Отмена</el-button>
        <el-button type="primary" :disabled="!canSave" @click="save">
          {{ mode === 'create' ? 'Сохранить' : 'Обновить' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>