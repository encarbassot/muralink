// Metadata service: read/write .elio JSON files for folder preferences.
// All ops respect safe path boundaries (home directory).

import { join } from 'node:path'
import { homedir } from 'node:os'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, normalize, sep } from 'node:path'

const METADATA_FILENAME = '.elio'

export interface GridItemLayout {
  x: number
  y: number
  width: number
  height: number
}

export interface ItemVisualization {
  type: 'icon' | 'preview'
}

export interface FolderMetadata {
  version: string
  folderTitle?: string
  gridLayout?: Record<string, GridItemLayout>
  itemVisualizations?: Record<string, ItemVisualization>
}

const DEFAULT_METADATA: FolderMetadata = {
  version: '1.0',
}

const HOME = homedir()

function safePath(p: string): string | null {
  try {
    const abs = resolve(normalize(p))
    const ok = abs === HOME || abs.startsWith(HOME + sep)
    return ok ? abs : null
  } catch {
    return null
  }
}

export async function readMetadata(folderPath: string): Promise<FolderMetadata | null> {
  const safe = safePath(folderPath)
  if (!safe) return null

  const metaFile = join(safe, METADATA_FILENAME)
  if (!existsSync(metaFile)) return null

  try {
    const content = await readFile(metaFile, 'utf-8')
    const parsed = JSON.parse(content)
    return parsed as FolderMetadata
  } catch {
    return null
  }
}

export async function writeMetadata(folderPath: string, metadata: FolderMetadata): Promise<void> {
  const safe = safePath(folderPath)
  if (!safe) throw new Error('unsafe path')

  const metaFile = join(safe, METADATA_FILENAME)
  const content = JSON.stringify(metadata, null, 2)
  await writeFile(metaFile, content, 'utf-8')
}

export async function updateFolderTitle(folderPath: string, title: string): Promise<void> {
  const meta = (await readMetadata(folderPath)) || DEFAULT_METADATA
  meta.folderTitle = title
  await writeMetadata(folderPath, meta)
}

export async function updateGridItem(
  folderPath: string,
  itemPath: string,
  layout: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const meta = (await readMetadata(folderPath)) || DEFAULT_METADATA
  if (!meta.gridLayout) meta.gridLayout = {}
  meta.gridLayout[itemPath] = layout
  await writeMetadata(folderPath, meta)
}

export async function updateItemVisualization(
  folderPath: string,
  itemPath: string,
  type: 'icon' | 'preview',
): Promise<void> {
  const meta = (await readMetadata(folderPath)) || DEFAULT_METADATA
  if (!meta.itemVisualizations) meta.itemVisualizations = {}
  meta.itemVisualizations[itemPath] = { type }
  await writeMetadata(folderPath, meta)
}
