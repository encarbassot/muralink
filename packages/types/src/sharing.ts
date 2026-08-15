// Minimal visibility/trust-group primitive — the reusable seam for "a user
// publishes a field visible only to public / a trust group / nobody". Zero
// dependencies, types + one pure validator, like every primitive here.
// Modules own their own storage/CRUD for TrustGroup for now; promote to a
// dedicated package only once a second module needs it.

export type YVisibility = 'private' | 'trustgroup' | 'public'

export interface PublicField<T> {
  value: T
  visibility: YVisibility
  /** Required/meaningful only when visibility === 'trustgroup'. */
  trustGroupId?: string
}

export interface TrustGroup {
  id: string
  name: string
  /** Same identity axis as existing Tunnel shares (target_email). */
  memberEmails: string[]
  createdAt: string
  updatedAt?: string
}

/** Pure evaluator — no I/O. The publisher's own server calls this to decide
 *  whether to return a field to a given requester. */
export function canView(
  visibility: YVisibility,
  trustGroupId: string | undefined,
  requesterEmail: string | null,
  groups: TrustGroup[],
): boolean {
  if (visibility === 'public') return true
  if (visibility === 'private') return false
  if (!requesterEmail || !trustGroupId) return false
  return groups.some((g) => g.id === trustGroupId && g.memberEmails.includes(requesterEmail))
}
