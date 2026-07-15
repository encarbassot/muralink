// Small pure helpers shared by the renderer. No fs, no IPC.

export type FileKind = 'image' | 'video' | 'audio' | 'text' | 'markdown' | 'other'

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'])
const VIDEO = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'ogv'])
const AUDIO = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac'])
const MARKDOWN = new Set(['md', 'markdown'])
const TEXT = new Set([
  'txt', 'json', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css', 'scss',
  'html', 'htm', 'xml', 'yml', 'yaml', 'csv', 'tsv', 'log', 'sh', 'zsh', 'bash', 'py', 'rb',
  'rs', 'go', 'java', 'kt', 'c', 'cc', 'cpp', 'h', 'hpp', 'conf', 'ini', 'toml', 'env', 'sql',
  'gitignore', 'lock',
])

export function fileKind(ext: string): FileKind {
  const e = ext.toLowerCase()
  if (IMAGE.has(e)) return 'image'
  if (VIDEO.has(e)) return 'video'
  if (AUDIO.has(e)) return 'audio'
  if (MARKDOWN.has(e)) return 'markdown'
  if (TEXT.has(e)) return 'text'
  return 'other'
}

export function iconFor(isDir: boolean, ext: string): string {
  if (isDir) return '📁'
  switch (fileKind(ext)) {
    case 'image':
      return '🖼️'
    case 'video':
      return '🎞️'
    case 'audio':
      return '🎵'
    case 'text':
      return '📄'
    default:
      return '📦'
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

export function formatDate(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** file:// URL for loading local media in <img>/<video>. Encodes each segment. */
export function fileUrl(path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `file://${encoded}`
}

export function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}
