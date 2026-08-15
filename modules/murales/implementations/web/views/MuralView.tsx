// One mural: title + the hybrid document/grid canvas. Edits mutate a local
// draft synchronously (snappy drag/typing) and persist debounced to the
// mural's storage space.

import { useEffect, useRef, useState } from 'react'
import { listSpaces } from '@muralink/spaces'
import type { YMural } from '../../../types.ts'
import { MuralCanvas } from '../engine/MuralCanvas.tsx'
import { MuralCanvasView } from '../engine/MuralCanvasView.tsx'
import { MuralSurface } from '../engine/mural/MuralSurface.tsx'
import { SharePanel } from '../components/SharePanel.tsx'
import { makeFileElement, randomMuralEmoji, useMurales } from '../muralesStore.ts'
import { getMuralSharing } from '../sharing.ts'
import { getMuralStorage } from '../storage.ts'

const SAVE_DELAY = 400

// The three ways of looking at ONE mural. The murals list (MuralesApp) is the
// level above — not a peer tab. Tab id 'canvas' is persisted in localStorage —
// keep the id, only the label changed to Mind-map.
export type MuralTab = 'doc' | 'mural' | 'canvas'

const TABS: { id: MuralTab; icon: string; label: string }[] = [
  { id: 'doc', icon: '📄', label: 'Documento' },
  { id: 'mural', icon: '🧱', label: 'Mural' },
  { id: 'canvas', icon: '◯', label: 'Mind-map' },
]

function loadTab(muralId: string): MuralTab {
  const v = localStorage.getItem(`murales:tab:${muralId}`)
  return v === 'canvas' || v === 'mural' ? v : 'doc'
}

interface Props {
  muralId: string
  onBack?: () => void
  /** Open another mural (from an embedded mural-ref). */
  onOpenMural?: (muralId: string) => void
}

