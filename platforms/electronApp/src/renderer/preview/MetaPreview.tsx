// Fallback preview — the universal degrade: big icon + name + metadata. Shown
// for unknown file types (and used by PreviewPane as the meta footer source).

import type { StatInfo } from '@/shared/fsApi'
import { iconFor, formatBytes, formatDate } from '@/lib/format'

export function MetaPreview({ info }: { info: StatInfo }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="text-6xl">{iconFor(info.isDir, info.ext)}</span>
      <span className="max-w-full break-words text-[13px]" style={{ color: 'var(--fg)' }}>
        {info.name}
      </span>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--fg-dim)' }}>
        <dt style={{ color: 'var(--fg-faint)' }}>Kind</dt>
        <dd>{info.isDir ? 'Folder' : info.ext ? `.${info.ext}` : 'File'}</dd>
        {!info.isDir && (
          <>
            <dt style={{ color: 'var(--fg-faint)' }}>Size</dt>
            <dd>{formatBytes(info.size)}</dd>
          </>
        )}
        <dt style={{ color: 'var(--fg-faint)' }}>Modified</dt>
        <dd>{formatDate(info.mtimeMs)}</dd>
      </dl>
    </div>
  )
}
