import { ref, onUnmounted, watch } from 'vue'
import { liveQuery } from 'dexie'

/**
 * Vue 3 composable that wraps Dexie's liveQuery for reactive data.
 *
 * @param {Function} queryFn - A function returning a Dexie promise (e.g., () => db.categories.toArray())
 * @param {*} initialValue - Default value before the query resolves (default: [])
 * @returns {{ data: Ref, error: Ref, loading: Ref }}
 */
export function useLiveQuery(queryFn, initialValue = []) {
  const data = ref(initialValue)
  const error = ref(null)
  const loading = ref(true)

  let subscription = null

  function subscribe() {
    // Unsubscribe previous
    if (subscription) {
      subscription.unsubscribe()
    }

    const observable = liveQuery(queryFn)
    subscription = observable.subscribe({
      next: (result) => {
        data.value = result
        loading.value = false
        error.value = null
      },
      error: (err) => {
        console.error('[useLiveQuery] Error:', err)
        error.value = err
        loading.value = false
      },
    })
  }

  subscribe()

  onUnmounted(() => {
    if (subscription) {
      subscription.unsubscribe()
    }
  })

  return { data, error, loading }
}
