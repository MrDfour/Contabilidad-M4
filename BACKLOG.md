# BACKLOG — Contabilidad M4 Pro

> Trabajo pendiente acordado FUERA de los planes ejecutados. Cada ítem lista el
> contexto, el problema y la propuesta. Los planes cerrados (PLAN_POLIZAS,
> PLAN_MULTI_CLIENTE, PLAN_SYNC_KV, PLAN_FUSION_BOVEDA, REFACTORING) ya cumplieron
> y quedaron RETIRADOS del repositorio el 2026-10-23 (historial en git); esto es lo
> que sigue vivo: este BACKLOG y el único plan activo, PLAN_CHEQUES.
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

- **Contexto:** hoy el worker acepta cualquier `{version}`; un atacante con `vaultId` puede sobrescribir con una versión inferior. NOTA v0.9.8: el CLIENTE ya protege la integridad propia con el chequeo pre-publicación (GET del vigente + conflicto/absorber + `max(remota, local)+1`), que elimina las colisiones casuales de versión; lo que queda expuesto es el PUT directo malicioso.
- **Propuesta:** el worker compara contra la versión vigente y rechaza el PUT con `version <= actual` (HTTP 409 o equivalente): fuerza a que el emisor supere la huella del estado vigente y conserva el historial intacto para recuperación. Cambio acotado con tests de worker; el cliente ya está alineado con la semántica (debe re-chequear y aplicar conflicto al recibir 409).

## BL-4 · Purga remota coordinada de la bóveda

- **Contexto:** heredado de PLAN_SYNC_KV §7: hoy "desalistar" quita las credenciales del dispositivo, pero el documento remoto y su historial siguen viviendo en KV (por diseño: alguien más puede estar sincronizado). Falta el flujo "esta bóveda se disuelve": si el dispositivo fuente (creador) queda solo, borrar `vlt:<id>:actual` + historial vía un endpoint dedicado.
- **Propuesta:** endpoint `DELETE /api/vault/<id>` controlado por el token de control de BL-1 (por eso conviene resolver BL-1 primero o conjuntamente) + opción de UI en SyncModal ("Disolver bóveda remota") con doble confirmación.

## EJECUTADO/ · BL-6 · Fusión de bóveda por hora de captura (tercer botón del conflicto)

> **EJECUTADO el 2026-10-20 en v0.9.9** (fases A–D del plan de fusión de
> bóveda, retirado del repo; el detalle vivo de la mecánica está en
> ARCHITECTURE.md §6):
> lib pura `src/lib/unionBovedas.ts` (`analizarFusion`/`aplicarFusion`),
> motor (`contenidoConflicto` + `aplicarSnapshotFusionado` con publicación
> `max+1` forzada y huella anti-eco saltable), tercer botón "Fusionar ambos" en
> `ConflictoBovedaModal` con pantalla de revisión `FusionBovedaModal`
> (folios en disputa por elemento, duplicados con checkbox, bloqueo sin
> decisiones) y acción manual "Asignar pendientes" en la vista de Pólizas
> (folio 0 → siguiente disponible por captura). PRUEBA MANUAL
> MULTI-DISPOSITIVO CONFIRMADA por el usuario el 2026-10-20 (PC + móvil:
> "funciona perfecto"). Ítem CERRADO en su totalidad.

- **Contexto:** v0.9.8 ya estampa `capturadoEn`/`editadoEn` en cada póliza (silencio total de UI/SAT), la UI hace "conservar una" con aviso de historial y existe restauración desde historial. Falta el tercer camino: **"Fusionar ambos"** en `ConflictoBovedaModal`.
- **REGLAS DECIDIDAS (sesión 2026-10-20):**
  1. **Folios** — revisión explícita: los folios colisionantes (MISMO tipo) van a una pantalla de decisión por elemento con tres opciones:
     a. **Re-foliar por hora de captura** (los del conflicto se re-ordenan con `nextPolizaFolio`),
     b. **Folio pendiente** (póliza entrante queda sin folio asignado, mostrada como "pendiente" y asignable después),
     c. **Al final consecutivo** (el entrante toma el siguiente folio disponible del tipo y se va al final).
     Los entrantes SIN colisión conservan su folio tal cual; los locales nunca se re-folian los gana la elección.
  2. **Mismo `id` editado en ambos dispositivos**: gana el `editadoEn` más reciente, con reporte posterior del merge.
  3. **Borrados NO en v1**: el merge solo une ALTAS (el caso típico: capturas paralelas); snapshot queda v3 (sin tumbstones). Borrar mientras el otro captura sigue siendo conflicto del modal actual.
  4. **Dominios no foliables**: inventarios finales y catálogo de empresas quedan del dispositivo que dispara el merge; cuentas y activos fijos se pueden unir por `id` (si el `id` ya existe, gana el local).
  5. **Duplicados sospechosos** (mismo tipo+fecha+concepto): van al **listado de revisión ANTES de aplicar**; el usuario incluye/excluye cada uno. Nada se aplica sin pasar por ahí.
- **Flujo previsto:** conflicto → botón "Fusionar ambos" → previsualización (pólizas a sumar · ediciones que ganan · colisiones de folio con sus 3 opciones · duplicados sospechosos) → decisiones → aplicar snapshot fusionado → publicar como versión nueva para TODA la bóveda (los otros dispositivos lo absorben por vía normal an K-7).
- **Alcance tentativo:** nueva API `fusionar(snapshotRemoto)` en el puente (App orquesta los hooks), componente de revisión/decisión de folios, tests del motor con snapshots divergentes (incluido el caso "misma póliza capturada por accidente en dos dispositivos").

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
