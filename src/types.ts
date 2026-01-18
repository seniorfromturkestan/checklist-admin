// Roles
export type Role = 'superadmin' | 'admin' | 'staff'

export interface GeoPoint {
  latitude: number
  longitude: number
}

// 1) Users (Пользователи) → userList
export interface UserProfile {
  id: string
  name: string
  role: Role
  login: string
  password: string
  coffeeshop_id: string | null // nullable (для superadmin)
  coffeeshop_location?: GeoPoint // чтобы не делать лишний запрос к Coffeeshops
}

// 2) Coffeeshops (Кофейни)
export interface Coffeeshop {
  id: string
  name: string
  location: GeoPoint
}

// 3) Tasks (Задачи)
export type TaskType = 'checkbox' | 'photo'

export interface Task {
  id: string
  days: number[] // List<Int> (1..7)
  title: string
  type: TaskType
  expected_finish_time: string // e.g. '09:30' or '18:00'
}

// 4) TaskResults (Результаты выполнения задач)
export type TaskResultStatus = 'Not_Done' | 'In_Review' | 'Approved' | 'Rejected'

export interface TaskResult {
  id: string
  task_id: string | null
  user_id: string | null
  status: TaskResultStatus

  date: string // 'YYYY-MM-DD' ✅ обязательно
  timestamp: number // created_at (ms) — когда создана запись на день

  photo_url?: string | null
  review_comment?: string | null

  expected_finish_time?: string | null // '09:30'
  actual_finish_time?: number | null // ms
}

// 5) Shifts (Смены)
export interface Shift {
  id: string
  location: GeoPoint
  user_id: string
  date: string // e.g. '2023-08-15'
  check_in: number // timestamp (Firebase)
  check_out: number // timestamp (Firebase)
}
