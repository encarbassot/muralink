import { createContext, useContext } from 'react'
import type { FieldOption, FieldType } from './types.ts'

// Shared state for every subcomponent of a single InputBar.
// Exposed so consumers can build custom layouts on top of the same engine.
export interface InputContextValue {
  type: FieldType
  value: string
  setValue: (next: string) => void

  // The bottom panel (dropdown list / search results).
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void

  // Options feed both the dropdown type and text-search suggestions.
  options: FieldOption[]
  selectOption: (option: FieldOption) => void

  disabled: boolean
}

const InputContext = createContext<InputContextValue | null>(null)

export function useInputContext(): InputContextValue {
  const ctx = useContext(InputContext)
  if (!ctx) {
    throw new Error('useInputContext must be used inside an <InputBar>')
  }
  return ctx
}

export const InputProvider = InputContext.Provider
