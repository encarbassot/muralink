import type { YBlock } from './primitives.js';
/** Facet discriminator. Grows additively as viewers land
 *  ('calendar' | 'drawing' | 'file' | 'calcsheet' … are future members —
 *  each needs its own Y*Facet variant + FacetSection renderer before joining). */
export type YFacetType = 'todo' | 'note';
interface YFacetBase {
    id: string;
    type: YFacetType;
}
/** Checklist facet — checkbox blocks. */
export interface YTodoFacet extends YFacetBase {
    type: 'todo';
    blocks: YBlock[];
}
/** Free-form note facet — any block types. */
export interface YNoteFacet extends YFacetBase {
    type: 'note';
    blocks: YBlock[];
}
export type YFacet = YTodoFacet | YNoteFacet;
import type { Instance } from './instance.js';
/** A facets-only instance: the composition model with no typed `data` payload.
 *  Equivalent to the original `YInstance` shape via `Instance`'s `facets`/`id`/
 *  `metadata`/`updatedAt` fields. */
export type YInstance = Instance<Record<string, never>>;
export {};
