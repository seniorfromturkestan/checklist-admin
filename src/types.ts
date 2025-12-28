// src/types.ts
export type Role = 'superadmin' | 'admin' | 'staff'

export interface UserProfile {
  id: string
  name: string
  role: Role
  coffeeshop_id?: string // у суперадмина может быть undefined
}

export interface Coffeeshop {
  id: string
  name: string
  location?: string
  admin_id: string
}

export type RepeatType = 'daily' | 'weekdays' | 'once'

export interface Section {
  id: string
  coffeeshop_id: string
  title: string
  start_time: string // '09:00'
  end_time: string   // '13:00'
  repeat_type: RepeatType
  created_at?: number
}

export type TaskType = 'checkbox' | 'photo'

export interface Task {
  id: string
  coffeeshop_id: string // дублируем для упрощения правил/запросов
  section_id: string
  title: string
  type: TaskType
  deadline: string      // '09:30' (внутри окна секции)
  is_active: boolean
  created_at?: number
}

export interface TaskResult {
  id: string
  coffeeshop_id: string
  task_id: string
  user_id: string
  status: 'done' | 'missed'
  photo_url?: string
  timestamp: number
}
