# BACKLOG — Contabilidad M4 Pro

> Trabajo pendiente acordado FUERA de los planes ejecutados. Cada ítem lista el
> contexto, el problema y la propuesta. Los planes cerrados (PLAN_POLIZAS,
> PLAN_MULTI_CLIENTE, PLAN_SYNC_KV) ya cumplieron; esto es lo que sigue vivo.
>
> Convenio de registro: al ejecutar un ítem se pasa su entrada a "EJECUTADO/"
> con fecha y referencia del commit (o se cancela con porqué).

---

## BL-1 · Blindaje del relay: token de alistamiento en escrituras

- **Contexto:** el relay (`worker/src/relay.ts`) no exige `Authorization` — cualquier persona con la URL puede hacer PUT válido-formateado; y quien además conozca un `vaultId` (viaja en el QR de alistamiento) puede sobrescribir sus blobs. La confidencialidad no se compromete (E2EE: el relay solo ve cifrado opaco), pero la integridad y la disponibilidad (cuotas de KV) sí quedan expuestas.
- **Propuesta:** al crear la bóveda, el dispositivo creador genera un token de control aleatorio; el worker lo persiste junto al vault (`vlt:<id>:control`) y exige `Authorization: Bearer <token>` en PUT y lectura de historial. El token viaja al resto de dispositivos por el canal de alistamiento ya existente (QR/frase → `secretKey`; extender el payload QR con el campo del token, sincronizado también por el sobre inicial).
- **Alcance:** `worker/src/relay.ts` (+ tests de worker), `src/services/vaultService.ts` (payload QR/alistamiento), `vaultSyncEngine.ts` (header de autorización), verificación de compatibilidad de bóvedas ya creadas (migración o política "solo bóvedas nuevas").

## BL-2 · Rate limiting del relay por IP

- **Contexto:** spam de requests contra el relay quemaría el presupuesto diario de KV del free tier (1 000 escrituras/día, 100 000 lecturas/día) y mataría la sincronización propia por disponibilidad. El BL-1 de tokens cubre integridad; el rate limit cubre abuso anónimo de volumen (incluye los GET/POST baratos no autenticables).
- **Propuesta:** binding `ratelimit` de Cloudflare en el Worker (por ejemplo 30 req/min por IP para PUT/POST, ventana más holgada para lecturas) o, en su defecto, un contador por IP en KV con ventana de conteo barata. Idealmente después de BL-1, porque el bearer ya bloquea la mayoría del abuso autenticado.

## BL-3 · Monotonicidad de versiones en el PUT del relay

- **Contexto:** hoy el worker acepta cualquier `{version}`; un atacante con `vaultId` puede sobrescribir con una versión inferior (la app local la ignoraría por K-7, pero el blob bueno se pierde del slot "actual" salvo que el historial lo conserve).
- **Propuesta:** el worker compara contra la versión vigente y rechaza el PUT con `version <= actual` (HTTP 440 conflicto de versión o equivalente): fuerza a que el emisor supere la huella del estado vigente y conserva el historial intacto para recuperación. Cambio acotado con tests de worker; riesgo bajo de regresión en el motor (que ya publica con `max+1` en conflicto, DV-K-7).

## BL-4 · Purga remota coordinada de la bóveda

- **Contexto:** heredado de PLAN_SYNC_KV §7: hoy "desalistar" quita las credenciales del dispositivo, pero el documento remoto y su historial siguen viviendo en KV (por diseño: alguien más puede estar sincronizado). Falta el flujo "esta bóveda se disuelve": si el dispositivo fuente (creador) queda solo, borrar `vlt:<id>:actual` + historial vía un endpoint dedicado.
- **Propuesta:** endpoint `DELETE /api/vault/<id>` controlado por el token de control de BL-1 (por eso conviene resolver BL-1 primero o conjuntamente) + opción de UI en SyncModal ("Disolver bóveda remota") con doble confirmación.

## BL-5 · Respaldos cifrados remotos con la misma lib AES-GCM

- **Contexto:** heredado de PLAN_SYNC_KV §7: el traspaso de la bóveda de sync al sistema de respaldo necesita diseño previo: el snapshot v3 de respaldo como blob cifrado en un segundo KV (o el mismo namespace con prefijo distinto `bkp:`) usando `src/lib/crypto.ts`.
- **Propuesta de diseño primero, código después:** definir cadencia (semanal?), quota y viaje de la clave: la clave de respaldo deriva de la frase o es un segundo secreto del sobre; el worker reutiliza todo el mecanismo de claves con otro prefijo.

---

## Limpiezas menores (sin urgencia, al pasar)

| Ítem | Detalle |
|---|---|
| `GEMINI_API_KEY` heredado | `vite.config.ts` define `process.env.GEMINI_API_KEY` pero NINGÚN módulo de `src/` lo consulta (stub heredado de AI Studio). Retirarlo del define y de `.env.example` (o culminar la feature si algún día se usa). |
| Secrets GitHub sin uso | `UPSTASH_URL` y `UPSTASH_TOKEN` quedaron huérfanos con la Fase 6 (Upstash retirado): borrarlos de Settings → Secrets. |
| `APP_URL` en `.env.example` | Sin consumidor en `src/`; evaluar retirar con la limpieza anterior. |
| Iconos `public/icon.ico/.icns` | electron-builder los referencia en `package.json` pero no existen en el repo (Android/ escritorio usan mipmap/defaults). Generar desde el icono PWA o limpiar la config. |
