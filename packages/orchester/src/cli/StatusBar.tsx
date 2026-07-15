// Nano-style bottom bar: a row of "key  label" shortcuts, key shown inverse.
// The active screen passes the shortcuts relevant to it.

import { Box, Text } from 'ink'

export interface Shortcut {
  key: string
  label: string
}

export function StatusBar({ shortcuts, note }: { shortcuts: Shortcut[]; note?: string }) {
  return (
    <Box marginTop={1} flexWrap="wrap">
      {shortcuts.map((s) => (
        <Box key={s.key} marginRight={2}>
          <Text inverse> {s.key} </Text>
          <Text dimColor> {s.label}</Text>
        </Box>
      ))}
      {note ? <Text color="green">{note}</Text> : null}
    </Box>
  )
}
