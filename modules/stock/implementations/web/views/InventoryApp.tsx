import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { PillBar } from '@muralink/ui'
import type { YStockItem, YLocation } from '../../../types.ts'
import { PricingEditor } from '../pricing/PricingEditor.tsx'

/** Which inventory surface is showing: the classic rail/list/detail, or the
 *  spatial stores-as-columns grid (Minecraft-style stacks). */
export type InventoryView = 'list' | 'stores'

// Full inventory app: a locations rail (assign/group products by place), the
// filtered item list with a "create article" button, and an editable detail
// pane. Presentational + prop-driven — the host platform owns persistence
// (react-query over the stock API on web, or any other store), so the module
// never imports a platform. Mirrors the list/rail/detail shape of ContactsApp.

interface Props {
  items?: YStockItem[]
  locations?: YLocation[]
  /** Create a blank article; resolves to the created item so it can be selected. */
  onCreateItem?: () => Promise<YStockItem>
  onUpdateItem?: (id: string, patch: Partial<Omit<YStockItem, 'id'>>) => void
  onDeleteItem?: (id: string) => void
  onAdjust?: (id: string, delta: number) => void
  /** Create a location; resolves to it so it can be selected. */
  onCreateLocation?: (name: string) => Promise<YLocation>
  onRenameLocation?: (id: string, name: string) => void
  onDeleteLocation?: (id: string) => void
}

const ALL = '__all__'
const UNASSIGNED = '__unassigned__'

function isLow(item: YStockItem): boolean {
  return item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold
}


export function InventoryApp({
  items = [],
  locations = [],
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onAdjust,
  onCreateLocation,
  onRenameLocation,
  onDeleteLocation,
}: Props) {
  const [locFilter, setLocFilter] = useState<string>(ALL)
  const [activeId, setActiveId] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<InventoryView>('list')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter((i) => {
      if (locFilter === UNASSIGNED && i.locationId) return false
      if (locFilter !== ALL && locFilter !== UNASSIGNED && i.locationId !== locFilter) return false
      return (
        i.name.toLowerCase().includes(q) ||
        (i.category?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [items, locFilter, search])

  // Keep the selected item valid as the list changes.
  useEffect(() => {
    if (activeId && items.some((i) => i.id === activeId)) return
    setActiveId(filtered[0]?.id)
  }, [items, filtered, activeId])

  const active = items.find((i) => i.id === activeId)

  async function handleCreate() {
    if (!onCreateItem) return
    const created = await onCreateItem()
    // If a real location is selected, drop the new article into it.
    if (locFilter !== ALL && locFilter !== UNASSIGNED && onUpdateItem) {
      onUpdateItem(created.id, { locationId: locFilter })
    }
    setActiveId(created.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--bg)' }}>
      {/* Toolbar — right-aligned action groups. First group is the view switcher
          (radio); further groups can be independent onClick actions. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ flex: 1 }} />
        <PillBar
          groups={[
            {
              kind: 'radio',
              value: view,
              onChange: (id) => setView(id as InventoryView),
              options: [
                { id: 'list', icon: '☰', label: 'Lista', title: 'Vista de lista' },
                { id: 'stores', icon: '▦', label: 'Almacenes', title: 'Vista de almacenes' },
              ],
            },
          ]}
        />
      </div>

      {view === 'stores' ? (
        <StoresPlaceholder />
      ) : (
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <LocationsRail
        locations={locations}
        items={items}
        active={locFilter}
        onPick={setLocFilter}
        onCreate={onCreateLocation}
        onRename={onRenameLocation}
        onDelete={(id) => {
          if (locFilter === id) setLocFilter(ALL)
          onDeleteLocation?.(id)
        }}
      />

      {/* Item list */}
      <div style={{ width: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>Artículos</span>
          {onCreateItem && (
            <button
              onClick={() => void handleCreate()}
              title="Crear artículo"
              style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-dim)', borderRadius: 6, height: 26, padding: '0 10px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Crear
            </button>
          )}
        </div>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, outline: 'none', background: 'var(--bg-elevated)', color: 'var(--fg)', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.map((it) => (
            <div
              key={it.id}
              onClick={() => setActiveId(it.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                borderBottom: '1px solid var(--border)',
                borderLeft: `2px solid ${it.id === activeId ? 'var(--accent)' : 'transparent'}`,
                background: it.id === activeId ? 'var(--bg-elevated)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.name || 'Sin nombre'}
                  {isLow(it) && <span style={{ fontSize: 10, color: '#e53935', fontWeight: 700 }}>LOW</span>}
                </div>
                {it.category && <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{it.category}</div>}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: isLow(it) ? '#e53935' : 'var(--fg)', flexShrink: 0 }}>
                {it.quantity} {it.unit}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 16, fontSize: 11, color: 'var(--fg-faint)', textAlign: 'center' }}>
              {items.length === 0 ? 'Sin artículos' : 'Sin resultados'}
            </div>
          )}
        </div>
      </div>

      {/* Detail pane */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        {active ? (
          <ItemDetail
            key={active.id}
            item={active}
            locations={locations}
            onChange={(patch) => onUpdateItem?.(active.id, patch)}
            onAdjust={onAdjust ? (delta) => onAdjust(active.id, delta) : undefined}
            onDelete={onDeleteItem ? () => onDeleteItem(active.id) : undefined}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--fg-faint)' }}>
            <span style={{ fontSize: 32, opacity: 0.4 }}>📦</span>
            {onCreateItem && (
              <button
                onClick={() => void handleCreate()}
                style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-dim)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}
              >
                Crear primer artículo
              </button>
            )}
          </div>
        )}
      </div>
        </div>
      )}
    </div>
  )
}

