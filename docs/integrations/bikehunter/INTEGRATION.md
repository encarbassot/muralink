# Integrar Mural en BikeHunter

> Guía para el equipo de BikeHunter: montar el pinboard Mural (notas,
> recordatorios, contactos, calendario) dentro del back office Rails,
> compartido entre empleados a través de vuestro propio servidor.
>
> **Filosofía:** *we don't want your data, you own the code.* Todo lo que se
> instala aquí es open source (MIT), corre en vuestra infraestructura, y los
> datos viven por defecto en el navegador de cada empleado. Nada llega a
> nuestros servidores salvo que un usuario active el backup cifrado.

## Arquitectura

```
Navegador empleado
├── Rails (Devise session) ──── vuestro código, sin cambios de lógica
└── <MuralBoard>  (React, Vite)
      ├── espacio "local"      → IndexedDB del navegador (por defecto)
      └── espacio "Servidor"   → nginx /elio/api/ → Mural core :3001 (vuestro EC2)
                                  └── sqlite en platforms/data/bikehunter.db
```

Cada nota/recordatorio/contacto/evento vive en **un** espacio. Lo personal se
queda en local; lo que un empleado guarda en "Servidor" lo ven todos (refresco
cada 30 s y al volver el foco).

## 1. Servidor (una vez, en el EC2)

```bash
sudo mkdir -p /opt/elio && sudo chown ubuntu /opt/elio
git clone <repo-elio> /opt/elio && cd /opt/elio && npm install

# unit + env (editad ELIO_API_TOKEN: openssl rand -hex 32)
sudo cp instances/bikehunter/deploy/elio-orchester.service /etc/systemd/system/
sudo cp instances/bikehunter/deploy/elio.env /etc/default/elio && sudo $EDITOR /etc/default/elio
sudo systemctl daemon-reload && sudo systemctl enable --now elio-orchester

curl -s localhost:3001/health   # → {"ok":true,...}
```

nginx: añadid [`deploy/nginx-elio.conf`](../../../instances/bikehunter/deploy/nginx-elio.conf)
dentro del `server {}` existente. Mismo origen ⇒ sin CORS.

**Backup:** incluid `platforms/data/` (sqlite + WAL) en vuestra rutina de backups.

## 2. Frontend (vuestro repo Rails)

Ya tenéis el patrón exacto: es el mismo que `_pinboard.html.erb` + Vite.

```bash
yarn add @muralink/embed react react-dom   # React 19 ya lo tenéis — compatible
```

Nueva entry `app/frontend/entrypoints/elio-pinboard.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import { MuralBoard, type MuralUser } from '@muralink/embed'

function readMeta(name: string): string | null {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null
}

function mount() {
  const el = document.getElementById('elio-pinboard-root')
  if (!el || el.dataset.mounted) return          // idempotente (Turbo)
  el.dataset.mounted = 'true'

  const user = JSON.parse(readMeta('pinboard-user') ?? 'null') as MuralUser | null
  const token = readMeta('elio-token')

  createRoot(el).render(
    <MuralBoard
      theme="light"
      user={user ?? undefined}
      spaces={token ? { orchester: { baseUrl: '/elio', token, label: 'Servidor' } } : undefined}
    />,
  )
}

mount()
document.addEventListener('turbo:load', mount)
```

Partial (mismo esquema que `_pinboard.html.erb`, con `data-turbo-permanent` y
`begin/rescue` para degradar sin manifest):

```erb
<% if user_signed_in? %>
  <meta name="pinboard-user" content="<%= { id: current_user.id, name: current_user.name, role: current_user.role }.to_json %>">
  <meta name="elio-token" content="<%= ENV['ELIO_API_TOKEN'] %>">
  <div id="elio-pinboard-root" data-turbo-permanent></div>
  <%= vite_javascript_tag 'elio-pinboard.tsx' %>
<% end %>
```

### Opción: dashboard recursivo en vez de pestañas

`MuralBoard` (arriba) es el workspace por pestañas. Para la experiencia completa
del frontend Mural —grid bento con widgets arrastrables/redimensionables,
sub-dashboards anidados y editor markdown en modal— usad **`MuralDashboard`** en
su lugar (es lo que monta el `Drawer.tsx` del pinboard):

```tsx
import { MuralDashboard } from '@muralink/embed'

<MuralDashboard
  theme="dark"
  tokens={ELIO_TOKENS}          // puente --pb-* → tokens Mural
  user={user ?? undefined}
  spaces={token ? { orchester: { baseUrl: '/elio', token, label: 'Servidor' } } : undefined}
  columns={4}
  storageKey={`pb:${user.id}:board`}   // namespace de localStorage por empleado
/>
```

El layout del tablero (qué widget en qué celda/tamaño, sub-dashboards) persiste
en `localStorage` bajo `grid:<storageKey>...`; el contenido de cada widget
(notas, contactos, eventos, recordatorios) va a los espacios de almacenamiento
(local / Servidor / nube) como el resto.

Notas:

- **CSRF:** no aplica — Mural habla con su propio API por Bearer token, nunca
  con controllers Rails.
- **Estilos:** todo va scoped bajo `.mural-root` (tokens CSS propios); no toca
  vuestro Tailwind ni hereda su preflight en la práctica — si algún input se ve
  raro, envolved el drawer en un contenedor con `all: revert` o reportadlo.
- **Token compartido (MVP):** cualquier empleado logueado ve el token; la
  atribución (`createdBy` vía `X-Mural-User`) es de confianza, no autenticada.
  Con 10 empleados es razonable; tokens por usuario son la siguiente iteración.

## 3. Vuestros clientes dentro de Mural (opcional, milestone 2)

2.000+ clientes ya viven en vuestro Rails/Chargebee/HubSpot — no se migran, se
adaptan. Exponéis **un endpoint** de búsqueda y registráis un adapter:
el módulo de contactos los muestra en solo-lectura con enlace a vuestra ficha.
Guía completa con ejemplo Rails: [README de @muralink/module-contacts](../../../modules/contacts/README.md).

## 4. Backup cifrado en la nube (opcional, por usuario)

Un empleado puede activar el espacio "Nube (cifrado)": los items se cifran
AES-GCM **en su navegador** con una passphrase que nunca sale del dispositivo;
nuestro tunnel solo almacena ciphertext. Perder la passphrase = backup
irrecuperable, por diseño.

## 5. Actualizaciones / "you own the code"

- Paquetes npm `@muralink/*` (MIT) + repo público espejo: tenéis copia completa.
- Actualizar frontend = `yarn upgrade @muralink/embed`. Actualizar servidor =
  `git pull && npm install && sudo systemctl restart elio-orchester`.
- Si Mural desaparece mañana, todo esto sigue funcionando y podéis mantenerlo.

## Verificación rápida

1. `curl https://<backoffice>/elio/health` → `{"ok":true}`.
2. Abrid el pinboard, cread una nota, selector "Servidor" en la cabecera de la
   nota → moved la nota.
3. Otro empleado (u otro navegador) abre el pinboard → la nota aparece en ≤30 s
   o al recuperar el foco.
