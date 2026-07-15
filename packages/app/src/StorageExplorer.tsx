// NAS file manager. Browses the folder this instance hosts (core /api/storage)
// with the SAME grid as the dashboard (one 1x1 cell per entry), plus full file
// control: upload, new folder, delete, rename, copy, cut/paste. A virtual
// console footer mirrors the same operations with the current folder as pwd.

import { useEffect, useMemo, useRef, useState } from 'react'
import { GridCanvas } from '@muralink/ui'
import type { GridCellRecord, GridLayoutConfig } from '@muralink/types'
import { storageApi, joinPath, type ListResponse, type StorageEntry } from './storageApi.ts'
import { StorageConsole } from './StorageConsole.tsx'
import { useAppEnv, capabilitiesFor } from './env.ts'

const COLUMNS = 6
const CELL = 132
const UP = '..'
const UPLOAD = '__upload'

type Clip = { entry: StorageEntry; op: 'copy' | 'cut' } | null

function iconFor(e: StorageEntry): string {
  if (e.isDir) return '📁'
  const ext = e.ext
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️'
  if (['mp4', 'webm', 'mov'].includes(ext)) return '🎞️'
  if (['mp3', 'wav', 'ogg'].includes(ext)) return '🎵'
  if (ext === 'pdf') return '📕'
  if (['zip', 'gz'].includes(ext)) return '🗜️'
  return '📄'
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function parentOf(p: string, root: string): string {
  const up = p.split('/').slice(0, -1).join('/')
  return up.length >= root.length ? up : root
}

const PATH_KEY = 'elio.nas.path'

export function StorageExplorer() {
  // Role gates which controls show. The owner (web/electron) has no role → full
  // access. A relayed guest is limited to its share role. The host enforces the
  // same rule regardless — this is UX, not the security boundary.
  const { role } = useAppEnv()
  const can = useMemo(() => capabilitiesFor(role), [role])

  const [data, setData] = useState<ListResponse | null>(null)
  // Restore the last folder so the explorer reopens on the same page.
  const [path, setPath] = useState<string | undefined>(() => localStorage.getItem(PATH_KEY) ?? undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [clip, setClip] = useState<Clip>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = (p?: string) => {
    setLoading(true)
    setError(null)
    return storageApi
      .list(p)
      .then((d) => { setData(d); setSelected(null) })
      .catch(() => {
        // Saved folder may no longer exist — fall back to root once.
        if (p) { try { localStorage.removeItem(PATH_KEY) } catch { /* ignore */ }; setPath(undefined) }
        else setError('Almacenamiento NAS no disponible — activa el servicio NAS en el orchester.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { void load(path) }, [path])

  // Remember the current folder for next open / reload.
  useEffect(() => {
    try {
      if (path) localStorage.setItem(PATH_KEY, path)
      else localStorage.removeItem(PATH_KEY)
    } catch { /* ignore */ }
  }, [path])

  const cwd = data?.path
  const root = data?.root
  const selectedEntry = useMemo(
    () => data?.entries.find((e) => e.path === selected) ?? null,
    [data, selected],
  )

  // ── operations ────────────────────────────────────────────────────────────
  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn(); await load(path) }
    catch (e) { window.alert(String((e as { message?: string })?.message ?? e)) }
    finally { setBusy(false) }
  }

  const onUpload = async (files: FileList | null) => {
    if (!files || !cwd) return
    await wrap(async () => { for (const f of Array.from(files)) await storageApi.upload(cwd, f) })
  }

  const onNewFolder = () => {
    if (!cwd) return
    const name = window.prompt('Nombre de la carpeta')
    if (name) void wrap(() => storageApi.mkdir(joinPath(cwd, name)))
  }

  const onDelete = (e: StorageEntry) => {
    if (window.confirm(`¿Eliminar "${e.name}"?`)) void wrap(() => storageApi.remove(e.path))
  }

  const onRename = (e: StorageEntry) => {
    const name = window.prompt('Nuevo nombre', e.name)
    if (name && name !== e.name && cwd) void wrap(() => storageApi.move(e.path, joinPath(cwd, name)))
  }

  const onPaste = () => {
    if (!clip || !cwd) return
    const dst = joinPath(cwd, clip.entry.name)
    void wrap(async () => {
      if (clip.op === 'copy') await storageApi.copy(clip.entry.path, dst)
      else await storageApi.move(clip.entry.path, dst)
      setClip(null)
    })
  }

  // ── grid ────────────────────────────────────────────────────────────────
  const { layout, byId } = useMemo(() => {
    const byId = new Map<string, StorageEntry>()
    const items: string[] = can.write ? [UPLOAD] : []
    if (data && data.path !== data.root) items.push(UP)
    for (const e of data?.entries ?? []) { byId.set(e.path, e); items.push(e.path) }

    const cells: GridCellRecord[] = items.map((id, i) => ({
      id,
      moduleId: 'storage-entry',
      viewSpecId: 'storage-entry/1x1',
      size: '1x1',
      position: { col: i % COLUMNS, row: Math.floor(i / COLUMNS) },
    }))

    const layout: GridLayoutConfig = {
      layoutId: 'nas-explorer', platform: 'web', columns: COLUMNS, cellSize: CELL, gap: 12, cells,
    }
    return { layout, byId }
  }, [data, can.write])

  function openEntry(e: StorageEntry) {
    if (e.isDir) setPath(e.path)
    else window.open(storageApi.serveUrl(e.path), '_blank')
  }

  function renderCell(cell: GridCellRecord) {
    if (cell.id === UPLOAD) {
      return <UploadTile disabled={!cwd || busy} onClick={() => fileInput.current?.click()} />
    }
    if (cell.id === UP) {
      return <Tile icon="⬆️" name=".." onOpen={() => data && setPath(parentOf(data.path, data.root))} />
    }
    const entry = byId.get(cell.id)
    if (!entry) return null
    return (
      <Tile
        icon={iconFor(entry)}
        name={entry.name}
        sub={entry.isDir ? 'carpeta' : humanSize(entry.size)}
        selected={selected === entry.path}
        cut={clip?.op === 'cut' && clip.entry.path === entry.path}
        onSelect={() => setSelected(entry.path)}
        onOpen={() => openEntry(entry)}
      />
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        {can.write && <TBtn onClick={() => fileInput.current?.click()} disabled={!cwd || busy}>⬆️ Subir</TBtn>}
        {can.write && <TBtn onClick={onNewFolder} disabled={!cwd || busy}>📁 Nueva carpeta</TBtn>}
        {can.write && <span style={{ width: 1, height: 18, background: 'var(--border)' }} />}
        <TBtn onClick={() => selectedEntry && openEntry(selectedEntry)} disabled={!selectedEntry}>Abrir</TBtn>
        {can.write && <TBtn onClick={() => selectedEntry && onRename(selectedEntry)} disabled={!selectedEntry || busy}>Renombrar</TBtn>}
        {can.write && <TBtn onClick={() => selectedEntry && setClip({ entry: selectedEntry, op: 'copy' })} disabled={!selectedEntry}>Copiar</TBtn>}
        {can.write && <TBtn onClick={() => selectedEntry && setClip({ entry: selectedEntry, op: 'cut' })} disabled={!selectedEntry}>Cortar</TBtn>}
        {can.write && <TBtn onClick={onPaste} disabled={!clip || busy}>Pegar{clip ? ` (${clip.entry.name})` : ''}</TBtn>}
        {can.del && <TBtn onClick={() => selectedEntry && onDelete(selectedEntry)} disabled={!selectedEntry || busy} danger>Eliminar</TBtn>}
        <span style={{ flex: 1 }} />
        {role && <span style={{ fontSize: 11, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{role}</span>}
        <span style={{ fontSize: 11, color: 'var(--fg-faint)', wordBreak: 'break-all' }}>{cwd ?? 'NAS'}</span>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { void onUpload(e.target.files); e.target.value = '' }}
      />

      {/* grid */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
        {loading && <div style={{ color: 'var(--fg-faint)' }}>Cargando…</div>}
        {error && <div style={{ color: 'var(--fg-faint)' }}>{error}</div>}
        {!loading && !error && data && data.entries.length === 0 && data.path === data.root && (
          <div style={{ color: 'var(--fg-faint)' }}>Carpeta vacía — sube archivos o crea una carpeta</div>
        )}
        {!error && data && (
          <GridCanvas
            layout={layout}
            onCellsUpdate={() => { /* read-only layout */ }}
            renderCell={(cell) => renderCell(cell)}
            editMode={false}
            minHeight={160}
          />
        )}
      </div>

      {/* virtual console — mutating commands, so owners/editors only */}
      {can.write && data && cwd && root && (
        <StorageConsole
          cwd={cwd}
          root={root}
          entries={data.entries}
          onCd={(p) => setPath(p)}
          onChanged={() => void load(path)}
        />
      )}
    </div>
  )
}

function TBtn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg-elevated, #1b2026)',
        color: disabled ? 'var(--fg-faint, #6b7280)' : danger ? '#e5786d' : 'var(--fg, #e6e9ee)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}

function UploadTile({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Subir archivos"
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: 8,
        border: '1.5px dashed var(--border-strong, var(--border))',
        borderRadius: 10,
        background: 'color-mix(in srgb, var(--bg-elevated, #1b2026) 35%, transparent)',
        color: disabled ? 'var(--fg-faint, #6b7280)' : 'var(--fg-dim, #9aa4b2)',
        cursor: disabled ? 'default' : 'pointer',
        boxSizing: 'border-box', overflow: 'hidden',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ fontSize: 30, lineHeight: 1 }}>＋</span>
      <span style={{ fontSize: 12 }}>Subir</span>
    </button>
  )
}

function Tile({ icon, name, sub, selected, cut, onSelect, onOpen }: {
  icon: string; name: string; sub?: string; selected?: boolean; cut?: boolean
  onSelect?: () => void; onOpen: () => void
}) {
  return (
    <button
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={`${name} — doble clic para abrir`}
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: 8,
        border: `1px solid ${selected ? 'var(--accent, #4c9fff)' : 'var(--border)'}`,
        borderRadius: 10,
        background: selected ? 'var(--accent-dim, rgba(76,159,255,0.15))' : 'var(--bg-elevated, #1b2026)',
        color: 'var(--fg, #e6e9ee)',
        cursor: 'pointer', boxSizing: 'border-box', overflow: 'hidden',
        opacity: cut ? 0.5 : 1,
      }}
    >
      <span style={{ fontSize: 34, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 12, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      {sub ? <span style={{ fontSize: 10, color: 'var(--fg-faint, #6b7280)' }}>{sub}</span> : null}
    </button>
  )
}
