// calcsheet as a bento cell. Local-first: the sheet lives in the cell's props
// (persisted with the grid layout), so a sheet works fully offline with no
// server. A standalone Instance<YCalcSheet> store + server table is the next step
// for sharing/embedding sheets across surfaces.

import type { CellModule } from '@muralink/shell'
import { CalcSheetApp } from './implementations/web/index.ts'
import { emptySheet, type YCalcSheet } from './types.ts'

export const calcsheetCell: CellModule = {
  descriptor: {
    moduleId: 'calcsheet',
    label: 'Hoja',
    icon: '🧮',
    description: 'Hoja de cálculo — fórmulas, funciones y reglas deterministas',
    defaultSize: '3x3',
    availableSizes: ['2x2', '2x3', '3x2', '3x3'],
  },
  render: (cell, ctx) => {
    const sheet = (cell.props?.['sheet'] as YCalcSheet | undefined) ?? emptySheet(cell.id)
    return (
      <CalcSheetApp
        sheet={sheet}
        readOnly={ctx.focused === false}
        onChange={(next) => ctx.updateCell?.(cell.id, { props: { ...cell.props, sheet: next } })}
      />
    )
  },
}
