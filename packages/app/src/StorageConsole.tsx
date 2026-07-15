// Virtual console footer for the file explorer. Shows the current folder (pwd)
// as the prompt and accepts a small set of file commands scoped to the NAS root.
// Commands run against the same storage API the GUI uses and refresh the grid.

import { useRef, useState, type KeyboardEvent } from 'react'
import { storageApi, joinPath, type StorageEntry } from './storageApi.ts'

interface Line { kind: 'cmd' | 'out' | 'err'; text: string }

interface Props {
  cwd: string
  root: string
  entries: StorageEntry[]
  onCd: (path: string) => void
  onChanged: () => void
}

const HELP = 'commands: pwd · ls · cd <dir|..> · mkdir <name> · rm <name> · cp <src> <dst> · mv <src> <dst> · clear · help'

export function StorageConsole({ cwd, root, entries, onCd, onChanged }: Props) {
  const [lines, setLines] = useState<Line[]>([{ kind: 'out', text: HELP }])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const scrollRef = useRef<HTMLDivElement>(null)

  const print = (...ls: Line[]) =>
    setLines((prev) => {
      const next = [...prev, ...ls]
      queueMicrotask(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) })
      return next
    })

  const resolve = (arg: string): string => {
    if (!arg || arg === '.') return cwd
    if (arg === '/' || arg === '~') return root
    if (arg === '..') {
      const up = cwd.split('/').slice(0, -1).join('/')
      return up.length >= root.length ? up : root
    }
    if (arg.startsWith('/')) return arg // absolute (server validates within root)
    return joinPath(cwd, arg)
  }

  async function run(raw: string) {
    const cmd = raw.trim()
    if (!cmd) return
    print({ kind: 'cmd', text: `${prompt(cwd, root)} ${cmd}` })
    setHistory((h) => [...h, cmd])
    setHistIdx(-1)

    const [op, ...args] = cmd.split(/\s+/)
    try {
      switch (op) {
        case 'help': print({ kind: 'out', text: HELP }); break
        case 'clear': setLines([]); break
        case 'pwd': print({ kind: 'out', text: cwd }); break
        case 'ls':
          print({ kind: 'out', text: entries.map((e) => (e.isDir ? e.name + '/' : e.name)).join('  ') || '(empty)' })
          break
        case 'cd': {
          const target = resolve(args[0] ?? '')
          if (args[0] && args[0] !== '..' && args[0] !== '/' && args[0] !== '~') {
            const match = entries.find((e) => e.name === args[0] && e.isDir)
            if (!match) { print({ kind: 'err', text: `cd: not a folder: ${args[0]}` }); break }
            onCd(match.path)
          } else {
            onCd(target)
          }
          break
        }
        case 'mkdir':
          if (!args[0]) { print({ kind: 'err', text: 'mkdir: missing name' }); break }
          await storageApi.mkdir(joinPath(cwd, args[0])); onChanged(); break
        case 'rm':
          if (!args[0]) { print({ kind: 'err', text: 'rm: missing name' }); break }
          await storageApi.remove(resolve(args[0])); onChanged(); break
        case 'cp':
          if (!args[0] || !args[1]) { print({ kind: 'err', text: 'cp: usage cp <src> <dst>' }); break }
          await storageApi.copy(resolve(args[0]), resolve(args[1])); onChanged(); break
        case 'mv':
          if (!args[0] || !args[1]) { print({ kind: 'err', text: 'mv: usage mv <src> <dst>' }); break }
          await storageApi.move(resolve(args[0]), resolve(args[1])); onChanged(); break
        default:
          print({ kind: 'err', text: `unknown command: ${op}` })
      }
    } catch (e) {
      print({ kind: 'err', text: String((e as { message?: string })?.message ?? e) })
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { void run(input); setInput('') }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const i = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1)
      if (history[i] !== undefined) { setHistIdx(i); setInput(history[i]!) }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const i = histIdx < 0 ? -1 : histIdx + 1
      if (i >= history.length || i < 0) { setHistIdx(-1); setInput('') }
      else { setHistIdx(i); setInput(history[i]!) }
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: '#0b0d10', fontFamily: 'ui-monospace, monospace', fontSize: 12, flexShrink: 0 }}>
      <div ref={scrollRef} style={{ maxHeight: 120, overflowY: 'auto', padding: '6px 10px' }}>
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.kind === 'err' ? '#e5786d' : l.kind === 'cmd' ? '#9aa4b2' : '#cfd6e0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {l.text}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderTop: '1px solid var(--border)' }}>
        <span style={{ color: '#6ab0f3', whiteSpace: 'nowrap' }}>{prompt(cwd, root)}</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          autoFocus
          spellCheck={false}
          placeholder="type a command — help"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e6e9ee', fontFamily: 'inherit', fontSize: 12 }}
        />
      </div>
    </div>
  )
}

// pwd prompt relative to root, like `~/sub/dir $`.
function prompt(cwd: string, root: string): string {
  const rel = cwd === root ? '~' : '~' + cwd.slice(root.length)
  return `${rel} $`
}