export function MuralView({ muralId, onBack, onOpenMural }: Props) {
  const stored = useMurales((s) => s.murales.find((m) => m.id === muralId))
  const update = useMurales((s) => s.update)
  const remove = useMurales((s) => s.remove)
  const moveMural = useMurales((s) => s.moveMural)
  const spaces = listSpaces('murales').filter((sp) => !sp.readonly)

  const [draft, setDraft] = useState<YMural | undefined>(stored)
  const [pending, setPending] = useState<{ id: string; name: string }[]>([])
  const [tab, setTabState] = useState<MuralTab>(() => loadTab(muralId))
  const [sharePanel, setSharePanel] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function setTab(next: MuralTab) {
    setTabState(next)
    localStorage.setItem(`murales:tab:${muralId}`, next)
  }

  useEffect(() => {
    setTabState(loadTab(muralId))
  }, [muralId])

  // Re-seed the draft when switching murals or when the space changes under us.
  useEffect(() => {
    setDraft(stored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muralId, stored?.spaceId])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  if (!draft) return null

  function apply(patch: Partial<YMural>) {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setDraft((d) => {
        if (d) void update(muralId, { title: d.title, emoji: d.emoji, elements: d.elements, arrows: d.arrows, grid: d.grid, public: d.public })
        return d
      })
    }, SAVE_DELAY)
  }

  const storage = getMuralStorage()

  // Takes a materialized File[] — a live FileList would be emptied by the
  // input's value reset before this async body iterates it. Each file shows an
  // instant placeholder card with a spinner (≥1s) that becomes the real card.
  async function handleFiles(files: File[]) {
    if (files.length === 0 || !storage) return
    const dir = `murales/${muralId}`
    try {
      await storage.mkdir(dir)
    } catch {
      // Already exists — fine.
    }
    for (const file of files) {
      const pid = `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setPending((p) => [...p, { id: pid, name: file.name }])
      const started = Date.now()
      try {
        const result = await storage.uploadResumable(dir, file, {})
        // Keep the spinner visible at least 1s so the feedback reads.
        await new Promise((r) => setTimeout(r, Math.max(0, 1000 - (Date.now() - started))))
        setDraft((d) => {
          if (!d) return d
          const el = makeFileElement(
            { path: result.path, name: file.name, size: file.size, mime: file.type || undefined },
            undefined,
            d.elements.filter((e) => e.parentId === undefined),
          )
          const next: YMural = { ...d, elements: [...d.elements, el] }
          void update(muralId, { elements: next.elements })
          return next
        })
      } catch (err) {
        console.error('mural upload failed', err)
        const status = (err as { response?: { status?: number } })?.response?.status
        alert(status === 413
          ? 'Sin espacio: has alcanzado tu límite de almacenamiento.'
          : `No se pudo subir «${file.name}». ¿Está el servidor conectado?`)
      } finally {
        setPending((p) => p.filter((x) => x.id !== pid))
      }
    }
  }

  const grid = draft.grid

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header: back, title, grid controls, space, delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {onBack && (
          <button className="mural-tool-btn" onClick={onBack} title="Volver a murales">←</button>
        )}
        <button
          className="mural-tool-btn"
          title="Cambiar emoji"
          style={{ fontSize: 15 }}
          onClick={() => apply({ emoji: randomMuralEmoji() })}
        >
          {draft.emoji ?? '🧱'}
        </button>
        <input
          value={draft.title}
          onChange={(e) => apply({ title: e.target.value })}
          placeholder="Nuevo mural"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', fontSize: 16, fontWeight: 700 }}
        />
        <button
          className="mural-tool-btn"
          title={draft.public
            ? 'Mural público — cualquiera con el enlace puede verlo sin iniciar sesión'
            : 'Mural privado — al compartirlo, solo cuentas validadas podrán verlo'}
          onClick={() => apply({ public: !draft.public })}
        >
          {draft.public ? '🌐' : '🔐'}
        </button>
        {tab === 'doc' && (
          <>
            <button
              className="mural-tool-btn"
              title={grid.locked ? 'Cuadrícula bloqueada (5 columnas) — pulsar para desbloquear' : 'Cuadrícula libre — pulsar para bloquear'}
              onClick={() => apply({ grid: { ...grid, locked: !grid.locked } })}
            >
              {grid.locked ? '🔒' : '🔓'}
            </button>
            {!grid.locked && (
              <>
                <button className="mural-tool-btn" title="Añadir columna a la izquierda" onClick={() => apply({ grid: { ...grid, extendLeft: grid.extendLeft + 1 } })}>+←</button>
                <button className="mural-tool-btn" title="Añadir columna a la derecha" onClick={() => apply({ grid: { ...grid, extendRight: grid.extendRight + 1 } })}>→+</button>
                <button className="mural-tool-btn" title="Añadir fila arriba" onClick={() => apply({ grid: { ...grid, extendUp: grid.extendUp + 1 } })}>+↑</button>
              </>
            )}
          </>
        )}
        {getMuralSharing() && (
          <button className="mural-tool-btn" title="Compartir" onClick={() => setSharePanel(true)}>📤</button>
        )}
        {spaces.length > 1 && (
          <select
            value={draft.spaceId ?? 'local'}
            onChange={(e) => void moveMural(muralId, e.target.value)}
            title="Dónde se guarda este mural"
            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 11, background: 'var(--bg-elevated)', color: 'var(--fg-dim)', maxWidth: 130 }}
          >
            {spaces.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.label}</option>
            ))}
          </select>
        )}
        <button
          className="mural-tool-btn danger"
          title="Eliminar mural"
          onClick={() => {
            if (confirm(`¿Eliminar «${draft.title}»?`)) {
              void remove(muralId)
              onBack?.()
            }
          }}
        >
          🗑️
        </button>
      </div>

      {/* View tabs */}
      <div className="mural-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`mural-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Active view */}
      {tab === 'doc' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
          <MuralCanvas
            mural={draft}
            onChange={apply}
            onAddFile={storage ? () => fileInputRef.current?.click() : undefined}
            pendingFiles={pending}
          />
        </div>
      )}
      {tab === 'mural' && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <MuralSurface mural={draft} onChange={apply} onOpenMural={onOpenMural} />
        </div>
      )}
      {tab === 'canvas' && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <MuralCanvasView mural={draft} onChange={apply} onOpenMural={onOpenMural} />
        </div>
      )}

      {sharePanel && <SharePanel muralId={muralId} onClose={() => setSharePanel(false)} />}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          void handleFiles(e.target.files ? Array.from(e.target.files) : [])
          e.target.value = ''
        }}
      />
    </div>
  )
}
