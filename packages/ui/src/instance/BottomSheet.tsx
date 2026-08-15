// Generic overlay chrome every instance editor shares. Two layouts from one
// component: 'bottom' is the mobile bottom sheet; 'right' anchors the same
// column of content as a VSCode-style side panel. The host decides what a
// backdrop tap means (the calendar editor passes its save-and-close).

import type React from 'react'

export interface BottomSheetProps {
  onBackdrop: () => void
  maxWidth?: number
  /** 'bottom' (default) = mobile sheet; 'right' = lateral panel. */
  side?: 'bottom' | 'right'
  children: React.ReactNode
}

export function BottomSheet({ onBackdrop, maxWidth = 480, side = 'bottom', children }: BottomSheetProps) {
  const lateral = side === 'right'
  return (
    <div
      onClick={onBackdrop}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: lateral ? 'stretch' : 'flex-end',
        justifyContent: lateral ? 'flex-end' : 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: lateral ? 380 : maxWidth,
          maxHeight: lateral ? '100vh' : '85vh',
          overflowY: 'auto',
          background: 'var(--bg-elevated, #fff)',
          borderTopLeftRadius: 16,
          borderTopRightRadius: lateral ? 0 : 16,
          borderBottomLeftRadius: lateral ? 16 : 0,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: lateral ? '-8px 0 30px rgba(0,0,0,0.25)' : '0 -8px 30px rgba(0,0,0,0.25)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
