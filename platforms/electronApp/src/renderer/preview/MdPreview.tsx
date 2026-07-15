// MdPreview — render markdown files with basic formatting.

import { useEffect, useState } from 'react'
import { basename } from '@/lib/format'

interface MdPreviewProps {
  path: string
}

export function MdPreview({ path }: MdPreviewProps) {
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.fsApi
      .readText(path)
      .then((result) => {
        if (alive) {
          if (result.isText) setContent(result.text)
          else setError('File is not text')
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [path])

  if (error) {
    return (
      <div style={{ padding: 16, color: 'var(--sync-external-blocked, #d2554e)', fontSize: 12 }}>
        Error: {error}
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: 'var(--bg)', color: 'var(--fg)' }}
    >
      {/* Header */}
      <div
        className="shrink-0 border-b px-3 py-2"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-bar)' }}
      >
        <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{basename(path)}</div>
      </div>

      {/* Content */}
      <div
        className="min-h-0 flex-1 overflow-auto p-4"
        style={{ fontSize: 13, lineHeight: 1.6 }}
      >
        <MarkdownRenderer content={content} />
      </div>
    </div>
  )
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Headings
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} style={{ fontSize: 24, fontWeight: 'bold', margin: '12px 0 8px' }}>
          {line.slice(2)}
        </h1>,
      )
      i++
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} style={{ fontSize: 20, fontWeight: 'bold', margin: '10px 0 6px' }}>
          {line.slice(3)}
        </h2>,
      )
      i++
      continue
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} style={{ fontSize: 16, fontWeight: 'bold', margin: '8px 0 4px' }}>
          {line.slice(4)}
        </h3>,
      )
      i++
      continue
    }

    // Code blocks
    if (line.startsWith('```')) {
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      elements.push(
        <pre
          key={i}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: 12,
            margin: '8px 0',
            overflow: 'auto',
            fontSize: 11,
            fontFamily: 'monospace',
            color: 'var(--fg-dim)',
          }}
        >
          {codeLines.join('\n')}
        </pre>,
      )
      continue
    }

    // Lists
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const listItems = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        listItems.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={i} style={{ margin: '8px 0', paddingLeft: 20 }}>
          {listItems.map((item, idx) => (
            <li key={idx} style={{ margin: '4px 0' }}>
              {item}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    // Inline code
    if (line.includes('`')) {
      const parts = line.split('`')
      const rendered: React.ReactNode[] = []
      for (let j = 0; j < parts.length; j++) {
        if (j % 2 === 1) {
          rendered.push(
            <code
              key={j}
              style={{
                background: 'var(--bg-elevated)',
                padding: '2px 4px',
                borderRadius: 2,
                fontFamily: 'monospace',
                fontSize: 12,
                color: 'var(--fg-dim)',
              }}
            >
              {parts[j]}
            </code>,
          )
        } else {
          rendered.push(parts[j])
        }
      }
      elements.push(
        <p key={i} style={{ margin: '4px 0' }}>
          {rendered}
        </p>,
      )
      i++
      continue
    }

    // Empty lines
    if (!line.trim()) {
      elements.push(<div key={i} style={{ height: 4 }} />)
      i++
      continue
    }

    // Paragraphs
    elements.push(
      <p key={i} style={{ margin: '4px 0' }}>
        {line}
      </p>,
    )
    i++
  }

  return <div>{elements}</div>
}
