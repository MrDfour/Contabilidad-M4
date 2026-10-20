# Relay de la bóveda (Cloudflare Workers + KV)

Relay propio para la sincronización Escritorio ↔ Móvil de Contabilidad M4 Pro.
Almacena documentos cifrados y los redistribuye. **Nunca puede leer el
contenido**: solo transporta blobs cifrados con AES-GCM que, para él, son
siempre datos opacos.

Este servicio nace del plan `PLAN_SYNC_KV.md` y sustituye a la capa anterior
(PeerJS + Upstash Redis + PIN), eliminada de la app en la misma versión.

## Qué almacena

| Clave KV | Contenido | Duración |
| --- | --- | --- |
| `vlt:<vaultId>:actual` | Documento vigente `{version, updatedAt, deviceLabel, blob}` | sin expiración |
| `vlt:<vaultId>:hist:<1..5>` | Estados anteriores (máximo 5, K-8) | 30 días |

Presupuesto: el motor de la app ya ajusta el consumo (debounce de 1.5 s +
coalescing de 120 s, K-5) para caber en el plan gratuito de KV
(1 000 escrituras y 100 000 lecturas por día).

## Endpoints

| Método | Ruta | Respuesta |
| --- | --- | --- |
| GET | `/health` | `{status:"ok"}` — verificación del lado de la app |
| PUT | `/api/vault/:id/state` | `{success, version}` — guarda, archiva historial y notifica por WebSocket |
| GET | `/api/vault/:id/state?version=n` | `{success, noChanges, payload?}` — consulta barata (sondeo) |
| GET | `/api/vault/:id/history` | `{success, history}` — solo metadatos, sin blobs |
| WS | `/ws?vaultId=<id>` | `remote_state` en vivo; mensajes `ping` y `pong` |

Formato de `vaultId`: `vlt_` seguido de 12 caracteres hexadecimales. El historial
solo archiva cuando el documento entrante tiene versión mayor que el vigente.

## Despliegue

### 1. Namespace KV

```bash
npx wrangler login
npx wrangler kv:namespace create CONTABILIDAD_VAULT
```

El comando imprime el identificador del namespace. **Pégalo en
`worker/wrangler.toml`** en lugar del marcador `REEMPLAZAR_ID`. También se puede
crear desde el panel de Cloudflare (sección KV; el binding debe llamarse
`CONTABILIDAD_VAULT`).

### 2. Desplegar manualmente

```bash
npx wrangler deploy
```

### 3. Desplegar con GitHub Actions (recomendado)

El workflow `.github/workflows/deploy-relay.yml` se ejecuta a mano
(`workflow_dispatch`) desde la pestaña **Actions** del repositorio. Requiere
configurar en **Secrets** del repositorio:

- `CLOUDFLARE_API_TOKEN`: token con permiso de edición de *Workers* (plantilla
  "Edit Cloudflare Workers", que incluye KV).
- `CLOUDFLARE_ACCOUNT_ID`: identificador de la cuenta, visible en el panel de
  Cloudflare (Workers & Pages).

### 4. Desarrollo local

```bash
npx wrangler dev
```

Con el relay local corriendo, la app lo apunta con `VITE_RELAY_URL=http://localhost:8787`
en un archivo `.env` (solo se aplica al compilar o reiniciar el servidor Vite).

## Pruebas

Las pruebas del relay viven en `worker/tests/relay.test.ts` y corren en la red de
pruebas raíz del proyecto (`npm run test`; la configuración raíz incluye
`worker/tests/**`). Son 19 pruebas con KV simulado.

## Nota sobre el WebSocket

El broadcast de `remote_state` vive en la memoria del runtime del worker: es de
mejor esfuerzo (los PUT y los WebSocket no siempre aterrizan en la misma
instancia). La coherencia final la garantiza el sondeo pasivo de la app
(60 segundos), que actúa como red de seguridad del diseño.
