# platforms/

Runtimes that mount modules. Each instantiates a `ModuleRegistry` with the
locally installed modules and renders their `ViewSpec` declarations. All are
open source and self-hostable.

| Platform | Stack | Role |
|---|---|---|
| [server/](server/) | Node + Express | API runtime + git DB + file storage |
| [web/](web/) | React + Vite | Bento grid UI — primary interface |
| [extension/](extension/) | Chrome MV3 | Lightweight core runtime, overlays |
| [designer/](designer/) | React + Vite | Visual block editor, entity modeler |
| [interceptor/](interceptor/) | Node + Playwright | Webscraper / action automation |

`server` is API only; the frontend is `web`. They communicate over HTTP.
All scaffold-only this pass. See [docs/deeplinks/platforms.md](../docs/deeplinks/platforms.md).
