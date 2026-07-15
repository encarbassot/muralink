// The rightmost pane — renders the selected file. Loads stat once, dispatches
// on file kind, and always degrades to MetaPreview for unknown types.

import { useEffect, useState } from 'react'
import type { StatInfo } from '@/shared/fsApi'
import { useExplorer } from '@/stores/explorerStore'
import { fileKind, formatBytes, formatDate } from '@/lib/format'
import { ImagePreview } from '@/preview/ImagePreview'
import { VideoPreview } from '@/preview/VideoPreview'
import { AudioPreview } from '@/preview/AudioPreview'
import { TextEditor, type FileAdapter } from '../../../../../modules/text/implementations/web/TextEditor'
import { MdPreview } from '@/preview/MdPreview'
import { MetaPreview } from '@/preview/MetaPreview'

// FileAdapter for electronApp — uses window.fsApi
const electronFileAdapter: FileAdapter = {
  load: (path) => window.fsApi.readText(path),
  save: (path, content) => {
    // Stub: actual file writing would be implemented in main process
    return Promise.resolve()
  },
}

export function PreviewPane({ path }: { path: string }) {
  const refreshToken = useExplorer((s) => s.refreshToken)
  const [info, setInfo] = useState<StatInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setInfo(null)
    setError(null)
    window.fsApi
      .stat(path)
      .then((i) => alive && setInfo(i))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [path, refreshToken])

  return (
    <div
      className="flex h-full min-w-[360px] flex-1 flex-col"
      style={{ background: 'var(--bg)' }}
    >
      <div className="min-h-0 flex-1">
        {error && (
          <div className="flex h-full items-center justify-center p-4 text-[12px]" style={{ color: 'var(--sync-external-blocked, #d2554e)' }}>
            {error}
          </div>
        )}
        {!error && info && <PreviewBody info={info} />}
      </div>
      {info && !info.isDir && (
        <div
          className="flex items-center justify-between border-t px-3 py-1 text-[11px]"
          style={{ borderColor: 'var(--border)', color: 'var(--fg-faint)' }}
        >
          <span className="truncate">{info.name}</span>
          <span className="shrink-0 pl-3">
            {formatBytes(info.size)} · {formatDate(info.mtimeMs)}
          </span>
        </div>
      )}
    </div>
  )
}

function PreviewBody({ info }: { info: StatInfo }) {
  if (info.isDir) return <MetaPreview info={info} />
  switch (fileKind(info.ext)) {
    case 'image':
      return <ImagePreview path={info.path} />
    case 'video':
      return <VideoPreview path={info.path} />
    case 'audio':
      return <AudioPreview path={info.path} />
    case 'markdown':
      return <MdPreview path={info.path} />
    case 'text':
      return <TextEditor path={info.path} adapter={electronFileAdapter} />
    default:
      return <MetaPreview info={info} />
  }
}
