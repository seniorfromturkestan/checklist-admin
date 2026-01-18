<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { collection, query, onSnapshot } from 'firebase/firestore'

defineOptions({ name: 'StatsPage' })

const auth = useAuthStore()
const loading = ref(true)
const errorText = ref<string | null>(null)

type ResultStatus = 'Not_Done' | 'In_Review' | 'Approved' | 'Rejected' | string

interface ResultRow {
  id: string
  status: ResultStatus
  /** milliseconds */
  timestamp_ms: number
  /** optional: for одноразовых, которые пишем сразу в results */
  title?: string
  type?: string
}

const results = ref<ResultRow[]>([])

// --- helpers ---
const toMs = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (!v || typeof v !== 'object') return null

  // Firestore Timestamp-like
  const anyV = v as { toMillis?: () => number; seconds?: number }
  if (typeof anyV.toMillis === 'function') return anyV.toMillis()
  if (typeof anyV.seconds === 'number') return anyV.seconds * 1000
  return null
}

const dayKey = (ms: number) => {
  const d = new Date(ms)
  // YYYY-MM-DD
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

const dayLabel = (key: string) => {
  // key is YYYY-MM-DD
  const [y, m, d] = key.split('-')
  return `${d}.${m}.${y}`
}



// --- KPIs ---
const totals = computed(() => {
  let done = 0
  let missed = 0
  let inReview = 0
  let Rejected = 0

  for (const r of results.value) {
    if (r.status === 'Approved') done++
    else if (r.status === 'Not_Done') missed++
    else if (r.status === 'In_Review') inReview++
    else if (r.status === 'Rejected') Rejected++
  }

  const total = done + missed + inReview + Rejected
  const doneBase = done + missed
  const rate = doneBase > 0 ? Math.round((done * 100) / doneBase) : 0

  return { total, done, missed, inReview, Rejected, rate }
})

const byDay = computed(() => {
  const map: Record<
    string,
    { Approved: number; Not_Done: number; In_Review: number; Rejected: number; total: number }
  > = {}

  for (const r of results.value) {
    const k = dayKey(r.timestamp_ms)
    if (!map[k]) map[k] = { Approved: 0, Not_Done: 0, In_Review: 0, Rejected: 0, total: 0 }

    map[k].total += 1
    if (r.status === 'Approved') map[k].Approved += 1
    else if (r.status === 'Not_Done') map[k].Not_Done += 1
    else if (r.status === 'In_Review') map[k].In_Review += 1
    else if (r.status === 'Rejected') map[k].Rejected += 1
    else {
      // unknown status -> count into total only
    }
  }

  return Object.entries(map)
    .map(([day, v]) => {
      const base = v.Approved + v.Not_Done
      const rate = base > 0 ? Math.round((v.Approved * 100) / base) : 0
      return {
        day,
        label: dayLabel(day),
        ...v,
        rate,
      }
    })
    .sort((a, b) => (a.day < b.day ? 1 : -1))
})

onMounted(() => {
  const shopId = auth.profile?.coffeeshop_id
  if (!shopId) {
    loading.value = false
    errorText.value = 'В профиле нет coffeeshop_id (нельзя определить кофейню).'
    return
  }

  onSnapshot(
    query(collection(db, `coffeeshops/${shopId}/task_results`)),
    (snap) => {
      const rows: ResultRow[] = []
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>
        const ms = toMs(data['timestamp']) ?? toMs(data['actual_finish_time']) ?? Date.now()
        rows.push({
          id: d.id,
          status: (data['status'] as string | undefined) ?? 'Not_Done',
          title: data['title'] as string | undefined,
          type: data['type'] as string | undefined,
          timestamp_ms: ms,
        })
      })

      // newest first (useful for KPIs that may later show "today")
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
</script>

<template>
  <div class="stats">
    <div class="stats__head">
      <el-page-header content="Статистика" />
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
      <!-- KPI cards -->
      <el-row :gutter="12" class="stats__kpi">
        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="kpi">
            <div class="kpi__label">Выполнено</div>
            <div class="kpi__value">{{ totals.done }}</div>
            <el-progress :percentage="totals.rate" />
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="kpi">
            <div class="kpi__label">Не выполнено</div>
            <div class="kpi__value">{{ totals.missed }}</div>
            <div class="kpi__hint">Статус: Not_Done</div>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="kpi">
            <div class="kpi__label">На проверке</div>
            <div class="kpi__value">{{ totals.inReview }}</div>
            <div class="kpi__hint">Статус: In_Review</div>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <el-card class="kpi">
            <div class="kpi__label">Отклонено</div>
            <div class="kpi__value">{{ totals.Rejected }}</div>
            <div class="kpi__hint">Статус: Rejected</div>
          </el-card>
        </el-col>
      </el-row>

      <el-card class="stats__block">
        <div class="stats__block-title">Динамика по дням</div>
        <div class="stats__block-subtitle">
          Процент считается только по базе <b>Approved</b> / <b>Not_Done</b> (без In
          Review/Rejected).
        </div>

        <el-empty v-if="byDay.length === 0" description="Пока нет данных" />

        <el-table v-else :data="byDay" style="width: 100%">
          <el-table-column prop="label" label="День" width="140" />
          <el-table-column prop="Approved" label="Выполнено" width="130" />
          <el-table-column prop="Not_Done" label="Не выполнено" width="150" />
          <el-table-column prop="In_Review" label="На проверке" width="140" />
          <el-table-column prop="Rejected" label="Отклонено" width="130" />
          <el-table-column label="Эффективность">
            <template #default="{ row }">
              <div class="rate">
                <div class="rate__bar"><el-progress :percentage="row.rate" /></div>
                <div class="rate__text">{{ row.rate }}%</div>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.stats {
  padding: 16px;
}

.stats__head {
  margin-bottom: 12px;
}

.stats__kpi {
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
  margin-bottom: 10px;
}

.kpi__hint {
  font-size: 12px;
  opacity: 0.65;
}

.stats__block {
  margin-top: 12px;
}

.stats__block-title {
  font-weight: 800;
  font-size: 16px;
  margin-bottom: 6px;
}

.stats__block-subtitle {
  font-size: 12px;
  opacity: 0.75;
  margin-bottom: 12px;
}

.rate {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rate__bar {
  flex: 1;
  min-width: 140px;
}

.rate__text {
  width: 52px;
  text-align: right;
  font-weight: 700;
}
</style>
