import { useQuery } from '@tanstack/react-query'
import { calendarApi, appointmentsApi } from '../api/index.ts'
import { DayStrip } from '@muralink/module-calendar/web'
import { AppointmentList } from '@muralink/module-appointments/web'
import { BookingWidget } from '@muralink/module-appointments/web'

function todayRange() {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

function weekRange() {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 7)
  return { from: from.toISOString(), to: to.toISOString() }
}

export function Dashboard() {
  const { from: todayFrom, to: todayTo } = todayRange()
  const { from: weekFrom, to: weekTo } = weekRange()

  const { data: todayEvents = [] } = useQuery({
    queryKey: ['events', 'today'],
    queryFn: () => calendarApi.getEvents(todayFrom, todayTo),
  })

  const { data: weekAppointments = [] } = useQuery({
    queryKey: ['appointments', 'week'],
    queryFn: () => appointmentsApi.getAppointments(weekFrom, weekTo),
  })

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => appointmentsApi.getServices(),
  })

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'auto auto', gap: 16 }}>
        {/* Day strip */}
        <div style={{ gridColumn: '1 / 2', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', height: 320 }}>
          <DayStrip events={todayEvents} />
        </div>

        {/* Upcoming appointments */}
        <div style={{ gridColumn: '2 / 3', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', height: 320 }}>
          <AppointmentList appointments={weekAppointments} />
        </div>

        {/* Quick booking */}
        <div style={{ gridColumn: '3 / 4', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', height: 320 }}>
          <BookingWidget
            services={services}
            onFetchSlots={(serviceId, date) => appointmentsApi.getSlots(serviceId, date)}
          />
        </div>
      </div>
    </div>
  )
}
