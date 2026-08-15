# Install — Linux

Putting an orchester on a clean Linux machine: a public frontend, a database,
and a storage folder you reach from anywhere.

The wizard is the installer. It is not a script that runs once and hopes — it
is a checklist of steps that each know how to **check** themselves and how to
**apply** themselves, so you can run it repeatedly, resume it after a dropped
SSH session, and re-run it a month later to see what drifted.

Source: [`packages/orchester/src/deploy/`](../../packages/orchester/src/deploy/).

## Cold start — a machine with nothing on it

The wizard lives inside the repo, so a bare box has a chicken-and-egg problem:
it cannot run the installer until it has the code the installer is part of.
One command solves exactly that and nothing else — installs git and node,
clones the public repo, `npm install`, then hands over to the wizard:

```sh
curl -fsSL https://raw.githubusercontent.com/encarbassot/muralink/main/scripts/bootstrap.sh | bash
```

It clones over HTTPS from the **public** repo, so the machine needs no SSH key,
no token and no account. Overridable with `MURAL_REPO`, `MURAL_BRANCH` and
`MURAL_ROOT` (default `~/muralink`).

From then on the checkout updates itself through step 5 — you never need the
bootstrap again on that machine.

## Two front ends, one checklist

```sh
# interactive: the orchester TUI, press D
npm run orchester

# headless: same steps, for SSH and provisioning scripts
npx orchester-deploy status
npx orchester-deploy apply --all
```

Both drive the same `DEPLOY_STEPS`, so what you do by hand and what a script
does unattended cannot drift apart.

## The steps

| # | Step | What it checks / does |
|---|---|---|
| 1 | Host preflight | OS, node ≥ 20, passwordless sudo, systemd, free disk |
| 2 | Instance identity | domain, admin email, service user, data + storage paths, API token |
| 3 | System packages | nginx, certbot, openssl, git, a compiler for native modules |
| 4 | Ports and DNS | :80/:443 free or held by nginx; the domain resolves to *this* machine |
| 5 | Source checkout | clone the monorepo from GitHub, or fast-forward the existing one |
| 6 | Workspace dependencies | `npm install` across the monorepo |
| 7 | Build the frontend | `vite build` into `platforms/web/dist` |
| 8 | Data and storage folders | create + chown the database dir and the served folder |
| 9 | Orchester service | systemd unit, so the instance survives a reboot |
| 10 | Database | the core opened its sqlite file and answers `/health` |
| 11 | Web server (nginx) | site, auth gate, reverse proxy to the frontend |
| 12 | TLS certificate | issue via ACME (or self-signed), promote the site to HTTPS |
| 13 | End-to-end check | hit the public address the way a browser would |

Every step is idempotent. A failed step reports the real stderr, not a summary —
you are on an SSH session and you need the actual error.

## Before you start

**DNS.** Your domain's A record must point at this machine's public IP. ACME
HTTP-01 validates by fetching `http://<domain>/.well-known/acme-challenge/…`,
so a record pointing anywhere else fails at step 11. Step 4 checks this and
tells you both addresses. A home connection usually has a dynamic IP — plan for
dynamic DNS, or the certificate stops renewing the day your ISP rotates it.

**Router.** Forward TCP :80 and :443 to this machine. :80 is not optional even
if you only want HTTPS: renewals go through it.

**Passwordless sudo.** Every privileged action uses `sudo -n`, so a box that
prompts would hang an unattended apply:

```sh
echo "$USER ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/muralink
```

## The auth gate — read this one

`platforms/web` bakes its API token into the JavaScript bundle. On a LAN that is
harmless. On a public address it is not: anyone who loads your page can read the
token out of the bundle and then has full access to your instance.

So the wizard puts the gate in nginx:

- nginx authenticates the human with basic auth (`auth_basic`);
- nginx **overwrites** `Authorization` with the master bearer token on the way
  upstream, so the token stays on the box and the browser never holds it;
- the frontend is built with an empty token.

Leaving the auth user empty is allowed and the wizard warns loudly. Do it only
on a trusted LAN.

## Walkthrough

```sh
git clone <repo> /opt/muralink && cd /opt/muralink

npx orchester-deploy set \
  domain=mi-instancia.example.com \
  adminEmail=yo@example.com \
  serviceUser=$USER \
  storageRoot=/srv/muralink-storage \
  dataDir=/var/lib/muralink \
  apiToken=generate

MURALINK_AUTH_PASSWORD='una contraseña larga' npx orchester-deploy apply --all
npx orchester-deploy status
```

## What you end up with

```
                    :80 / :443
                        │
                     nginx ──────── basic auth (the human)
                        │           Authorization: Bearer … (the core)
                        ▼
        web-frontend :3000  ── static dist + /api proxy
                        │
                     core :3001 ──── sqlite   (dataDir)
                                 └── storage  (storageRoot, /api/storage)
                        │
              muralink-orchesterd.service  (systemd, starts on boot)
```

Files worth knowing:

| Path | What |
|---|---|
| `/etc/systemd/system/muralink-orchesterd.service` | the unit |
| `/etc/muralink/orchester.env` | environment, mode 0640 — holds the API token |
| `/etc/nginx/sites-available/muralink.conf` | the site (rewritten on every apply) |
| `/etc/nginx/muralink.htpasswd` | the auth gate |
| `/var/www/muralink-acme` | ACME challenge webroot |
| `~/.elio/deploy.json` | the answer sheet, mode 0600 |

Put your own nginx directives in a **separate** file under `conf.d/` — the
managed site is rewritten whenever the web-server step runs.

## Updating

```sh
git pull
sudo systemctl restart muralink-orchesterd
npx orchester-deploy apply build-web     # only if the frontend changed
```

## Troubleshooting

```sh
journalctl -u muralink-orchesterd -n 100 -f   # the daemon and everything it spawns
sudo nginx -t                                  # config syntax
sudo certbot certificates                      # what is issued and when it expires
npx orchester-deploy status                    # the whole checklist again
```

`Database — core not answering on :3001` almost always means the core crashed on
boot; the journal has the reason. `the core rejected the proxied token` means
`/etc/muralink/orchester.env` and the nginx site disagree about `ELIO_API_TOKEN`
— re-apply the web-server step.

See also [../self-hosting.md](../self-hosting.md).
