// OPTIONAL — delete if the module has no extension UI. The overlay rendered on
// a page (or new tab) by the extension's widget renderer, inside an isolated
// shadow DOM. Which URL patterns it appears on is configured in DESIGNER.

import type { ModuleContext } from '@muralink/types'

interface OverlayProps {
  context: ModuleContext
}

export function Overlay({ context }: OverlayProps) {
  void context
  return <div className="template-overlay">template overlay</div>
}
