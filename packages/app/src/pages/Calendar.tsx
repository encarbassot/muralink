import { useEffect, useState } from 'react'
import { WeekApp, registerProvider, makeApiProvider } from '@muralink/module-calendar/web'
import { API_ORIGIN, API_TOKEN } from '../api/client.ts'

// The calendar is self-contained (its own unified multi-target store). The app's
// only job is to inject the `api` storage target using the platform's configured
// base URL + token — the module never imports our axios client, staying
// stack-agnostic. `local` is always registered by the module itself.
let apiRegistered = false

export function Calendar() {
  const [ready, setReady] = useState(apiRegistered)

  useEffect(() => {
    if (!apiRegistered) {
      registerProvider(makeApiProvider({ baseUrl: API_ORIGIN, token: API_TOKEN, label: 'Servidor' }))
      apiRegistered = true
    }
    setReady(true)
  }, [])

  if (!ready) return null
  // The week is the main screen — mobile-format 7-column grid.
  return <WeekApp />
}

// Bento cell variant reuses the same week surface at grid scale.
export function CalendarGridCell() {
  return <Calendar />
}
