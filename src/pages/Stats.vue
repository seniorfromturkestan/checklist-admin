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
  <div class="stats-page">
    <div class="page-header">
      <h1 class="page-title">Статистика</h1>
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
      <!-- KPI cards with circular progress -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-card--approved">
          <div class="kpi-card__circle">
            <svg class="circular-progress" viewBox="0 0 120 120">
              <circle class="progress-bg" cx="60" cy="60" r="54" />
              <circle
                class="progress-bar progress-bar--approved"
                cx="60"
                cy="60"
                r="54"
                :style="{ strokeDashoffset: 339.3 - (339.3 * totals.rate) / 100 }"
              />
              <text x="60" y="60" class="progress-text">{{ totals.rate }}%</text>
            </svg>
          </div>
          <div class="kpi-card__content">
            <div class="kpi-card__label">Выполнено</div>
            <div class="kpi-card__value">{{ totals.done }}</div>
            <div class="kpi-card__hint">Эффективность</div>
          </div>
        </div>

        <div class="kpi-card kpi-card--notdone">
          <div class="kpi-card__icon">○</div>
          <div class="kpi-card__content">
            <div class="kpi-card__label">Не выполнено</div>
            <div class="kpi-card__value">{{ totals.missed }}</div>
            <div class="kpi-card__hint">Статус: Not_Done</div>
          </div>
        </div>

        <div class="kpi-card kpi-card--review">
          <div class="kpi-card__icon">⏳</div>
          <div class="kpi-card__content">
            <div class="kpi-card__label">На проверке</div>
            <div class="kpi-card__value">{{ totals.inReview }}</div>
            <div class="kpi-card__hint">Статус: In_Review</div>
          </div>
        </div>

        <div class="kpi-card kpi-card--rejected">
          <div class="kpi-card__icon">✕</div>
          <div class="kpi-card__content">
            <div class="kpi-card__label">Отклонено</div>
            <div class="kpi-card__value">{{ totals.Rejected }}</div>
            <div class="kpi-card__hint">Статус: Rejected</div>
          </div>
        </div>
      </div>

      <!-- Daily dynamics table -->
      <div class="dynamics-card">
        <div class="card-header">
          <h2 class="card-title">Динамика по дням</h2>
          <p class="card-subtitle">
            Процент считается только по базе <b>Approved</b> / <b>Not_Done</b> (без In Review/Rejected).
          </p>
        </div>

        <div v-if="byDay.length === 0" class="empty-state">
          <div class="empty-icon">📊</div>
          <div class="empty-text">Пока нет данных</div>
        </div>

        <div v-else class="table-wrapper">
          <el-table :data="byDay">
            <el-table-column prop="label" label="День" width="140" />

            <el-table-column label="Выполнено" width="130">
              <template #default="{ row }">
                <span class="stat-value stat-value--approved">{{ row.Approved }}</span>
              </template>
            </el-table-column>

            <el-table-column label="Не выполнено" width="150">
              <template #default="{ row }">
                <span class="stat-value stat-value--notdone">{{ row.Not_Done }}</span>
              </template>
            </el-table-column>

            <el-table-column label="На проверке" width="140">
              <template #default="{ row }">
                <span class="stat-value stat-value--review">{{ row.In_Review }}</span>
              </template>
            </el-table-column>

            <el-table-column label="Отклонено" width="130">
              <template #default="{ row }">
                <span class="stat-value stat-value--rejected">{{ row.Rejected }}</span>
              </template>
            </el-table-column>

            <el-table-column label="Эффективность" min-width="200">
              <template #default="{ row }">
                <div class="efficiency">
                  <div class="efficiency-bar">
                    <div
                      class="efficiency-fill"
                      :style="{ width: row.rate + '%' }"
                    ></div>
                  </div>
                  <div class="efficiency-text">{{ row.rate }}%</div>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stats-page {
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

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.kpi-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  gap: 20px;
  align-items: center;
  transition: all 0.3s ease;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.kpi-card__circle {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}

.circular-progress {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.progress-bg {
  fill: none;
  stroke: rgba(0, 0, 0, 0.05);
  stroke-width: 8;
}

.progress-bar {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
  stroke-dasharray: 339.3;
  transition: stroke-dashoffset 0.6s ease;
}

.progress-bar--approved {
  stroke: #22c55e;
}

.progress-text {
  fill: #1a1a1a;
  font-size: 20px;
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: middle;
  transform: rotate(90deg);
  transform-origin: center;
}

.kpi-card__icon {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  flex-shrink: 0;
}

.kpi-card--approved .kpi-card__icon {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.kpi-card--notdone .kpi-card__icon {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}

.kpi-card--review .kpi-card__icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.kpi-card--rejected .kpi-card__icon {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.kpi-card__content {
  flex: 1;
}

.kpi-card__label {
  font-size: 13px;
  color: #666666;
  margin-bottom: 6px;
  font-weight: 500;
}

.kpi-card__value {
  font-size: 36px;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1;
  margin-bottom: 6px;
}

.kpi-card__hint {
  font-size: 12px;
  color: #999999;
}

.dynamics-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 24px;
}

.card-header {
  margin-bottom: 20px;
}

.card-title {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 8px 0;
}

.card-subtitle {
  font-size: 13px;
  color: #666666;
  margin: 0;
}

.empty-state {
  padding: 40px 24px;
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

.table-wrapper {
  width: 100%;
  overflow-x: auto;
}

.stat-value {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
}

.stat-value--approved {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.stat-value--notdone {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}

.stat-value--review {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.stat-value--rejected {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.efficiency {
  display: flex;
  align-items: center;
  gap: 12px;
}

.efficiency-bar {
  flex: 1;
  height: 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  overflow: hidden;
  min-width: 100px;
}

.efficiency-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e 0%, #16a34a 100%);
  border-radius: 4px;
  transition: width 0.6s ease;
}

.efficiency-text {
  min-width: 50px;
  text-align: right;
  font-weight: 600;
  color: #1a1a1a;
  font-size: 14px;
}

/* Element Plus overrides */
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

:deep(.el-skeleton) {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 24px;
}

/* Адаптивность */
@media (max-width: 768px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .kpi-card {
    padding: 20px;
  }

  .kpi-card__circle {
    width: 70px;
    height: 70px;
  }

  .kpi-card__value {
    font-size: 32px;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  :deep(.el-table) {
    min-width: 800px;
  }
}

@media (max-width: 480px) {
  .page-title {
    font-size: 20px;
  }

  .card-title {
    font-size: 18px;
  }

  .kpi-card {
    padding: 16px;
    gap: 16px;
  }

  .kpi-card__circle {
    width: 60px;
    height: 60px;
  }

  .kpi-card__value {
    font-size: 28px;
  }
}
</style>