import type { OmnibarModule, ModuleRenderProps } from '../../types.js'
import { TranslateWidget } from './TranslateWidget.js'

const PREFIX = /^(?:tr|t)\s+/i

export const translateModule: OmnibarModule = {
  id: 'translate',
  icon: '⇄',
  label: 'Traducir',
  desc: 'traduce texto entre idiomas',
  layout: 'fullscreen',

  match(query) {
    if (!query) return 0
    return PREFIX.test(query) ? 1 : 0
  },

  // Fullscreen: no prefix query, it takes over the modal body.
  getActivationQuery() {
    return null
  },

  render(props: ModuleRenderProps) {
    // Seed from the captured context, else from whatever followed the "tr " prefix.
    const initial = props.context?.text ?? props.query.replace(PREFIX, '').trim()
    return (
      <TranslateWidget
        onClose={props.onClose}
        onInject={props.onInject}
        initialText={initial || undefined}
      />
    )
  },
}
