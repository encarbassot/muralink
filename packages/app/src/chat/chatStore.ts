// Chat assistant state — the floating bubble, message history, streaming
// status and the description-update proposals with their 5s default-approve
// timers. viewStore.ts is the store-style reference.

import { create } from 'zustand'
import type { AiMessage } from '@muralink/ai'
import { useContacts } from '@muralink/module-contacts/web'
import { fetchAiStatus, type AiStatus } from './aiApi.ts'
import { runTurn } from './agentLoop.ts'
import type { ProposalRequest } from './tools.ts'

export const PROPOSAL_TIMEOUT_MS = 5000
const UNDO_WINDOW_MS = 30000

export type ChatMsg = AiMessage & { hidden?: boolean }

export interface Proposal extends ProposalRequest {
  id: string
  /** Epoch ms when the card auto-applies unless cancelled. */
  expiresAt: number
}

export interface AppliedChange {
  contactId: string
  contactName: string
  prevDescription: string
  expiresAt: number
}

interface ChatState {
  open: boolean
  /** null = not probed yet; false = no AI backend → bubble hidden. */
  available: boolean | null
  status: AiStatus | null
  messages: ChatMsg[]
  busy: 'idle' | 'streaming' | 'tool'
  currentTool?: string
  proposals: Proposal[]
  /** Last auto/manually applied description change — powers the undo chip. */
  applied: AppliedChange | null
  probe: () => Promise<void>
  toggle: () => void
  send: (text: string) => Promise<void>
  cancelStream: () => void
  approveProposal: (id: string) => Promise<void>
  cancelProposal: (id: string) => void
  undoApplied: () => Promise<void>
  clear: () => void
}

let abortCtrl: AbortController | null = null
const proposalTimers = new Map<string, ReturnType<typeof setTimeout>>()
let proposalSeq = 0

export const useChat = create<ChatState>((set, get) => ({
  open: false,
  available: null,
  status: null,
  messages: [],
  busy: 'idle',
  proposals: [],
  applied: null,

  async probe() {
    const status = await fetchAiStatus()
    set({ status, available: Boolean(status?.available) })
  },

  toggle() {
    set((s) => ({ open: !s.open }))
  },

  async send(text) {
    const trimmed = text.trim()
    if (!trimmed || get().busy !== 'idle') return

    abortCtrl?.abort()
    abortCtrl = new AbortController()
    const signal = abortCtrl.signal

    const userMsg: ChatMsg = { role: 'user', content: trimmed }
    // Streaming assistant placeholder — tokens append to the LAST assistant msg.
    set((s) => ({
      messages: [...s.messages, userMsg, { role: 'assistant', content: '' }],
      busy: 'streaming',
      currentTool: undefined,
    }))

    const history = get()
      .messages.slice(0, -1) // exclude the placeholder
      .map(({ hidden: _h, ...m }) => m as AiMessage)

    const appendToLastAssistant = (t: string) =>
      set((s) => {
        const msgs = [...s.messages]
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i]!.role === 'assistant') {
            msgs[i] = { ...msgs[i]!, content: msgs[i]!.content + t }
            break
          }
        }
        return { messages: msgs, busy: 'streaming' }
      })

    const turn = await runTurn(
      history,
      {
        propose: (p) => {
          const id = `prop-${++proposalSeq}`
          const proposal: Proposal = { ...p, id, expiresAt: Date.now() + PROPOSAL_TIMEOUT_MS }
          set((s) => ({ proposals: [...s.proposals, proposal] }))
          // Default-approve: the JS timer is authoritative; the border
          // animation on the card is the visual countdown.
          proposalTimers.set(
            id,
            setTimeout(() => void get().approveProposal(id), PROPOSAL_TIMEOUT_MS),
          )
        },
      },
      {
        onToken: appendToLastAssistant,
        onAssistantStart: () =>
          set((s) => ({ messages: [...s.messages, { role: 'assistant', content: '' }], busy: 'streaming', currentTool: undefined })),
        onToolStart: (name) => set({ busy: 'tool', currentTool: name }),
        onError: (error) =>
          set((s) => ({
            messages: [...s.messages, { role: 'assistant', content: `⚠️ ${error}` }],
          })),
      },
      signal,
    )

    // Replace the streamed placeholders with the canonical turn messages so
    // history carries toolCalls/tool results for the next request.
    set((s) => {
      const base = s.messages.slice(0, s.messages.length)
      // Drop trailing assistant placeholders added during this turn…
      let firstPlaceholder = base.length
      for (let i = base.length - 1; i >= 0; i--) {
        if (base[i] === userMsg) {
          firstPlaceholder = i + 1
          break
        }
      }
      const canonical = turn.map((m) => m as ChatMsg)
      return { messages: [...base.slice(0, firstPlaceholder), ...canonical], busy: 'idle', currentTool: undefined }
    })
  },

  cancelStream() {
    abortCtrl?.abort()
    set({ busy: 'idle', currentTool: undefined })
  },

  async approveProposal(id) {
    const proposal = get().proposals.find((p) => p.id === id)
    if (!proposal) return
    const timer = proposalTimers.get(id)
    if (timer) clearTimeout(timer)
    proposalTimers.delete(id)
    await useContacts.getState().update(proposal.contactId, { description: proposal.newDescription })
    set((s) => ({
      proposals: s.proposals.filter((p) => p.id !== id),
      applied: {
        contactId: proposal.contactId,
        contactName: proposal.contactName,
        prevDescription: proposal.prevDescription,
        expiresAt: Date.now() + UNDO_WINDOW_MS,
      },
    }))
    setTimeout(() => {
      set((s) => (s.applied && s.applied.expiresAt <= Date.now() ? { applied: null } : {}))
    }, UNDO_WINDOW_MS + 100)
  },

  cancelProposal(id) {
    const proposal = get().proposals.find((p) => p.id === id)
    const timer = proposalTimers.get(id)
    if (timer) clearTimeout(timer)
    proposalTimers.delete(id)
    set((s) => ({
      proposals: s.proposals.filter((p) => p.id !== id),
      // Hidden note so the model knows the proposal was rejected.
      messages: proposal
        ? [
            ...s.messages,
            {
              role: 'user',
              content: `[El usuario canceló la propuesta de descripción para ${proposal.contactName}: "${proposal.summary}". No la vuelvas a aplicar salvo que te lo pida.]`,
              hidden: true,
            },
          ]
        : s.messages,
    }))
  },

  async undoApplied() {
    const applied = get().applied
    if (!applied) return
    await useContacts.getState().update(applied.contactId, { description: applied.prevDescription })
    set({ applied: null })
  },

  clear() {
    abortCtrl?.abort()
    for (const t of proposalTimers.values()) clearTimeout(t)
    proposalTimers.clear()
    set({ messages: [], proposals: [], busy: 'idle', currentTool: undefined })
  },
}))
