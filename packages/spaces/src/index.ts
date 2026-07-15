// @muralink/spaces — storage spaces for local-first modules. An item lives in
// exactly one space: this device (IndexedDB), a company server (orchester),
// or the encrypted cloud backup (tunnel). Modules register a local space and
// build their stores on the helpers here; hosts inject remote spaces.

export type { SpaceId, SpaceEntity, SpaceQuery, StorageSpace } from './space'
export { registerSpace, unregisterSpace, getSpace, listSpaces, stamp } from './registry'
export { makeIdbSpace, type IdbSpaceConfig } from './idbSpace'
export { makeHttpSpace, type HttpSpaceConfig } from './httpSpace'
export { makeTunnelSpace, type TunnelSpaceConfig } from './tunnelSpace'
export {
  type SpacePrefs,
  loadPrefs,
  persistPrefs,
  withDefault,
  withToggled,
  listMerged,
  spaceFor,
  moveItem,
  writableSpaces,
} from './store'