// Temporary placeholder for the stores-as-columns grid view (built in Phase D2).
function StoresPlaceholder() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>
      Vista de almacenes — próximamente
    </div>
  )
}

// ── Locations rail ────────────────────────────────────────────────────────────

function LocationsRail({
  locations,
  items,
  active,
  onPick,
  onCreate,
  onRename,
  onDelete,
}: {
  locations: YLocation[]
  items: YStockItem[]
  active: string
  onPick: (id: string) => void
  onCreate?: (name: string) => Promise<YLocation>
  onRename?: (id: string, name: string) => void
  onDelete?: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const count = (pred: (i: YStockItem) => boolean) => items.filter(pred).length

  async function commit() {
    const name = draft.trim()
    setAdding(false)
    setDraft('')
    if (name && onCreate) {
      const loc = await onCreate(name)
      onPick(loc.id)
    }
  }

  return (
    <div style={{ width: 200, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', flex: 1 }}>Ubicaciones</span>
        {onCreate && (
          <button
            onClick={() => setAdding(true)}
            title="Nueva ubicación"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-dim)', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 14 }}
          >
            +
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
        <RailItem label="Todos" count={items.length} activeRow={active === ALL} onClick={() => onPick(ALL)} />
        <RailItem
          label="Sin ubicación"
          count={count((i) => !i.locationId)}
          activeRow={active === UNASSIGNED}
          onClick={() => onPick(UNASSIGNED)}
        />
        <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
        {locations.map((loc) => (
          <RailItem
            key={loc.id}
            label={loc.name}
            count={count((i) => i.locationId === loc.id)}
            activeRow={active === loc.id}
            onClick={() => onPick(loc.id)}
            onRename={onRename ? (name) => onRename(loc.id, name) : undefined}
            onDelete={onDelete ? () => onDelete(loc.id) : undefined}
          />
        ))}
        {adding && (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit()
              if (e.key === 'Escape') { setAdding(false); setDraft('') }
            }}
            placeholder="Nombre ubicación…"
            style={{ width: '100%', border: '1px solid var(--accent)', borderRadius: 6, padding: '6px 8px', fontSize: 12, outline: 'none', background: 'var(--bg-elevated)', color: 'var(--fg)', boxSizing: 'border-box', marginTop: 4 }}
          />
        )}
        {locations.length === 0 && !adding && (
          <div style={{ padding: '10px 8px', fontSize: 11, color: 'var(--fg-faint)' }}>
            Sin ubicaciones. Crea una para agrupar productos.
          </div>
        )}
      </div>
    </div>
  )
}

function RailItem({
  label,
  count,
  activeRow,
  onClick,
  onRename,
  onDelete,
}: {
  label: string
  count: number
  activeRow: boolean
  onClick: () => void
  onRename?: (name: string) => void
  onDelete?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const [hover, setHover] = useState(false)

  if (editing && onRename) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); const n = draft.trim(); if (n && n !== label) onRename(n) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { setEditing(false); const n = draft.trim(); if (n && n !== label) onRename(n) }
          if (e.key === 'Escape') { setEditing(false); setDraft(label) }
        }}
        style={{ width: '100%', border: '1px solid var(--accent)', borderRadius: 6, padding: '6px 8px', fontSize: 12, outline: 'none', background: 'var(--bg-elevated)', color: 'var(--fg)', boxSizing: 'border-box' }}
      />
    )
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6,
        cursor: 'pointer', background: activeRow ? 'var(--bg-elevated)' : 'transparent',
        color: activeRow ? 'var(--fg)' : 'var(--fg-dim)',
      }}
    >
      <span style={{ flex: 1, fontSize: 12, fontWeight: activeRow ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {hover && onRename ? (
        <button
          onClick={(e) => { e.stopPropagation(); setDraft(label); setEditing(true) }}
          title="Renombrar"
          style={{ border: 'none', background: 'none', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 11, padding: 0 }}
        >✎</button>
      ) : null}
      {hover && onDelete ? (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Eliminar ubicación"
          style={{ border: 'none', background: 'none', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12, padding: 0 }}
        >✕</button>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--fg-faint)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
    </div>
  )
}

// ── Item detail ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)' }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13,
  outline: 'none', background: 'var(--bg-elevated)', color: 'var(--fg)', boxSizing: 'border-box', width: '100%',
}

