// A file element rendered as a card: icon, name, size — images preview inline.
// Markdown cards EXPAND IN PLACE (collapsible) showing the shared edit-in-place
// editor without ever leaving the mural; everything else opens in a new tab
// through the host's tokenized serve URL.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MuralFileRef } from '../../../types.ts'
import { getMuralStorage } from '../storage.ts'
import { MarkdownFileEditor } from './MarkdownFileEditor.tsx'

async function downloadFile(url: string, name: string): Promise<void> {
  // Fetch → blob → anchor: forces a real download regardless of the server's
  // inline Content-Disposition, and works with tokenized URLs.
  const blob = await (await fetch(url)).blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
  URL.revokeObjectURL(href)
}

async function copyContent(url: string): Promise<void> {
  const text = await (await fetch(url)).text()
  await navigator.clipboard.writeText(text)
}

// Copy/download affordances shared by the card header and the modal header.
function FileActions({ url, file, isText }: { url: string; file: MuralFileRef; isText: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <>
      {isText && (
        <button
          className="mural-tool-btn"
          title={copied ? 'Copiado' : 'Copiar contenido'}
          onClick={(e) => {
            e.stopPropagation()
            void copyContent(url).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? '✅' : '📋'}
        </button>
      )}
      <button
        className="mural-tool-btn"
        title="Descargar"
        onClick={(e) => { e.stopPropagation(); void downloadFile(url, file.name) }}
      >
        ⬇
      </button>
    </>
  )
}

// Focused modal over the mural: backdrop + centered panel with the same
// inline editor. Esc or ✕ (or clicking the backdrop) returns to the mural.
function MarkdownModal({ file, onClose }: { file: MuralFileRef; onClose: () => void }) {
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved')
  const url = getMuralStorage()?.serveUrl(file.path)

  // Capture-phase: the app panel / mural also listen for Escape on window.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onClose])

  return createPortal(
    <div
      // React events bubble through the REACT tree, portal or not — keep any
      // click in here away from the FileCard's onClick.
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 950,
        background: 'color-mix(in srgb, var(--bg) 60%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(900px, 94vw)',
          height: 'min(80vh, 900px)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow, 0 12px 48px rgba(0,0,0,0.5))',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 14 }}>📄</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {file.name}
          </span>
          {saveState !== 'saved' && (
            <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
              {saveState === 'saving' ? 'guardando…' : 'sin guardar'}
            </span>
          )}
          {url && <FileActions url={url} file={file} isText />}
          <button className="mural-tool-btn" title="Cerrar (Esc)" onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <MarkdownFileEditor file={file} saveStateChanged={setSaveState} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'])

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

function iconFor(name: string): string {
  const ext = extOf(name)
  if (IMAGE_EXT.has(ext)) return '🖼️'
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return '🎬'
  if (['mp3', 'wav', 'flac', 'm4a', 'ogg'].includes(ext)) return '🎵'
  if (['pdf'].includes(ext)) return '📕'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️'
  if (['doc', 'docx', 'odt', 'txt', 'md'].includes(ext)) return '📄'
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return '📊'
  return '📎'
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes
  let u = -1
  do {
    v /= 1024
    u++
  } while (v >= 1024 && u < units.length - 1)
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`
}

export function FileCard({ file }: { file: MuralFileRef }) {
  const storage = getMuralStorage()
  const url = storage?.serveUrl(file.path)
  const isImage = IMAGE_EXT.has(extOf(file.name))
  const isMarkdown = ['md', 'markdown'].includes(extOf(file.name))
  const [expanded, setExpanded] = useState(false)
  const [modal, setModal] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved')

  return (
    <div
      className="mural-file-card"
      onClick={() => {
        if (!url || expanded) return
        if (isMarkdown) setExpanded(true)
        else window.open(url, '_blank', 'noopener')
      }}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 10px)',
        background: 'var(--bg-elevated)',
        overflow: 'hidden',
        cursor: url && !expanded ? 'pointer' : 'default',
      }}
    >
      {isImage && url && (
        <img
          src={url}
          alt={file.name}
          style={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'cover' }}
          loading="lazy"
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{iconFor(file.name)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {file.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
            {humanSize(file.size)}
            {!storage && ' · sin conexión con el servidor'}
            {expanded && saveState !== 'saved' && ` · ${saveState === 'saving' ? 'guardando…' : 'sin guardar'}`}
          </div>
        </div>
        {isMarkdown && url && (
          <>
            <button
              className="mural-tool-btn"
              title={expanded ? 'Contraer' : 'Abrir editor'}
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            >
              {expanded ? '⌃' : '⌄'}
            </button>
            <button
              className="mural-tool-btn"
              title="Abrir en modal"
              onClick={(e) => { e.stopPropagation(); setModal(true) }}
            >
              ⛶
            </button>
          </>
        )}
        {url && <FileActions url={url} file={file} isText={isMarkdown || extOf(file.name) === 'txt'} />}
      </div>
      {expanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ borderTop: '1px solid var(--border)', maxHeight: '55vh', overflow: 'auto' }}
        >
          <MarkdownFileEditor file={file} saveStateChanged={setSaveState} />
        </div>
      )}
      {modal && <MarkdownModal file={file} onClose={() => setModal(false)} />}
    </div>
  )
}
