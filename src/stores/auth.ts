import { defineStore } from 'pinia'
import { ref } from 'vue'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/firebase'

export type UserRole = 'superadmin' | 'admin' | 'staff' | string

export type UserProfile = {
  id: string
  name?: string | null
  email?: string | null
  login?: string | null
  role: UserRole
  coffeeshop_id?: string | null
  created_at?: number | null
}

export const useAuthStore = defineStore('auth', () => {
  const fbUser = ref<User | null>(null)
  const profile = ref<UserProfile | null>(null)
  const ready = ref(false)

  const loadProfile = async (uid: string) => {
    const tryCols: Array<'Users' | 'users'> = ['Users', 'users']
    for (const col of tryCols) {
      const snap = await getDoc(doc(db, col, uid))
      if (snap.exists()) {
        const data = snap.data() as Record<string, unknown>
        profile.value = {
          id: uid,
          name: typeof data['name'] === 'string' ? data['name'] : null,
          email:
            typeof data['email'] === 'string'
              ? data['email']
              : typeof data['login'] === 'string'
                ? data['login']
                : null,
          login: typeof data['login'] === 'string' ? data['login'] : null,
          role: (typeof data['role'] === 'string' ? data['role'] : 'staff') as UserRole,
          coffeeshop_id: data['coffeeshop_id'] == null ? null : String(data['coffeeshop_id']),
          created_at: typeof data['created_at'] === 'number' ? data['created_at'] : null,
        }
        return
      }
    }

    profile.value = {
      id: uid,
      role: 'staff',
      coffeeshop_id: null,
      name: null,
      email: null,
      login: null,
      created_at: null,
    }
  }

  const init = async () => {
    if (ready.value) return

    await new Promise<void>((resolve) => {
      onAuthStateChanged(auth, async (u) => {
        fbUser.value = u
        if (u) {
          await loadProfile(u.uid)
        } else {
          profile.value = null
        }
        ready.value = true
        resolve()
      })
    })
  }

  const clear = () => {
    fbUser.value = null
    profile.value = null
    ready.value = true
  }

  return {
    fbUser,
    profile,
    ready,
    init,
    clear,
  }
})
