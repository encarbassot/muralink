// OPTIONAL — delete if the module has no server logic. Express route factory.
// Returns a router; the platform mounts it. Keep all network paths optional so
// the module degrades cleanly offline.

import type { ModuleContext } from '@muralink/types'

// Typed loosely to avoid an Express dependency in the template.
export function createRoutes(context: ModuleContext): unknown {
  void context
  // Example with Express on the platform side:
  //   const router = Router()
  //   router.get('/', async (_req, res) => res.json(await context.storage.list()))
  //   return router
  return null
}
