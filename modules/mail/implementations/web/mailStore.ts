import { create } from 'zustand'
import type { YEmailMessage, YMailFolder } from '../../types.ts'

interface MailStore {
  folders: YMailFolder[]
  messages: YEmailMessage[]
  currentFolderId: string | null
  currentMessageId: string | null
  loading: boolean
  error: string | null

  setFolders: (folders: YMailFolder[]) => void
  setMessages: (messages: YEmailMessage[]) => void
  setCurrentFolder: (folderId: string) => void
  setCurrentMessage: (messageId: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useMailStore = create<MailStore>(set => ({
  folders: [],
  messages: [],
  currentFolderId: null,
  currentMessageId: null,
  loading: false,
  error: null,

  setFolders: folders => set({ folders }),
  setMessages: messages => set({ messages }),
  setCurrentFolder: folderId => set({ currentFolderId: folderId, currentMessageId: null }),
  setCurrentMessage: messageId => set({ currentMessageId: messageId }),
  setLoading: loading => set({ loading }),
  setError: error => set({ error }),
}))
