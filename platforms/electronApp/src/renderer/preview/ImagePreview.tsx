import { fileUrl } from '@/lib/format'

export function ImagePreview({ path }: { path: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <img src={fileUrl(path)} alt="" className="max-h-full max-w-full object-contain" />
    </div>
  )
}
