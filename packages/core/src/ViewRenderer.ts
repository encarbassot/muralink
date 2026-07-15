// The rendering contract. A platform only needs to know how to render a
// ViewSpec — it never knows what's inside. Each platform ships its own
// implementation (React for web, shadow-DOM for extension, ...).
//
// The interface itself lives in @muralink/types (so platforms can depend on types
// alone). Re-exported here as the canonical core surface.

export type { ViewRenderer } from '@muralink/types'
