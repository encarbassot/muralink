import { useEffect, useRef, useState } from 'react'
import type { FileElementProps } from '@/types/fileElement'

export function TextNoteElement({ item, selected, onClick, onContextMenu }: FileElementProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const savedRef = useRef(content)

  useEffect(() => {
    setLoading(true)
    window.fsApi.readText(item.id, 50_000).then((result) => {
      if (result.isText) {
        setContent(result.truncated ? result.text + '\n…' : result.text)
      } else {
        setContent(null)
      }
      setLoading(false)
    }).catch(() => {
      setContent(null)
      setLoading(false)
    })
  }, [item.id])

  useEffect(() => {
    savedRef.current = content
  }, [content])

  async function save() {
    if (content === null) return
    await window.fsApi.writeText(item.id, content)
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#fefce8',
        border: `1.5px solid ${selected ? '#ca8a04' : '#d4b94a'}`,
        borderRadius: 8,
        overflow: 'hidden',
        boxSizing: 'border-box',
        cursor: 'default',
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div
        style={{
          padding: '4px 8px',
          fontSize: 9,
          fontWeight: 600,
          color: '#92400e',
          background: '#fef9c3',
          borderBottom: '1px solid #fde68a',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {item.label}
      </div>
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#92400e', fontSize: 10, opacity: 0.5 }}>
          loading…
        </div>
      ) : content === null ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#92400e', fontSize: 10, opacity: 0.5 }}>
          binary file
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => { void save() }}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'monospace',
            fontSize: 10,
            color: '#1c1917',
            padding: '6px 8px',
            lineHeight: 1.5,
          }}
        />
      )}
    </div>
  )
}
