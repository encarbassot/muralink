// The universal record. Any datum in the system — a stock item, a calendar
// event, a contact, a note — is an `Instance`: a typed `data` payload plus an
// optional list of `facets` (composed content sections). This reconciles the
// two prior shapes: the facet-composition `YInstance` (facets.ts) and the
// legacy properties-bag record. A pure note has empty `data` + facets; a stock
// item has typed `data` and no facets; a calendar event can have both.
//
// Zero dependencies, like every primitive here. `spaceId` is typed `string`
// (not the spaces layer's `SpaceId`) so this package stays dependency-free —
// @muralink/spaces depends on us, never the other way round.
export {};
// Rule of thumb — value objects vs instances:
// A value object (YEmail, YMoney, YUrl, YDateTime) has no identity and lives
// INLINE inside `data`. A datum becomes its OWN Instance the moment two records
// must reference the same one (e.g. the same email is both a contact address and
// a credential login). Start conservative; promote to Instance + Relation only on
// demonstrated cross-linking need.
