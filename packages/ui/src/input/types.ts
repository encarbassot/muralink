import type React from 'react'

// Every data-field kind the central element can hold.
// Future: 'country', 'date', 'color' — all render through CenterField.
export type FieldType =
  | 'text'
  | 'number'
  | 'url'
  | 'phone'
  | 'email'
  | 'password'
  | 'dropdown'

// A button that lives in the left or right slot of the bar.
// The slot shows up to `max` of them, then folds the rest into an overflow menu.
export interface FieldAction {
  id: string
  icon: React.ReactNode
  label?: string
  onClick?: () => void
  disabled?: boolean
}

// One selectable row — used by dropdown type and by search suggestions.
export interface FieldOption {
  value: string
  label: string
  icon?: React.ReactNode
}

// Where the top / bottom panels sit relative to the bar.
//  - 'absolute': floats out (top:100% for bottom), does not push layout
//  - 'stack':    part of the column flow, pushes siblings
export type PanelMode = 'absolute' | 'stack'
