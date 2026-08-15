// Default-approve card for a description update. The AI never shows a diff —
// only the one-line summary it computed. A conic-gradient border sweeps 0→360°
// over 5s as the visual countdown; the authoritative timer lives in chatStore
// (JS setTimeout), so the animation is purely cosmetic and safe to drop on
// engines without @property support.

import { PROPOSAL_TIMEOUT_MS, useChat, type Proposal } from './chatStore.ts'

export function ProposalCard({ proposal }: { proposal: Proposal }) {
  const approve = useChat((s) => s.approveProposal)
  const cancel = useChat((s) => s.cancelProposal)

  return (
    <div
      className="mural-chat-proposal"
      style={{ animationDuration: `${PROPOSAL_TIMEOUT_MS}ms` }}
    >
      <div className="mural-chat-proposal-inner">
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)' }}>
          Actualizar descripción · {proposal.contactName}
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.4 }}>{proposal.summary}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="mural-chat-btn" onClick={() => cancel(proposal.id)}>
            Cancelar
          </button>
          <button className="mural-chat-btn mural-chat-btn-primary" onClick={() => void approve(proposal.id)}>
            Aplicar ahora
          </button>
        </div>
      </div>
    </div>
  )
}

export function AppliedChip() {
  const applied = useChat((s) => s.applied)
  const undo = useChat((s) => s.undoApplied)
  if (!applied) return null
  return (
    <div className="mural-chat-applied">
      <span>Descripción de {applied.contactName} actualizada</span>
      <button className="mural-chat-btn" onClick={() => void undo()}>
        Deshacer
      </button>
    </div>
  )
}
