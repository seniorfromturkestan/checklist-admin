import { defineStore } from 'pinia'
import { ref } from 'vue'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
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
  const loggingOut = ref(false)

  const loadProfile = async (uid: string) => {
    // Не загружать профиль если идет процесс выхода
    if (loggingOut.value) return

    const tryCols: Array<'Users' | 'users'> = ['Users', 'users']
    for (const col of tryCols) {
      try {
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
      } catch (error) {
        // Игнорируем ошибки при выходе из системы
        if (loggingOut.value) return
        console.warn(`Failed to load profile from ${col}:`, error)
      }
    }

    // Только если не в процессе выхода
    if (!loggingOut.value) {
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
  }

  const signIn = async (email: string, password: string) => {
    loggingOut.value = false
    const cred = await signInWithEmailAndPassword(auth, email, password)
    fbUser.value = cred.user
    await loadProfile(cred.user.uid)
    ready.value = true
    return cred.user
  }

  const logout = async () => {
    // Устанавливаем флаг выхода ПЕРВЫМ делом
    loggingOut.value = true

    // Сразу очищаем локальное состояние
    fbUser.value = null
    profile.value = null
    ready.value = true

    // Затем выходим из Firebase Auth
    try {
      await signOut(auth)
    } catch (error) {
      // signOut может отдать ошибку в редких случаях (сеть/состояние),
      // но UI выходить должен всегда.
      console.warn('SignOut error (ignored):', error)
    } finally {
      // Сбрасываем флаг выхода через небольшую задержку
      setTimeout(() => {
        loggingOut.value = false
      }, 500)
    }
  }

  const init = async () => {
    if (ready.value) return

    await new Promise<void>((resolve) => {
      onAuthStateChanged(auth, async (u) => {
        // Не обрабатываем изменения состояния если идет процесс выхода
        if (loggingOut.value) {
          resolve()
          return
        }

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
    loggingOut.value = false
    fbUser.value = null
    profile.value = null
    ready.value = true
  }

  return {
    fbUser,
    profile,
    ready,
    loggingOut,
    signIn,
    logout,
    init,
    clear,
  }
})