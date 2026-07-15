// ASCII spinner — animated status icon for boot and 'starting' states.
// Pure ASCII frames so it renders in any terminal/font. Cycles on an interval.

import { useEffect, useState } from 'react'
import { Text } from 'ink'

// Classic ASCII spin. Swap FRAMES for a different style (e.g. ['.', 'o', 'O', 'o']).
const FRAMES = ['|', '/', '-', '\\']

interface Props {
  color?: string
  interval?: number // ms per frame
}

export function Spinner({ color, interval = 90 }: Props) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setI((n) => (n + 1) % FRAMES.length), interval)
    return () => clearInterval(iv)
  }, [interval])
  return <Text color={color}>{FRAMES[i]}</Text>
}
