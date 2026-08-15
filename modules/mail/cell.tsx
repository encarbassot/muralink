// Mail as a bento cell — thin wrapper mounting the existing full app in place.
// MailApp was built assuming a full page's worth of space (list + reading
// pane); availableSizes starts large so a user can't shrink it into
// uselessness. No internal rewrite here — see modules/mail/README.md if the
// layout needs to become responsive at smaller spans later.

import type { CellModule } from '@muralink/shell'
import { MailApp } from './implementations/web/index.ts'

export const mailCell: CellModule = {
  descriptor: {
    moduleId: 'mail',
    label: 'Correo',
    icon: '✉️',
    description: 'Bandeja de correo',
    defaultSize: '2x3',
    availableSizes: ['2x3', '3x2', '3x3'],
  },
  render: () => <MailApp />,
}
