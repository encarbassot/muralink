// Local-first murales persistence over storage spaces. A mural lives in
// exactly one space — this device (IndexedDB, default), the company server,
// or the encrypted cloud backup. Mirrors the notes store shape.

import { create } from 'zustand'
import {
  type SpaceId,
  registerSpace,
  makeIdbSpace,
  loadPrefs,
  persistPrefs,
  withDefault,
  withToggled,
  listMerged,
  spaceFor,
  moveItem,
} from '@muralink/spaces'
import { defaultGrid, type MuralArrow, type MuralElement, type MuralFileRef, type YMural } from '../../types.ts'
import { defaultCanvasPlacement } from './engine/canvasLayout.ts'
import { splitByHeadings, type HeadingSection } from './engine/muralLayout.ts'

const COLLECTION = 'murales'

// The default space is always available.
registerSpace(
  COLLECTION,
  makeIdbSpace<YMural>({ dbName: 'elio-murales', store: 'murales' }),
)

export { registerSpace, listSpaces, makeHttpSpace } from '@muralink/spaces'

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function newElementId(): string {
  return uid('el')
}

// Element factories stamp BOTH per-view intrinsics at creation: doc side =
// flow appended after existing siblings (array order), canvas side = a
// deterministic spiral slot around the parent center.

export function makeMarkdownElement(text = '', parentId?: string, siblings: MuralElement[] = []): MuralElement {
  return {
    id: newElementId(),
    kind: 'markdown',
    text,
    parentId,
    doc: { placement: 'flow' },
    canvas: defaultCanvasPlacement(siblings, parentId, 'markdown'),
  }
}

export function makeGroupElement(parentId?: string, siblings: MuralElement[] = []): MuralElement {
  return {
    id: newElementId(),
    kind: 'group',
    parentId,
    doc: { placement: 'flow' },
    canvas: defaultCanvasPlacement(siblings, parentId, 'group'),
  }
}

export function makeFileElement(file: MuralFileRef, parentId?: string, siblings: MuralElement[] = []): MuralElement {
  return {
    id: newElementId(),
    kind: 'file',
    file,
    parentId,
    doc: { placement: 'flow' },
    canvas: defaultCanvasPlacement(siblings, parentId, 'file'),
  }
}

// A connection between two elements of a mind-map (a graph edge). Rendered as a
// line; the force layout pulls the two endpoints together.
export function makeArrow(from: string, to: string): MuralArrow {
  return { id: uid('arrow'), from, to }
}

// A reference to another whole mural, embedded as a block. This is the
// recursion: a mural can contain another mural (which may contain more).
export function makeMuralRefElement(refId: string, parentId?: string, siblings: MuralElement[] = []): MuralElement {
  return {
    id: newElementId(),
    kind: 'mural-ref',
    refId,
    parentId,
    doc: { placement: 'flow' },
    canvas: defaultCanvasPlacement(siblings, parentId, 'mural-ref'),
  }
}

// "Convertir a canvas": turn a markdown document into a tree of column groups
// split by headings. Each heading → a column whose first child is the heading
// line and whose body is the text under it; deeper headings nest as sub-columns.
// Text before the first heading becomes a loose root markdown block.
export function muralElementsFromMarkdown(text: string): MuralElement[] {
  const { preamble, sections } = splitByHeadings(text)
  const out: MuralElement[] = []

  const build = (s: HeadingSection, parentId?: string) => {
    const group = makeGroupElement(parentId, [])
    group.canvas.layout = 'column'
    out.push(group)
    out.push(makeMarkdownElement(`${'#'.repeat(s.level)} ${s.title}`.trim(), group.id, []))
    if (s.body.trim()) out.push(makeMarkdownElement(s.body.trim(), group.id, []))
    for (const c of s.children) build(c, group.id)
  }

  if (preamble.trim()) out.push(makeMarkdownElement(preamble.trim(), undefined, []))
  for (const s of sections) build(s, undefined)
  return out
}

// v2 normalization: pre-multi-view murals (elements without `doc`) are
// discarded — the user chose a clean model over a migration.
export function normalizeMural(raw: YMural): YMural {
  const elements = raw.elements ?? []
  if (elements.some((e) => !(e as Partial<MuralElement>).doc || !(e as Partial<MuralElement>).canvas)) {
    console.warn(`[murales] «${raw.title}» (${raw.id}) tenía elementos v1 — descartados (modelo v2 sin migración)`)
    return { ...raw, elements: [], grid: raw.grid ?? defaultGrid() }
  }
  return { ...raw, elements, grid: raw.grid ?? defaultGrid() }
}