function ItemDetail({
  item,
  locations,
  onChange,
  onAdjust,
  onDelete,
}: {
  item: YStockItem
  locations: YLocation[]
  onChange: (patch: Partial<Omit<YStockItem, 'id'>>) => void
  onAdjust?: (delta: number) => void
  onDelete?: () => void
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <input
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nombre del artículo"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', fontSize: 15, fontWeight: 600 }}
        />
        {onDelete && (
          <button
            onClick={onDelete}
            title="Eliminar artículo"
            style={{ border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)', background: 'color-mix(in srgb, #ef4444 8%, transparent)', color: '#f87171', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 12 }}
          >✕</button>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460 }}>
        {/* Quantity + unit */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <Field label="Cantidad">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {onAdjust && (
                <button onClick={() => onAdjust(-1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg)', cursor: 'pointer', fontSize: 16 }}>−</button>
              )}
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => onChange({ quantity: Math.max(0, Number(e.target.value) || 0) })}
                style={{ ...inputStyle, width: 90, textAlign: 'center' }}
              />
              {onAdjust && (
                <button onClick={() => onAdjust(1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg)', cursor: 'pointer', fontSize: 16 }}>+</button>
              )}
            </div>
          </Field>
          <div>
            <Field label="Unidad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input value={item.unit} onChange={(e) => onChange({ unit: e.target.value })} placeholder="ud" style={{ ...inputStyle, width: 90 }} />
                {['uds', 'm', 'L'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => onChange({ unit: u })}
                    style={{
                      height: 32,
                      padding: '0 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: item.unit === u ? 'var(--fg)' : 'var(--bg-elevated)',
                      color: item.unit === u ? 'var(--bg)' : 'var(--fg)',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        <Field label="Ubicación">
          <select
            value={item.locationId ?? ''}
            onChange={(e) => onChange({ locationId: e.target.value || undefined })}
            style={inputStyle}
          >
            <option value="">Sin ubicación</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Categoría">
          <input value={item.category ?? ''} onChange={(e) => onChange({ category: e.target.value || undefined })} placeholder="p. ej. Herramientas" style={inputStyle} />
        </Field>

        <Field label="Stock mínimo (aviso)">
          <input
            type="number"
            value={item.lowStockThreshold ?? ''}
            onChange={(e) => onChange({ lowStockThreshold: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
            placeholder="Sin aviso"
            style={inputStyle}
          />
        </Field>

        <Field label="Notas">
          <textarea
            value={item.notes ?? ''}
            onChange={(e) => onChange({ notes: e.target.value || undefined })}
            placeholder="Notas internas…"
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>

        <PricingEditor pricing={item.pricing} onChange={(pricing) => onChange({ pricing })} />
      </div>
    </>
  )
}
