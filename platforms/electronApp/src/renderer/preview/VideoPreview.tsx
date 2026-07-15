import { fileUrl } from '@/lib/format'

export function VideoPreview({ path }: { path: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      {/* key forces a reload when switching files */}
      <video key={path} src={fileUrl(path)} controls className="max-h-full max-w-full" />
    </div>
  )
}
