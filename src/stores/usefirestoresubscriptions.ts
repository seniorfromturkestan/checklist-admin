import { onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { Unsubscribe } from 'firebase/firestore'

/**
 * Композабл для безопасной работы с Firestore подписками
 * Автоматически отменяет подписки при размонтировании компонента
 */
export function useFirestoreSubscriptions() {
  const authStore = useAuthStore()
  const subscriptions: Unsubscribe[] = []

  /**
   * Регистрирует подписку для автоматической отмены
   */
  const register = (unsubscribe: Unsubscribe) => {
    subscriptions.push(unsubscribe)
    return unsubscribe
  }

  /**
   * Проверяет, безопасно ли работать с Firestore
   */
  const isSafe = () => {
    return !authStore.loggingOut && authStore.profile !== null
  }

  /**
   * Отменяет все зарегистрированные подписки
   */
  const unsubscribeAll = () => {
    subscriptions.forEach(unsub => {
      try {
        unsub()
      } catch (error) {
        console.warn('Error unsubscribing:', error)
      }
    })
    subscriptions.length = 0
  }

  // Автоматически отменяем все подписки при размонтировании компонента
  onBeforeUnmount(() => {
    unsubscribeAll()
  })

  return {
    register,
    isSafe,
    unsubscribeAll,
  }
}