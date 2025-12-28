import { defineStore } from 'pinia'
import { auth, db } from '@/firebase'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import type { UserProfile } from '@/types'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    fbUser: null as User | null,
    profile: null as UserProfile | null,
    ready: false,
  }),
  actions: {
    async init(): Promise<void> {
      return new Promise<void>((resolve) => {
        onAuthStateChanged(auth, async (u) => {
          this.fbUser = u
          this.profile = null

          if (u) {
            // Пытаемся прочитать профиль из 'users' (правильно) и, на всякий случай, из 'Users'
            let snapOk = false

            try {
              const snap = await getDoc(doc(db, 'users', u.uid))
              if (snap.exists()) {
                const base = snap.data() as Partial<Omit<UserProfile, 'id'>>
                const role = base.role ? String(base.role).toLowerCase() as UserProfile['role'] : undefined
                const coffeeshop_id = base.coffeeshop_id != null ? String(base.coffeeshop_id) : undefined
                if (role) {
                  this.profile = {
                    id: u.uid,
                    name: base.name ?? '',
                    role,
                    coffeeshop_id,
                  }
                  snapOk = true
                }
              }
            } catch {
              // ignored — попробуем fallback
            }

            if (!snapOk) {
              try {
                const alt = await getDoc(doc(db, 'Users', u.uid))
                if (alt.exists()) {
                  const base = alt.data() as Partial<Omit<UserProfile, 'id'>>
                  const role = base.role ? String(base.role).toLowerCase() as UserProfile['role'] : undefined
                  const coffeeshop_id = base.coffeeshop_id != null ? String(base.coffeeshop_id) : undefined
                  if (role) {
                    this.profile = {
                      id: u.uid,
                      name: base.name ?? '',
                      role,
                      coffeeshop_id,
                    }
                    snapOk = true
                  }
                }
              } catch {
                // если правила не разрешают 'Users', просто не заполняем профиль
              }
            }
          }

          this.ready = true
          resolve()
        })
      })
    },
    async login(email: string, password: string): Promise<void> {
      await signInWithEmailAndPassword(auth, email, password)
    },
    async logout(): Promise<void> {
      await signOut(auth)
      this.fbUser = null
      this.profile = null
    },
  },
})
