import type { InstanceType } from './instance.js';
/** One typed directional edge between two instances. `from*`/`to*` types are
 *  denormalized onto the row so discovery and filtering need no join. */
export interface Relation {
    id: string;
    role: string;
    fromType: InstanceType;
    fromId: string;
    toType: InstanceType;
    toId: string;
    metadata?: Record<string, string>;
    createdAt?: string;
    updatedAt?: string;
    spaceId?: string;
}
/** One entry in the discoverable relation-type map. Keyed by the ORDERED type
 *  pair + role, so (A→B) and (B→A) are separate discoverable sets. Stored, not
 *  merely derived, so free-text additions persist and rank by usage. */
export interface RelationType {
    id: string;
    fromType: InstanceType;
    toType: InstanceType;
    role: string;
    label?: string;
    inverseRole?: string;
    usageCount?: number;
    createdAt?: string;
    updatedAt?: string;
    spaceId?: string;
}
/** Canonical id for a relation-type map entry. */
export declare const relationTypeId: (fromType: string, toType: string, role: string) => string;
/** Roles that build a containment hierarchy (parent→child). Only these are
 *  guarded against cycles on write; all other (associative) relations may form
 *  cycles freely. Kept here so both the spaces guard and UI agree on the set. */
export declare const CONTAINMENT_ROLES: readonly string[];
export declare const isContainmentRole: (role: string) => boolean;
