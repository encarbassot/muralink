// nginx integration — the orchester owns one nginx site and nothing else.
//
// Why nginx at all when packages/orchester already ships an https-gateway: the
// gateway is a Node TLS terminator good for a LAN box, but a public deployment
// wants the thing the OS already supervises — real ACME renewal, HTTP/2, range
// requests, static caching, and a place to put the auth gate. So on a server
// deployment nginx becomes the public endpoint and the Node gateway stays off.
//
// The single most important decision encoded here: **the browser never holds
// the core's API token**. platforms/web bakes its token into the JS bundle, so
// a publicly reachable frontend would hand every visitor full instance access.
// Instead nginx authenticates the human (a signed session cookie, checked via
// auth_request against the frontend server) and rewrites Authorization to the
// master bearer token on the way upstream. The token stays on the box.
//
// This file only renders and applies config; it decides nothing about certs
// (certs.ts) or about when to run (steps.ts). A future apache.ts implements the
// same WebServerIntegration shape.

import { existsSync } from 'node:fs'
import { run, runPrivileged, which, writePrivileged, type RunResult } from './system'

export const ACME_WEBROOT = '/var/www/muralink-acme'
export const SITE_NAME = 'muralink'

export interface NginxSiteConfig {
  // Public hostname. Also the cert CN.
  domain: string
  // Extra names answered by the same site (e.g. a LAN IP or bare host).
  aliases?: string[]
  // Plain-HTTP upstream: the orchester's web-frontend service.
  upstreamPort: number
  upstreamHost?: string
  // 'http' serves plainly on :80 (pre-certificate, and how ACME HTTP-01 gets
  // validated). 'https' adds the TLS server and redirects :80 to it.
  mode: 'http' | 'https'
  certPath?: string
  keyPath?: string
  // When set, nginx requires a valid session and injects this bearer token
  // upstream. Absent = no gate: only correct on a trusted LAN.
  apiToken?: string
  // Upload ceiling. 0 = unlimited (self-host default — it is your disk).
  maxBodySize?: string
}

export interface NginxStatus {
  installed: boolean
  binary: string | null
  version: string | null
  running: boolean
  // Our site is present AND symlinked/enabled.
  siteEnabled: boolean
  sitePath: string
  configValid: boolean | null
}

// Debian keeps sites-available/sites-enabled; RHEL and Arch just glob conf.d.
// Detect from the filesystem rather than from the distro id — a hand-built
// nginx on Debian may well use conf.d only.
export function siteLayout(): { available: string; enabled: string | null; path: string } {
  if (existsSync('/etc/nginx/sites-available')) {
    return {
      available: `/etc/nginx/sites-available/${SITE_NAME}.conf`,
      enabled: `/etc/nginx/sites-enabled/${SITE_NAME}.conf`,
      path: `/etc/nginx/sites-available/${SITE_NAME}.conf`,
    }
  }
  const p = `/etc/nginx/conf.d/${SITE_NAME}.conf`
  return { available: p, enabled: null, path: p }
}

export async function nginxStatus(): Promise<NginxStatus> {
  const binary = which('nginx')
  const layout = siteLayout()
  if (!binary) {
    return {
      installed: false, binary: null, version: null, running: false,
      siteEnabled: false, sitePath: layout.path, configValid: null,
    }
  }
  const ver = await run('nginx', ['-v'])
  // nginx prints its version banner on stderr.
  const version = /nginx\/([\d.]+)/.exec(`${ver.stderr}${ver.stdout}`)?.[1] ?? null

  const active = which('systemctl')
    ? (await run('systemctl', ['is-active', 'nginx'])).stdout.trim() === 'active'
    : (await run('pgrep', ['-x', 'nginx'])).ok

  const enabledPath = layout.enabled ?? layout.available
  const siteEnabled = existsSync(enabledPath)
  const test = siteEnabled ? await runPrivileged('nginx', ['-t']) : null

  return {
    installed: true,
    binary,
    version,
    running: active,
    siteEnabled,
    sitePath: layout.path,
    configValid: test ? test.ok : null,
  }
}

