# url

The first fully-compliant module and the reference shape for every other type
module. A web address that knows its parts, validates, and normalizes.

- **Exposes type:** `YUrl { raw, normalized, domain }` (from `@muralink/types`)
- **Dependencies:** none — leaf module
- **Platforms:** `web`, `extension`, `local-server`
- **Views:** `url-card` (1x1, 2x1)

## Logic ([core.ts](core.ts))

| Function | Purpose |
|---|---|
| `validate(raw)` | structural URL check |
| `domain(raw)` | bare host, lowercased; `''` when invalid |
| `normalize(raw)` | build a full `YUrl`; throws on invalid input |
| `tryNormalize(raw)` | safe variant — returns `null` instead of throwing |

## Migration note

Ported from `🧠/elio-modules/modules/url/core.ts`. The legacy module used
`UrlProperties { href }` with `validate()` / `hostname()` and a `module.json`
manifest. Logic preserved; reshaped to the `YUrl` contract and a `manifest.ts`
export. `hostname()` → `domain()`.

## Structure

```
url/
├── manifest.ts                         # ModuleManifest export (required)
├── types.ts                            # re-exports YUrl
├── core.ts                             # pure validation / normalization
└── implementations/
    └── web/
        ├── index.ts
        └── views/UrlCard.1x1.tsx
```
