import { fileUrl } from '@/lib/format'
import { basename } from '@/lib/format'

export function AudioPreview({ path }: { path: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
      <span className="text-5xl">🎵</span>
      <span className="max-w-full truncate text-[12px]" style={{ color: 'var(--fg-dim)' }}>
        {basename(path)}
      </span>
      <audio key={path} src={fileUrl(path)} controls />
    </div>
  )
}
