import type { GridSize, Platform, LayoutConstraints } from './module.js';
/** Position in fractional grid units. Non-integer when free-placed. */
export interface GridCellPosition {
    col: number;
    row: number;
}
/** One placed cell in the layout. */
export interface GridCellRecord {
    id: string;
    viewSpecId: string;
    moduleId: string;
    position: GridCellPosition;
    size: GridSize;
    instanceId?: string;
    /** Per-cell content. e.g. text cell → props.text, sub-dashboard cell → props.name. */
    props?: Record<string, unknown>;
    /** Per-cell layout override, merged over the module-level default. Lets one
     *  placed instance pin a size/priority without touching the module. */
    constraints?: LayoutConstraints;
}
/** How the grid manages placement.
 *  - 'freeform' (default): user positions/sizes cells; grid only prevents overlap.
 *  - 'auto': grid owns positions — it orders, packs and reflows on every change,
 *    honoring each widget's LayoutConstraints (window-manager behavior). */
export type LayoutMode = 'freeform' | 'auto';
/** Persisted layout document for one platform surface. */
export interface GridLayoutConfig {
    layoutId: string;
    platform: Platform;
    columns: number;
    cellSize: number;
    gap: number;
    cells: GridCellRecord[];
    /** Placement strategy. Absent = 'freeform' (back-compat with existing saves). */
    layoutMode?: LayoutMode;
}
/** Adapter slot for persistence. localStorage shim ships in @muralink/ui. */
export interface GridPersistenceAdapter {
    load(layoutId: string): Promise<GridLayoutConfig | null>;
    save(config: GridLayoutConfig): Promise<void>;
    /**
     * Optional live channel: invoke `onRemote` whenever another device changes
     * this layout, so the grid re-renders without a reload. Returns an unsubscribe
     * fn. Cloud/realtime adapters implement this; the localStorage shim does not.
     */
    subscribe?(layoutId: string, onRemote: (config: GridLayoutConfig) => void): () => void;
}
