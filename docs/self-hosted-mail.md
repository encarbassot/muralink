# Correo local (self-hosted)

Cómo una instancia se convierte en el servidor de correo de un dominio, y qué
partes no puede hacer el software por ti.

## El camino del usuario

App **Correo** → botón **+ Añadir correo** → menú:

| Opción | Estado |
|---|---|
| Gmail | muted — pendiente de la API de Google |
| Outlook | muted — pendiente de la API de Microsoft |
| **Añadir cuenta local** | tag `advanced` → abre el asistente |

El asistente tiene 5 pasos: **Requisitos → Dirección → DNS → Puertos → Activar**.

## Qué hace el asistente

1. **Requisitos** — dice en voz alta lo que hace falta: dominio con acceso al
   DNS, IP pública fija, puerto 25 de salida (bloqueado en casi todo ISP
   doméstico) y PTR que solo puede poner el proveedor de la IP.
2. **Dirección** — buzón + dominio (`hello@elioputo.mural.ink`), IP pública
   (a mano o con el botón *Detectar*, que es la única llamada de red no
   solicitada… y va solo si la pulsas), email para el certificado TLS, y en
   avanzadas el selector DKIM y los puertos. Al continuar el servidor genera
   el par **DKIM RSA-2048**: la privada se queda en SQLite, la pública se
   publica en el DNS.
3. **DNS** — la lista de registros a publicar, con botón *Copiar* por registro
   y *Comprobar DNS*, que resuelve cada uno contra el resolver del sistema.
4. **Puertos** — qué abrir en firewall y router, con el snippet de `ufw`.
5. **Activar** — arma el servicio y muestra el bloque `ELIO_MAIL_*` para que la
   config sobreviva a un despliegue desde cero.

## Registros DNS que genera

Para `elioputo.mural.ink` con selector `default` e IP `203.0.113.10`:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `mail.elioputo.mural.ink` | `203.0.113.10` |
| MX (10) | `elioputo.mural.ink` | `mail.elioputo.mural.ink.` |
| TXT | `elioputo.mural.ink` | `v=spf1 mx -all` |
| TXT | `default._domainkey.elioputo.mural.ink` | `v=DKIM1; k=rsa; p=<pública>` |
| TXT | `_dmarc.elioputo.mural.ink` | `v=DMARC1; p=quarantine; adkim=s; aspf=s; rua=mailto:hello@…` |
| PTR | `203.0.113.10` | `mail.elioputo.mural.ink.` |
| A *(opcional)* | `autoconfig.elioputo.mural.ink` | `203.0.113.10` |

El PTR **no** se pone en el registrador: lo configura quien te da la IP. Sin
PTR, Gmail y Outlook mandan a spam o rechazan.

## Puertos

| Puerto | Dirección | Para qué | ¿Obligatorio? |
|---|---|---|---|
| 25 | entrada | recibir SMTP | sí |
| 25 | salida | entrega directa a los MX de destino | sí (y el que suele estar bloqueado) |
| 80 | entrada | reto ACME HTTP-01 del certificado TLS | sí |
| 587 | entrada | submission STARTTLS para clientes externos | no (la webmail envía por HTTP) |
| 465 | entrada | submission con TLS implícito | no |
| 993 | entrada | IMAPS | no (fase 2) |

## Cómo está montado

- **Config** — tabla `mail_setup` (fila única) en la BD del módulo. Las
  `ELIO_MAIL_*` solo **siembran** una instalación nueva; lo que escribe el
  asistente manda. `effectiveMailConfig(db, env)` es el merge que usan tanto la
  API como el daemon.
- **API** — `/api/mail/setup` (`status`, `POST /`, `dns`, `ports`, `verify`,
  `detect-ip`, `enable`). Montada **siempre**, también con el correo apagado:
  el asistente es justo lo que enciende el servicio, así que gatearlo sería
  circular. `/api/mail` entero sigue detrás de `requireInstalled(db, 'mail')`.
- **Clave DKIM privada** — nunca sale del servidor; la API expone solo la
  pública. Cambiar el selector regenera el par (y obliga a republicar el TXT).
- **Verificación** — `verifyDns` usa el resolver del sistema; `verifyPorts`
  solo comprueba que haya un listener en `127.0.0.1`. Que el puerto 25 sea
  alcanzable **desde fuera** necesita un sondeo externo, que hoy no existe: la
  prueba honesta es mandarse un correo desde otra cuenta.

## Lo que todavía no funciona

El daemon (`platforms/server/src/mail-server/daemon.ts`) arranca con la config
correcta pero **no tiene listeners SMTP**: recibir y enviar siguen pendientes
(ver `modules/mail/IMPLEMENTATION_STATUS.md`). Con el asistente completo tienes
config, claves y registros reales — falta el transporte.