function byUpdated(a: YMural, b: YMural): number {
  return b.updatedAt.localeCompare(a.updatedAt)
}

export const MURAL_EMOJIS = ['🧱', '🎯', '🗺️', '📌', '🌋', '🎨', '🌊', '🚀', '🌵', '🍊', '🦜', '⚡', '🎪', '🏔️', '🧭', '🎁']

export function randomMuralEmoji(): string {
  return MURAL_EMOJIS[Math.floor(Math.random() * MURAL_EMOJIS.length)]!
}

interface MuralesState {
  murales: YMural[]
  loaded: boolean
  activeSpaces: SpaceId[]
  defaultSpace: SpaceId
  loadAll: () => Promise<void>
  get: (id: string) => YMural | undefined
  create: (partial?: Partial<YMural>) => Promise<YMural>
  update: (id: string, patch: Partial<YMural>) => Promise<void>
  remove: (id: string) => Promise<void>
  moveMural: (id: string, toSpace: SpaceId) => Promise<void>
  setDefaultSpace: (id: SpaceId) => void
  toggleSpace: (id: SpaceId) => void
}

const prefs = loadPrefs(COLLECTION)

export const useMurales = create<MuralesState>((set, get) => ({
  murales: [],
  loaded: false,
  activeSpaces: prefs.activeSpaces,
  defaultSpace: prefs.defaultSpace,

  async loadAll() {
    const all = (await listMerged<YMural>(COLLECTION, get().activeSpaces)).map(normalizeMural)
    all.sort(byUpdated)
    set({ murales: all, loaded: true })
  },

  get(id) {
    return get().murales.find((m) => m.id === id)
  },

  async create(partial) {
    const space = spaceFor<YMural>(COLLECTION, undefined, get().defaultSpace)
    const title = partial?.title ?? 'Nuevo mural'
    const mural: YMural = {
      id: partial?.id ?? uid('mural'),
      title,
      emoji: partial?.emoji ?? randomMuralEmoji(),
      // The title doubles as the document's first line (# titulo).
      elements: partial?.elements ?? [makeMarkdownElement(`# ${title}`)],
      arrows: partial?.arrows,
      grid: partial?.grid ?? defaultGrid(),
      public: partial?.public,
      updatedAt: new Date().toISOString(),
    }
    if (!space) return mural
    const created = await space.create(mural)
    if (get().activeSpaces.includes(created.spaceId!)) {
      set((s) => ({ murales: [created, ...s.murales] }))
    }
    return created
  },

  async update(id, patch) {
    const existing = get().murales.find((m) => m.id === id)
    if (!existing) return
    const space = spaceFor(COLLECTION, existing, get().defaultSpace)
    if (!space) return
    const next = await space.update(id, {
      ...patch,
      updatedAt: new Date().toISOString(),
    })
    if (!next) return
    set((s) => ({ murales: [next, ...s.murales.filter((m) => m.id !== id)] }))
  },

  async remove(id) {
    const existing = get().murales.find((m) => m.id === id)
    const space = spaceFor(COLLECTION, existing, get().defaultSpace)
    if (!space) return
    await space.remove(id)
    set((s) => ({ murales: s.murales.filter((m) => m.id !== id) }))
  },

  async moveMural(id, toSpace) {
    const existing = get().murales.find((m) => m.id === id)
    if (!existing) return
    const created = await moveItem(COLLECTION, existing, toSpace)
    if (!created) return
    set((s) => ({
      murales: s.murales.map((m) => (m.id === id ? created : m)).sort(byUpdated),
    }))
  },

  setDefaultSpace(id) {
    set((s) => {
      const next = withDefault({ activeSpaces: s.activeSpaces, defaultSpace: s.defaultSpace }, id)
      persistPrefs(COLLECTION, next)
      return { activeSpaces: next.activeSpaces, defaultSpace: next.defaultSpace }
    })
    void get().loadAll()
  },

  toggleSpace(id) {
    set((s) => {
      const next = withToggled({ activeSpaces: s.activeSpaces, defaultSpace: s.defaultSpace }, id)
      persistPrefs(COLLECTION, next)
      return { activeSpaces: next.activeSpaces, defaultSpace: next.defaultSpace }
    })
    void get().loadAll()
  },
}))
