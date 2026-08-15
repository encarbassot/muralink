import { useState } from 'react'
import type { YVacationRequest, VacationRequestStatus, VacationRequestKind } from '../../../types.ts'

interface Props {
  requests?: YVacationRequest[]
  /** True when the viewer may approve/reject (server also enforces this). */
  isManager?: boolean
  employeeName?: (id: string) => string
  onRequest?: (req: { kind: VacationRequestKind; start: string; end: string; reason?: string }) => void
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}

const STATUS_LABELS: Record<VacationRequestStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
}

const STATUS_COLORS: Record<VacationRequestStatus, string> = {
  pending: '#b5936a',
  approved: '#4caf50',
  rejected: '#e53935',
  cancelled: '#9e9e9e',
}

const KIND_LABELS: Record<VacationRequestKind, string> = {
  vacation: 'Vacaciones',
  sick: 'Baja médica',
  personal: 'Asunto propio',
  other: 'Otro',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export function VacationRequests({ requests = [], isManager = false, employeeName, onRequest, onApprove, onReject }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [kind, setKind] = useState<VacationRequestKind>('vacation')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')

  function submit() {
    if (!start || !end) return
    onRequest?.({ kind, start, end, reason: reason || undefined })
    setShowForm(false)
    setStart(''); setEnd(''); setReason('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Vacaciones</span>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--accent, #b5936a)', background: 'transparent', color: 'var(--accent, #b5936a)', cursor: 'pointer' }}
        >
          {showForm ? 'Cancelar' : '＋ Solicitar'}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid var(--border, #d4cfc9)' }}>
          <select value={kind} onChange={(e) => setKind(e.target.value as VacationRequestKind)} style={{ fontSize: 12 }}>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ fontSize: 12, flex: 1 }} />
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={{ fontSize: 12, flex: 1 }} />
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (opcional)"
            style={{ fontSize: 12, border: '1px solid var(--border, #d4cfc9)', borderRadius: 4, padding: '4px 6px' }}
          />
          <button
            onClick={submit}
            style={{ fontSize: 12, padding: '5px 0', borderRadius: 6, border: 'none', background: 'var(--accent, #b5936a)', color: '#fff', cursor: 'pointer' }}
          >
            Enviar solicitud
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {requests.length === 0 && (
          <div style={{ padding: 16, color: 'var(--muted-foreground, #6b6560)', fontSize: 13 }}>Sin solicitudes</div>
        )}
        {requests.map((req) => (
          <div key={req.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #d4cfc9)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {employeeName ? employeeName(req.employeeId) : req.employeeId} · {KIND_LABELS[req.kind]}
              </span>
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 99,
                background: STATUS_COLORS[req.status] + '22', color: STATUS_COLORS[req.status], fontWeight: 600,
              }}>
                {STATUS_LABELS[req.status]}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground, #6b6560)' }}>
              {formatDate(req.start.iso)} – {formatDate(req.end.iso)}
            </div>
            {req.reason && <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)' }}>{req.reason}</div>}
            {isManager && req.status === 'pending' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button
                  onClick={() => onApprove?.(req.id)}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', background: '#4caf50', color: '#fff', cursor: 'pointer' }}
                >
                  Aprobar
                </button>
                <button
                  onClick={() => onReject?.(req.id)}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', background: '#e53935', color: '#fff', cursor: 'pointer' }}
                >
                  Rechazar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
