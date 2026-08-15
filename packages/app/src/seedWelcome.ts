// The welcome mural — the other half of what a fresh orchester shows.
//
// defaultLayout.ts puts a murales card on the seeded dashboard; without this
// that card reads "Sin murales aún", which is a worse first impression than an
// empty grid was. This writes one mural, once, so the first screen has
// something in it that explains itself.
//
// Deliberately not part of defaultLayout: a layout is a document the grid owns
// and rewrites constantly, while a mural is user content living in a module's
// own space. Seeding content through the layout would mean the grid deciding
// what goes in someone's murales collection.

import { useMurales, makeMarkdownElement } from '@muralink/module-murales/web'

const SEEDED = 'muralink-welcome-mural-v1'

const WELCOME = `# Welcome

Esta es tu instancia. Corre en tu máquina y funciona sin conexión.

- El **calendario** está anclado al dock, arriba a la izquierda.
- Pulsa el **⋯** de cualquier tarjeta para moverla o cambiarle el tamaño.
- Añade lo que quieras con el buscador: notas, contactos, gastos, contraseñas…

Este mural es tuyo: edítalo o bórralo.`

/** Create the welcome mural on a device that has never had one.
 *  Safe to call on every boot: the flag short-circuits it, and an existing
 *  murales collection is left alone even if the flag was lost. */
export async function seedWelcomeMural(): Promise<void> {
  try {
    if (localStorage.getItem(SEEDED)) return
  } catch {
    return // private mode with storage denied: seeding is not worth an exception
  }

  const store = useMurales.getState()
  if (!store.loaded) await store.loadAll()
  // Someone who deleted the welcome mural must not get it back, and someone
  // arriving with murales of their own must not be handed ours.
  if (useMurales.getState().murales.length > 0) {
    localStorage.setItem(SEEDED, 'skipped')
    return
  }

  await useMurales.getState().create({
    title: 'Welcome',
    emoji: '👋',
    elements: [makeMarkdownElement(WELCOME)],
  })
  localStorage.setItem(SEEDED, 'done')
}
