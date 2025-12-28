<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
defineOptions({
  name: 'StatsPage',
})
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import type { TaskResult, Task, Section } from '@/types'

const auth = useAuthStore()
const loading = ref(true)
const results = ref<TaskResult[]>([])
const tasks = ref<Record<string, Task>>({})
const sections = ref<Record<string, Section>>({})

const dkey = (ts:number) => new Intl.DateTimeFormat('ru-RU', { year:'numeric', month:'2-digit', day:'2-digit'}).format(ts)

const byDay = computed(() => {
  const map: Record<string, {done:number; missed:number}> = {}
  for (const r of results.value) {
    const k = dkey(r.timestamp)
    if (!map[k]) map[k] = {done:0, missed:0}
    if (r.status==='done') map[k].done++; else map[k].missed++
  }
  return Object.entries(map).map(([day, v]) => ({
    day, done: v.done, missed: v.missed,
    rate: (v.done + v.missed) ? Math.round(v.done*100/(v.done+v.missed)) : 0
  })).sort((a,b)=> a.day<b.day ? 1:-1)
})

const bySection = computed(() => {
  const counter: Record<string, {done:number; missed:number}> = {}
  for (const r of results.value) {
    const t = tasks.value[r.task_id]
    if (!t) continue
    const s = sections.value[t.section_id]
    const key = s ? s.title : '—'
    if (!counter[key]) counter[key] = {done:0, missed:0}
    if (r.status==='done') counter[key].done++; else counter[key].missed++
  }
  return Object.entries(counter).map(([title, v]) => ({
    title, done: v.done, missed: v.missed,
    rate: (v.done + v.missed) ? Math.round(v.done*100/(v.done+v.missed)) : 0
  })).sort((a,b)=> b.rate - a.rate)
})

onMounted(() => {
  const shopId = auth.profile?.coffeeshop_id
  if (!shopId) { loading.value=false; return }

  onSnapshot(query(collection(db,'tasks'), where('coffeeshop_id','==', shopId)),
    (snap) => {
      const map: Record<string, Task> = {}
      snap.forEach(d => map[d.id] = { id:d.id, ...(d.data() as any) })
      tasks.value = map
    }
  )
  onSnapshot(query(collection(db,'sections'), where('coffeeshop_id','==', shopId)),
    (snap) => {
      const map: Record<string, Section> = {}
      snap.forEach(d => map[d.id] = { id:d.id, ...(d.data() as any) })
      sections.value = map
    }
  )
  onSnapshot(query(collection(db,'task_results'), where('coffeeshop_id','==', shopId)),
    (snap) => {
      results.value = snap.docs.map(d => ({ id:d.id, ...(d.data() as any) }))
      loading.value = false
    }
  )
})
</script>

<template>
  <div style="padding:16px;">
    <el-page-header content="Статистика" />
    <el-skeleton v-if="loading" :rows="6" animated />

    <template v-else>
      <el-card style="margin-bottom:16px;">
        <div style="font-weight:700; margin-bottom:8px;">По дням</div>
        <el-table :data="byDay">
          <el-table-column prop="day" label="День" width="140" />
          <el-table-column prop="done" label="Выполнено" width="140" />
          <el-table-column prop="missed" label="Пропущено" width="140" />
          <el-table-column label="Процент">
            <template #default="{row}">
              <el-progress :percentage="row.rate" />
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card>
        <div style="font-weight:700; margin-bottom:8px;">По секциям</div>
        <el-table :data="bySection">
          <el-table-column prop="title" label="Секция" />
          <el-table-column prop="done" label="Выполнено" width="140" />
          <el-table-column prop="missed" label="Пропущено" width="140" />
          <el-table-column label="Процент">
            <template #default="{row}">
              <el-progress :percentage="row.rate" />
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>
