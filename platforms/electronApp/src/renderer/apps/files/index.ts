import type { AppDescriptor, AppContentProvider, GridItem, NavNode } from '@/types/navigation'
import type { MenuItem } from '@/components/ContextMenu'
import type { ContextMenuHelpers } from '@/types/navigation'
import { useExplorer } from '@/stores/explorerStore'
import { registerCellRenderer } from '@/components/GridItemCell'
import { FolderCell, FileCell } from './cells'
import { fileElementRegistry } from '@/lib/fileElementRegistry'
import { FolderElement } from '@/components/fileElements/FolderElement'
import { DefaultFileElement } from '@/components/fileElements/DefaultFileElement'
import { TextNoteElement } from '@/components/fileElements/TextNoteElement'

let homeDir = ''

export const FilesApp: AppDescriptor = {
  id: 'files',
  name: 'Files',
  icon: '📁',
  get rootNode(): NavNode {
    return {
      id: homeDir || '/Users',
      label: 'Home',
      icon: '🏠',
      appId: 'files',
      parentId: null,
    }
  },
  createProvider: () => new FilesContentProvider(),
}

export async function initFilesApp() {
  if (window.fsApi) {
    homeDir = await window.fsApi.homeDir()
  }
  registerCellRenderer('fs:dir', FolderCell)
  registerCellRenderer('fs:file', FileCell)

  fileElementRegistry.register('fs:dir', { defaultSize: '1x1', label: 'Folder', component: FolderElement })
  fileElementRegistry.register('fs:file', { defaultSize: '1x1', label: 'File icon', component: DefaultFileElement })
  fileElementRegistry.register('fs:file:txt', { defaultSize: '1x1', label: 'Text note', component: TextNoteElement })
}

class FilesContentProvider implements AppContentProvider {
  async getChildren(nodeId: string): Promise<GridItem[]> {
    const entries = await window.fsApi.listDir(nodeId)
    return entries.map((e) => ({
      id: e.path,
      label: e.name,
      icon: e.isDir ? '📁' : '📄',
      contentType: e.isDir ? 'fs:dir' : 'fs:file',
      isNavigable: e.isDir,
      meta: { path: e.path, size: e.size, ext: e.ext, mtimeMs: e.mtimeMs, isDir: e.isDir },
    }))
  }

  resolveNode(item: GridItem): NavNode | null {
    if (!item.isNavigable) return null
    return {
      id: item.id,
      label: item.label,
      icon: '📁',
      appId: 'files',
      parentId: null,
    }
  }

  getContextMenu(item: GridItem, { refresh }: ContextMenuHelpers): MenuItem[] {
    const store = useExplorer.getState()
    const isDir = item.meta?.isDir as boolean
    const path = item.id
    const isPinned = isDir && store.pinnedFolders.includes(path)
    const isStarred = store.starredFolders.includes(path)
    const clipboard = store.clipboard
    const basename = path.split('/').pop() ?? path

    return [
      { label: isDir ? 'Open' : 'Preview', onClick: () => {} },
      { label: 'Rename', onClick: () => {} },
      { label: 'Copy', onClick: () => store.copyToClipboard(path) },
      {
        label: clipboard ? `Paste "${clipboard.path.split('/').pop()}"` : 'Paste',
        disabled: !clipboard,
        onClick: () => { void store.pasteInto(isDir ? path : path.replace(/\/[^/]+$/, '')); refresh() },
      },
      {
        label: isStarred ? 'Unstar' : 'Star',
        onClick: () => isStarred ? store.unstarFolder(path) : store.starFolder(path),
      },
      ...(isDir ? [{
        label: isPinned ? 'Unpin from dock' : 'Pin to dock',
        onClick: () => isPinned ? store.unpinFolder(path) : store.pinFolder(path),
      }] : []),
      {
        label: 'Move to Trash',
        danger: true,
        onClick: () => { void store.trash(path); refresh() },
      },
    ]
  }
}
