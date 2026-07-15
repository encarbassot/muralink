// Folder metadata schema. Each folder can contain a .elio JSON file
// with visualization preferences, grid layout state, and item display types.

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

export const DEFAULT_METADATA: FolderMetadata = {
  version: '1.0',
}

export const METADATA_FILENAME = '.elio'
