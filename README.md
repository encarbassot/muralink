# Muralink

A local-first platform you assemble yourself. Install modules — notes, contacts,
calendar, files, passwords — and compose them into dashboards that nest inside
each other. It runs on your machine, offline, whether or not we exist.

> **We don't want your data.** Open source, verifiable, self-hostable.
> **You own the code.** Hosting means a whole machine, not a folder in someone's cloud.

## The two rules everything else follows

- **Local-first.** Every feature works with the network off. Reaching the
  internet is an optional path in every function, never a precondition. Sharing
  and sync are opt-in.
- **Single-user core.** The open platform has no accounts, no tenants, no
  billing. Several people sharing one instance is a separate front; several
  isolated accounts is a separate product. Neither is in here.

## Run it

On a clean Linux box — installs git and node, clones, and hands over to the
deploy wizard:

```sh
curl -fsSL https://raw.githubusercontent.com/encarbassot/muralink/main/scripts/bootstrap.sh | bash
```

From a checkout:

```sh
npm install                              # npm workspaces, one install at the root
npm run dev -w @muralink/platform-web    # the web app
npm run orchester                        # the instance console (TUI)
```

Node 20+. Install guides: [Linux](docs/install/linux.md) ·
[macOS](docs/install/mac.md) · [Windows](docs/install/windows.md).

## How it fits together

```
packages/   types (zero-dep primitives) · core (ModuleRegistry, DAG) ·
            ui (bento grid engine) · shell (app shell, cell registry) ·
            spaces (storage: local / server / encrypted cloud) ·
            editor · calc · omnibar · realtime · ai · payments ·
            orchester (the daemon + deploy wizard) · app · embed
modules/    notes · contacts · calendar · reminders · murales · drive ·
            gallery · stock · expenses · mail · maps · habits · tracker ·
            passwords · calcsheet · attendance · employees · url · …
platforms/  web · server · electronApp · extension · backoffice ·
            designer · tunnel-web
instances/  a deployment's own config, theme and module set
```

A **module** owns a feature and knows its data contract, not where it will be
rendered. A **platform** is a runtime that mounts modules. An **instance** is one
deployment saying who it is. The grid composes modules recursively: a dashboard
is a widget, so dashboards nest.

## Where to change things

| Your change is about… | Work in |
|---|---|
| How a feature behaves | `modules/<name>/` |
| Storage and sync | `packages/spaces/` |
| The grid engine (drag, resize) | `packages/ui/` |
| Which widgets exist | `packages/app/src/registry.tsx` |
| The self-hosted server | `platforms/server/`, `packages/orchester/` |
| The public embed surface | `packages/embed/` |
| One deployment's config | `instances/<name>/` |

## Embedding

`@muralink/embed` publishes the same widgets the product ships, free to use:

```sh
npm install @muralink/embed
```

## Docs

[Architecture](docs/architecture.md) · [Module spec](docs/module-spec.md) ·
[Self-hosting](docs/self-hosting.md) · [Distribution](docs/distribution.md) ·
[Self-hosted mail](docs/self-hosted-mail.md)

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) — the layout is the architecture, so most of
contributing is knowing where a change belongs. Security issues:
[SECURITY.md](SECURITY.md), never a public issue.

## License

MIT. See [LICENSE](LICENSE).
