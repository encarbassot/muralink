import type { YFacet } from './facets.js';
/** Stable, dotted type-id, namespaced by module to avoid collisions.
 *  e.g. 'stock.item', 'stock.location', 'calendar.event', 'contact', 'note', 'list'. */
export type InstanceType = string;
/** Shared lifecycle state every instance can carry (from the legacy CommonState). */
export interface InstanceState {
    pinned?: boolean;
    archived?: boolean;
    status?: string;
}
/** The universal record. `data` is the humane, module-typed payload (value
 *  objects like `YEmail`/`YMoney` stay inline inside it). `facets` is the
 *  composition model. Satisfies the spaces layer's `SpaceEntity` as-is. */
export interface Instance<D = unknown> {
    id: string;
    type: InstanceType;
    moduleId?: string;
    data: D;
    facets?: YFacet[];
    state?: InstanceState;
    metadata?: Record<string, string>;
    createdAt?: string;
    updatedAt?: string;
    spaceId?: string;
}
/** A lightweight pointer used inside relations and lists — never the full record. */
export interface InstanceRef {
    type: InstanceType;
    id: string;
}
/** An ordered collection is itself an Instance whose `data` holds member refs.
 *  This is how "InstanceList" exists without a second envelope: ordered,
 *  explicit membership a query can't express. `type` === 'list'. */
export interface InstanceListData {
    memberRefs: InstanceRef[];
    title?: string;
}
export type InstanceList = Instance<InstanceListData>;