// The rendered site. Kept as one template on purpose — a self-hoster is
// expected to read this file, and a config assembled from fragments is much
// harder to audit than one they can diff against nginx docs.
export function renderSite(cfg: NginxSiteConfig): string {
  const upstreamHost = cfg.upstreamHost ?? '127.0.0.1'
  const names = [cfg.domain, ...(cfg.aliases ?? [])].join(' ')
  const maxBody = cfg.maxBodySize ?? '0'
  const gated = Boolean(cfg.apiToken)

  const proxyCommon = `
        proxy_http_version    1.1;
        proxy_set_header      Host              $host;
        proxy_set_header      X-Real-IP         $remote_addr;
        proxy_set_header      X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header      X-Forwarded-Proto $scheme;
        # Websocket/SSE upgrade passthrough (collab spaces, live logs).
        proxy_set_header      Upgrade           $http_upgrade;
        proxy_set_header      Connection        $connection_upgrade;
        # Media streaming and bulk uploads must not be buffered through nginx,
        # and a slow chunked upload must not trip the default 60s read timeout.
        proxy_buffering       off;
        proxy_request_buffering off;
        proxy_read_timeout    3600s;
        proxy_send_timeout    3600s;`

  // Auth block. The gate is a signed session cookie, checked by asking the
  // frontend server through auth_request. Not basic auth: the browser's own
  // credential dialog cannot be styled, cannot be logged out of, and on a typo
  // several browsers will not re-prompt without clearing site data.
  //
  // The 401 from auth_request is turned into the login *page* rather than
  // passed through, so a browser never sees a WWW-Authenticate challenge.
  const authBlock = gated
    ? `
        auth_request          /__auth;
        error_page 401        = @login;

        # The browser is authenticated by the session cookie; the CORE is
        # authenticated by this header. Overwriting it here is what keeps the
        # master token off the client.
        proxy_set_header      Authorization "Bearer ${cfg.apiToken}";`
    : `
        # No auth gate configured — every reader of this address has full
        # instance access. Only acceptable on a trusted LAN.`

  // The three ungated paths. They serve no instance data: /__auth answers the
  // subrequest, /__login takes a password, /__logout drops the cookie.
  const authLocations = gated
    ? `
    location = /__auth {
        internal;
        proxy_pass              http://muralink_frontend;
        proxy_pass_request_body off;
        proxy_set_header        Content-Length "";
        proxy_set_header        Host   $host;
        proxy_set_header        Cookie $http_cookie;
    }

    # Where an unauthenticated request lands. 302 rather than rendering in
    # place, so the address bar matches what is on screen and a refresh after
    # signing in returns to the page that was asked for.
    location @login {
        return 302 /__login?next=$request_uri;
    }

    location ^~ /__login {
        proxy_pass http://muralink_frontend;${proxyCommon}
    }

    location = /__logout {
        proxy_pass http://muralink_frontend;${proxyCommon}
    }
`
    : ''


  const header = `# Managed by the Muralink orchester (packages/orchester/src/deploy/nginx.ts).
# Rewritten whenever the deploy wizard applies the web-server step — put your
# own directives in a separate file under conf.d/ so they survive.

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream muralink_frontend {
    server ${upstreamHost}:${cfg.upstreamPort};
    keepalive 16;
}
`

  const acmeLocation = `
    # ACME HTTP-01. Stays on :80 forever: renewals must not depend on the very
    # certificate they are renewing.
    location ^~ /.well-known/acme-challenge/ {
        root          ${ACME_WEBROOT};
        default_type  "text/plain";
        auth_basic    off;
    }
`

  if (cfg.mode === 'http') {
    return `${header}
server {
    listen      80;
    listen      [::]:80;
    server_name ${names};

    client_max_body_size ${maxBody};
${acmeLocation}${authLocations}
    location / {
        proxy_pass http://muralink_frontend;${proxyCommon}${authBlock}
    }
}
`
  }

  return `${header}
server {
    listen      80;
    listen      [::]:80;
    server_name ${names};
${acmeLocation}
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen      443 ssl;
    listen      [::]:443 ssl;
    http2       on;
    server_name ${names};

    ssl_certificate     ${cfg.certPath};
    ssl_certificate_key ${cfg.keyPath};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:MuralinkTLS:10m;
    ssl_session_timeout 1d;

    # HSTS is deliberately short: a self-hoster who later drops TLS should not
    # brick their own browsers for two years.
    add_header Strict-Transport-Security "max-age=86400" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header Referrer-Policy           "same-origin" always;

    client_max_body_size ${maxBody};
${authLocations}
    location / {
        proxy_pass http://muralink_frontend;${proxyCommon}${authBlock}
    }
}
`
}

export interface ApplyResult {
  ok: boolean
  path: string
  // stderr of whichever step failed — surfaced verbatim in the wizard.
  message: string
}

// Write the site, enable it, validate, reload. Validation happens BEFORE the
// reload and a failed validation leaves the running nginx untouched, so a bad
// render can never take the box off the air.
export async function applySite(cfg: NginxSiteConfig): Promise<ApplyResult> {
  const layout = siteLayout()
  const content = renderSite(cfg)

  const mk = await runPrivileged('mkdir', ['-p', ACME_WEBROOT])
  if (!mk.ok) return { ok: false, path: layout.path, message: `mkdir ${ACME_WEBROOT}: ${mk.stderr}` }

  const written = await writePrivileged(layout.available, content, '0644')
  if (!written.ok) return { ok: false, path: layout.path, message: `write site: ${written.stderr}` }

  if (layout.enabled) {
    // -f so re-running the step is idempotent, -n so we never chase a symlink
    // into a directory and nest the link inside it.
    const link = await runPrivileged('ln', ['-sfn', layout.available, layout.enabled])
    if (!link.ok) return { ok: false, path: layout.path, message: `enable site: ${link.stderr}` }
    // Debian's stock `default` site owns port 80 with server_name _ and would
    // shadow ours on a bare-IP request. Removing the symlink leaves the file.
    if (existsSync('/etc/nginx/sites-enabled/default')) {
      await runPrivileged('rm', ['-f', '/etc/nginx/sites-enabled/default'])
    }
  }

  const test = await runPrivileged('nginx', ['-t'])
  if (!test.ok) return { ok: false, path: layout.path, message: `nginx -t failed:\n${test.stderr}` }

  const reload = await reloadNginx()
  if (!reload.ok) return { ok: false, path: layout.path, message: `reload: ${reload.stderr}` }

  return { ok: true, path: layout.path, message: `site applied (${cfg.mode}) → ${layout.path}` }
}

export async function reloadNginx(): Promise<RunResult> {
  if (which('systemctl')) {
    // `reload` on a stopped unit is an error; start it in that case.
    const active = await run('systemctl', ['is-active', 'nginx'])
    const verb = active.stdout.trim() === 'active' ? 'reload' : 'start'
    return runPrivileged('systemctl', [verb, 'nginx'])
  }
  return runPrivileged('nginx', ['-s', 'reload'])
}

