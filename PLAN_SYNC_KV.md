# PLAN_SYNC_KV.md — Sincronización Cloudflare KV (bóveda E2EE)

> **ESTADO: EN CURSO** — reemplaza la capa de sincronización Upstash Redis + PeerJS por un
> relay propio en Cloudflare Workers + Workers KV (presupuesto $0), con el modelo de bóveda
> persistente y E2EE de Teacher-Buddy. Documentado para el asistente; el usuario hace commit
> y push con GitHub Desktop después de cada fase con pruebas de humo.

> **CONVENIO DE EJECUCIÓN (octubre 2026):** este plan corre **de corrido, validado
> únicamente con la red de tests automatizados** (`npm run lint && npm run test && npm
> run build`, incluida la suite del worker). No hay pruebas de humo manuales por fase:
> el despliegue real del relay ocurre al final del plan vía GitHub Actions
> (`deploy-relay.yml` con `workflow_dispatch`, Secrets `CLOUDFLARE_API_TOKEN` y
> `CLOUDFLARE_ACCOUNT_ID`, igual que Teacher-Buddy), y después de ese despliegue el
> usuario ejecuta la prueba de humo completa de la bóveda. Motivo de este convenio: el
> relay solo existe en producción tras el deploy (el token lo ingresa el usuario por
> GitHub Secrets — aunque el relay es agnóstico gracias al cifrado AES y nada dejara de
> ser seguro si quedara expuesto, es más limpio así). Hasta entonces, cada fase cierra
> con el gate en verde y el plan registra la fase en §7.

## 1. Contexto y problema

### Patología actual
- La sincronización escritorio↔móvil es una **sesión efímera**: pareo PIN/QR con TTL de 120 s
  en Upstash Redis. Los tokens expiraron y el flujo quedó muerto, sin forma de autocuración.
- Dos transportes en paralelo (PeerJS WebRTC primario + Redis de respaldo) = código duálico
  frágil (`SyncModal` orquesta ambos caminos).
- El PIN y sus contadores de bloqueo viven como comandos Redis (~10 operaciones por flujo).

### Lo que se rescata de Teacher-Buddy (`../Teacher-Buddy`)
- **Relay Worker con KV**: claves de una sola lectura (`meta`-pointer) para que el sondeo de
  "¿hay cambios?" cueste 1 `get()` y 0 `list()` (la cuota de `list` es 1,000/día; `get` es
  100,000/día).
- **WebSocket en el Worker** (`/ws?vaultId=` + registro en memoria por bóveda): retransmisión
  en vivo de deltas → **latencia 0** con sondeo KV suspendido mientras la conexión esté viva.
- **Disciplina de cuota**: debounce de escrituras (1.5 s), sondeo pasivo (60 s) suspendido con
  pestaña oculta o WebSocket conectado.
- **E2EE nativo**: AES-GCM 256 vía Web Crypto (sin dependencias) y frase mnemónica amigable
  (128 palabras positivas en español) para respaldar la credencial en papel.

### Decisión del usuario
- **Alcance: Opción B (bóveda persistente)** — auto-sync continuo en segundo plano; el modal
  queda para el alistamiento de dispositivos y para resolver conflictos de doble escritura.
  Mitigación de riesgo: ruta por fases; la Fase 4 es opcional-encadenada pero cada fase queda
  con el sistema funcional y en verde.
- **Cifrado: E2EE AES-GCM sí** — y la librería de cifrado queda como base futura para
  respaldos de archivo cifrados (compromiso post-plan, ver §7).

## 2. Decisiones (K-1 … K-14)

- **K-1 — Transporte único.** Cloudflare Worker propio + KV. **Se elimina** Upstash Redis
  (funciones, env vars, PIN mapping) y **se elimina PeerJS** como transporte de sync: un solo
  camino HTTP+WS. El Worker vive en `worker/` de este repo (proyecto separado de `src/`,
  igual que en Teacher-Buddy).

- **K-2 — Bóveda persistente.** Cada dispositivo se **alista** una sola vez contra una bóveda
  (`vaultId` + secreto compartido). Después, el sync es automático en segundo plano: push con
  debounce al cambiar datos, pull pasivo para detectar remotos. El pareo efímero de sesión
  (PIN de 6 dígitos + TTL de 120 segundos) desaparece; el QR de alistamiento vive mientras
  el usuario
  quiera (se muestra bajo demanda en el modal).

- **K-3 — E2EE AES-GCM.** Cifrado en origen con Web Crypto (`lib/crypto.ts`, puro, sin
  dependencias): AES-GCM 256 + IV 96 bits + salt 128 bits por blob, algoritmo y versión
  dentro del sobre `{ ciphertext, iv, salt, algorithm, version }`. El relay solo ve bloques
  opacos: puede corromperlos jamás interpretarlos.

- **K-4 — Carga útil = formato v3 del respaldo.** El estado cifrado en la bóveda es el
  snapshot v3 que **ya existe**: `getSnapshot()` de `useBackup` (`empresas[] + activaId`,
  versión "3.0.0"). Aplicar lo remoto = reusar el camino de restauración v3 de `App.tsx`
  (`restore` + DV-C-3: v3 restaura TODAS las empresas). Consecuencias:
  - `SyncState`/`empresaId`/`empresaNombre` dejan de viajar: el snapshot completo incluye a
    todos los clientes; el "remoto apuntando a otra empresa" deja de existir como concepto.
  - No se reescribe ninguna lógica de datos → riesgo acotado al transporte.
  - El snapshot incluye el marcado `version`, `generatedAt`, `origin` (nuevo campo) para
    detección de conflicto y para telemetría en pantalla.

- **K-5 — Economía de cuota (escrituras es la cuota escasa: 1,000/día gratis).**
  - **Documento único por bóveda**: clave `vlt:<vaultId>:actual` con
    `{ version, updatedAt, deviceLabel, blob }`. Un push = **1 `put()`** (la versión vive
    dentro del mismo documento; el patrón meta-pointer de Teacher-Buddy está integrado ahí).
  - **Push**: debounce 1.5 s tras un cambio local; coalescing — si ya hizo un push hace menos
    de `SYNC_WRITE_GAP_MS` (120 s), solo levanta la bandera "sucio" y programa flush al vencer
    el intervalo. Flush inmediato en: cierre del modal, cambio de cliente (activaId), y
    `beforeunload`. Costo por push real: 1 `put()` del documento + hasta `HISTORIAL_MAX`
    `put()` del historial (K-8) — presupuesto diario sigue holgado (~500 escrituras pico).
  - **Pull**: sondeo pasivo cada 60 s = 1 `get()`. Suspendido si WebSocket conectado, si la
    pestaña está oculta, o si hay restauración/escritura en curso.
  - Presupuesto estimado por día activo: ~100–400 escrituras (captura intensiva), ~4,000
    lecturas. Holgado dentro del plan gratuito.

- **K-6 — WebSocket para latencia 0.** Endpoint `/ws?vaultId=` (retransmisión en memoria por
  instancia + persistencia KV del delta, como Teacher-Buddy). Mensaje de broadcast:
  `{ type: 'remote_state', payload: { version, deviceLabel, blob } }`. Al recibirlo el
  cliente resuelve el mismo camino del pull (con detección de conflicto). Degradación:
  si WS cae, sigue el sondeo pasivo de K-5. Heartbeat ping/pong cada 25 s.

- **K-7 — Regla de manos sucias (conflictos).** Cada dispositivo guarda localmente
  `contasis_vault_last_version` (última versión de la bóveda que vio/aplicó) y una
  `contasis_vault_dirty` (tiene cambios locales sin publicar):
  - **Solo remoto cambió** (remoto != last_version && !dirty): auto-aplicar por el camino de
    restauración + notificación (toast de éxito). Sin modal.
  - **Solo local cambió** (dirty && remoto == last_version): push normal.
  - **Ambos cambiaron** (remoto != last_version && dirty): **modal de conflicto** reutilizado
    ("Conservar datos locales" / "Sobrescribir con datos remotos"), con etiqueta de dispositivo
    y fecha del remoto. Al decidir, el ganador se publica y `last_version` se re-asienta.
  - Detección de versión del snapshot: si remoto carece de `version` (blob corrupto o
    dispositivo viejo) → tratar como conflicto (jamás aplicar a ciegas).

- **K-8 — Historial en el Worker.** Cada push guarda el estado anterior en
  `vlt:<vaultId>:hist:<n>` (TTL 30 días, hasta 5 entradas, rotación). Endpoint
  `GET /api/vault/:vaultId/history` lista metadatos (versión, fecha, etiqueta de dispositivo)
  SIN descifrar. Recuperación de baja probabilidad pero barata de mantener.

- **K-9 — Credenciales y alistamiento.** La bóveda se identifica con
  `{ vaultId, secretKey, deviceLabel, createdAt }`:
  - `vaultId`: UUID v4 generado en el escritorio al crear la bóveda.
  - `secretKey`: 256 bits aleatorios (Base64) — local del par de dispositivos.
  - `deviceLabel`: "Escritorio", "Móvil D4", etc.; es la etiqueta que aparece en el modal de
    conflicto para identificar quién publicó qué.
  - El **escritorio** crea la bóveda y muestra: QR con
    `{ v: 1, url: relayUrl, vaultId, secretKey }` + la frase mnemónica de 6 palabras (diccionario
    español de Teacher-Buddy) como alternativa sin cámara. El **móvil** escanea/pega y guarda.
  - Almacenamiento local: clave `contasis_vault_creds` (cada dispositivo guarda su copia)
    bajo la infraestructura de storage existente
    (Electron→archivo, Capacitor→Filesystem, web→localStorage).
  - Frase mnemónica reversible: `lib/mnemonic.ts` (puro) para validar/formatar.

- **K-10 — Retiro del flujo PIN.** El código de 6 dígitos, sus contadores y el bloqueo
  temporal se **eliminan** (vivían en Redis). El alistamiento por QR/frase es la nueva puerta
  (el QR ya era una de las vías del flujo actual; la numérica no aporta seguridad extra aquí
  porque el secreto ya viaja dentro del QR/la frase).

- **K-11 — Puertas multi-cliente (no negociables).**
  - `remote_state` entrante **nunca** se aplica durante la ventana de recarga C-4 (el usuario
    puede estar escribiendo claves de dominio). Se encola en RAM y se despacha cuando
    `canSave` sea verdadero.
  - El auto-sync queda **inactivo hasta terminar el boot** de `useAppData` (canSave en verde
    por primera vez).
  - El servicio de sync **no toca hooks de dominio**: construye snapshot vía `getSnapshot()` y
    aplica vía `restore` (el orquestador `App` es el único dueño de esas operaciones).

- **K-12 — Configuración.** Una sola env var en la app: `VITE_RELAY_URL` (`vite-env.d.ts`),
  apuntando al Worker desplegado (URL `workers.dev` o dominio propio). Sin token ni secreto
  en el bundle: el relay es agnóstico gracias a E2EE (K-3), el secreto vive en credenciales
  locales. El **despliegue del Worker** no usa credenciales locales en la máquina: GitHub
  Actions (`worker` + Secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`, patrón de
  Teacher-Buddy); el id del namespace KV se versiona en `wrangler.toml` (no es un secreto:
  los blobs cifrados no revelan nada sin el secreto del dispositivo).

- **K-13 — CORS del Worker.** CORS abierto `*` (endpoints agnósticos de origen; el secreto
  E2EE actúa como autenticación de facto). Rutas: `GET /health`,
  `PUT /api/vault/:vaultId/state`, `GET /api/vault/:vaultId/state?version=`, `WS /ws?vaultId=`,
  `GET /api/vault/:vaultId/history`.
  El 404 devuelve JSON. TTL de la bóveda 30 días, **renovado en cada push** (el sondeo no
  renueva TTL porque las lecturas de KV no lo tocan — ver Fase 1).

- **K-14 — Sin purga remota.** La orden "purga desde otro dispositivo" de
  Teacher-Buddy queda **fuera de alcance** (post-backlog §7). Si un dispositivo se pierde, la
  vía de hoy es desalistar (borrar credenciales locales) — se documenta en README.

## 3. Riesgos y mitigaciones

| Riesgo | Grado | Mitigación aplicada |
|---|---|---|
| Sobreescritura silenciosa de capturas (remoto viejo borra pólizas nuevas) | Alto | K-7: modal de conflicto cuando ambos lados cambiaron; auto-aplicación solo si el local estaba limpio |
| Bucle de eco (aplicar remoto → persistir → push → reaplicar) | Alto | K-7 + bandera `isApplyingRemote`; el push solo lee el snapshot en el momento del flush, no en cada persistencia |
| Cuota de escrituras KV (1,000/día) | Medio | K-5: documento único, debounce + coalescing 120 s; presupuesto calculado ~30× menor que la cuota |
| Corrupción de la bóveda                  | Medio | K-8 historial (5 versiones, TTL 30 d); restauración de conflicto manual vía hist |
| Alistamiento perdido (secreto sin respaldo) | Medio | K-9 frase mnemónica imprimible; regeneración = nueva bóveda + restaurar de respaldo |
| Aplicar durante recarga multi-cliente (C-4) | Alto | K-11: cola + puertas canSave; el camino de restauración v3 ya existe |
| Snapshot de inventario sin auto-save (quirk #3) | Bajo | K-5 flush en cambio de cliente y cierre; quirk ya documentado, no se agrava |
| Pérdida de PeerJS deja al móvil sin camino directo | Ninguno | K-1: el único camino (Worker) es más robusto que WebRTC con NATs |

**Riesgo de rework aceptado**: la Fase 4 (motor de auto-sync) es la pieza nueva y donde se
concentra la complejidad. El resto (credenciales K-9, snapshot v3, restauración v3)
son piezas existentes o envolturas.

## 4. Fases

### Fase 1 — Worker KV relay (`worker/`)
- `worker/wrangler.toml`: binding KV `CONTABILIDAD_VAULT`, compatibilidad `2024-11-01`.
- `worker/src/index.ts`: health, state GET/PUT con documento único + historial (K-8), WebSocket
  con registro por bóveda en memoria y broadcast `remote_state` (K-6). Todo el JSON de
  respuesta en español. Sin dependencias en runtime (`KVNamespace` + `WebSocketPair` del
  runtime Workers; tipado mínimo propio en `worker/src/env.d.ts`, sin dependencias nuevas).
- Helpers puros extraídos para test: formateo de claves, validación de documento, rotación
  del historial, mensajes del canal. `worker/tests/relay.test.ts` corre DENTRO de la red raíz
  (vitest con proyecto `worker` de entorno `node`; el gate `npm run test` cubre app + worker).
- `.github/workflows/deploy-relay.yml` (workflow_dispatch) con
  `cloudflare/wrangler-action@v3`, `workingDirectory: 'worker'` y Secrets
  `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` (patrón de Teacher-Buddy). El deploy real
  ocurre al final del plan (convenio de ejecución).
- Despliegue documentado en README (Fase 6 incluye esa documentación): crear el namespace
  KV una vez (panel o `wrangler kv:namespace create CONTABILIDAD_VAULT`), pegar el id en
  `wrangler.toml`, y disparar el flujo de GitHub Actions. Mantenimiento con `wrangler dev`
  es opcional para depuración local.

### Fase 2 — Librería de cifrado (`src/lib/`)
- `src/lib/crypto.ts`: `encryptPayload(texto, claveB64)` / `decryptPayload(sobre, claveB64)`
  con Web Crypto (PBKDF2 opcional para derivar la clave desde la frase), helpers de Base64 y
  generador de `secretKey` de 256 bits. Contratos similares a Teacher-Buddy (reuso mental),
  tipado propio más estricto.
- `src/lib/mnemonic.ts`: diccionario de 128 palabras (copiar lista de Teacher-Buddy), 
  `fraseDesdeBytes()` / `bytesDesdeFrase()` puros.
- Tests: round-trip cifrado/descifrado, frases válidas/inválidas, salida distinta con la
  misma entrada (IV y salt aleatorios), error con clave incorrecta.

### Fase 3 — Credenciales y modal de alistamiento
- `src/services/vaultService.ts`: crear bóveda (captura `vaultId`+secreto), guardar/leer
  credenciales locales, gestionar el desalistamiento. Basado en la infraestructura de storage.
- `src/components/SyncModal.tsx` **se reescribe** como modal de bóveda:
  - Escritorio: estado de bóveda (alista, versión local, última sync) o QR + frase para
    alistar el primer/otro dispositivo.
  - Móvil: escáner/pegar el QR/la frase y confirmar.
  - Acciones: "Publicar estado ahora" (flush forzado), "Desalistar este dispositivo",
    "Historial" (lista de versiones, solo metadatos).
- Tests del servicio con mocks de storage.

### Fase 4 — Motor de auto-sync (`src/services/vaultSyncEngine.ts`)
- Máquina de estados: `idle | pushing | pulling | applying | conflict | error`.
- Push: App dispara `schedulePush()` al confirmar cada persistencia (los hooks ya notifican
  sus cambios); debounce + coalescing (K-5); cifra el snapshot `v3` y publica.
- Pull: sondeo pasivo 60 s + via WebSocket (K-6); detección `version` vs
  `contasis_vault_last_version`; ruta de **cola** hasta que `canSave` (K-11).
- Conflicto: callback al orquestador `App` para abrir el modal de decisión (K-7).
- Anti-eco: `isApplyingRemote` suprime programación de push y el flush de cierre.
- Notificación de resultado a los toasts existentes.
- Tests: unidad sobre funciones puras (decidir auto-aplicar vs conflicto; coalescing con
  timers virtuales); integración con `fetch`/WebSocket simulados.

### Fase 5 — Integración en App y UX multi-cliente
- `App.tsx`: montar `vaultSyncEngine` tras boot (`canSave` verde) y **desmontarlo** durante
  recargas C-4 (K-11); pasar `restore` y `getSnapshot` como puentes (única puerta).
- Flush inmediato al cambiar de cliente (activaId) — el snapshot ya refleja el nuevo estado.
- Indicador en `AppHeader`: punto de estado de bóveda (o verde conectado / naranja sucio /
  rojo error). Cola de pendientes durante la recarga: por defecto, aplicar al asomar canSave.
- Alertas de conflicto reutilizan el mecanismo de `modalInfo` de `App` (o `ConfirmModal`):
  la decisión del usuario se convierte en la única publicación posterior del ganador.

### Fase 6 — Limpieza, documentación y versionado
- Eliminar de `src/services/syncService.ts` todo lo de Redis/Upstash/PIN. PeerJS sólo si aún
  alguna pieza de UI lo usa; si nada lo usa, desinstalar de `package.json`.
- `vite-env.d.ts`: quitar `VITE_UPSTASH_*`, añadir `VITE_RELAY_URL`.
- README: sección nueva "Sincronización con bóveda (Cloudflare KV)" — despliegue de Worker,
  alistamiento, regla de conflictos, frase mnemónica, cuota.
- ARCHITECTURE: nueva propuesta de servicios (vaultSyncEngine), mapa de flujo, claves
  `contasis_vault_*`, quirks nuevos (sin conexión, bóveda no alistada, credencial expirada).
- Bump de versión en `package.json` (0.9.0) + registro en README.
- Gate: `npm run lint && npm run test && npm run build` verdes + escaneo anti-CJK en código
  y docs.

## 5. Criterios de aceptación

1. **Auto-sync real**: dos dispositivos alistan la misma bóveda; una captura en A aparece en B
   en segundos (vía WebSocket) o al volver del fondo (vía sondeo). **Sin acción manual**.
2. **Conflicto justo**: A y B editan mientras ambos sin conexión → al reconectar, se muestra
   el modal de conflicto con etiqueta y fecha del remoto; la decisión elegida se publica y
   aterriza en ambos dispositivos.
3. **Multi-cliente íntegro**: con 2 clientes, el snapshot trae los 2; aplicar remoto restaura
   TODOS los clientes (DV-C-3) y el folio del cliente activo continúa sin hueco.
4. **Puerta canSave rígida**: ningún estado remoto se aplica durante la recarga C-4 ni
   pre-hidratación (tests de la puerta).
5. **E2EE verificada**: un `curl` del documento publicado al Worker muestra sólo el blob
   opaco; sin el secreto no hay interpretación.
6. **Higiene de cuota**: log del motor cuenta pushes/coalescing; un día de uso normal queda
   lejos de 1,000 escrituras.
7. **Dead code eliminado**: sin referencias a Upstash, sin PIN en código, sin `peerjs`
   huérfano en `package.json`.

## 6. Fuera de alcance del plan (post-backlog)
- Purga remota coordinada (Teacher-Buddy la tiene; queda fuera de alcance del plan).
- **Respaldos cifrados con la misma lib**: el AES-GCM ya queda en la app (Fase 2); extender el
  formato v3 con sobre cifrado es una mejora futura natural y sin puntos de riesgo de sync.
- Migración de historial desde Upstash: no hay nada que migrar (TTL 120 s ya evaporó las
  sesiones; los datos de dominio viven en local y allí se quedan).
- Autenticación extra del Worker (Rate-lite o Cloudflare Access) si se vuelve multiusuario.

## 7. Registro de fases / desviaciones
- **Fase 1 — Worker KV relay: EJECUTADA (2026-10-20).** Creados `worker/wrangler.toml`
  (binding `CONTABILIDAD_VAULT`, id pendiente de reemplazo por el usuario), `worker/src/
  env.d.ts` (tipado mínimo sin dependencias), `worker/src/relay.ts` (helpers puros: claves,
  validación de documento, `planRotarHistorial`, mensajes del canal) y `worker/src/index.ts`
  (router: `/health`, PUT/GET state con sondeo barato por `?version=`, history como
  metadatos, WebSocket con registro en memoria y broadcast). `.github/workflows/
  deploy-relay.yml` creado (workflow_dispatch, Secrets `CLOUDFLARE_API_TOKEN`/
  `CLOUDFLARE_ACCOUNT_ID`, igual que Teacher-Buddy). La suite del worker entró a la red
  raíz vía `vitest.config.ts` (`include: worker/tests/**`): 19 pruebas nuevas en
  `worker/tests/relay.test.ts` con KV simulado. Gate: lint ✓ / test ✓ (193, 18 archivos) /
  build ✓ / escaneo anti-CJK ✓.
- **DV-K-1:** el push real cuesta 1 `put()` + hasta `HISTORIAL_MAX` `put()` de historial
  (K-8), no solo 1 — K-5 actualizado; presupuesto diario sigue ~2× bajo el límite gratis.
- **DV-K-2:** la validación de `vaultId` corre DESPUÉS del matching de ruta, y las URLs con
  rutas relativas (`../`) las normaliza el constructor de `URL` antes del worker (404, no
  400). Cubierto en `worker/tests/relay.test.ts` con un id que sí llega a la validación.
- **Fase 2 — Librería de cifrado: EJECUTADA (2026-10-20).** Creados `src/lib/crypto.ts`
  (`encryptPayload`/`decryptPayload` AES-GCM 256 con Web Crypto, IV de 96 bits por blob,
  Base64 por bloques para blobs grandes, `generarClaveSecreta`, `derivarClaveDesdeFrase`
  con PBKDF2/100k para respaldos cifrados futuros y `sha256Bytes`) y `src/lib/mnemonic.ts`
  (diccionario de 128 palabras único — se corrigió el 'estrella' duplicado de Teacher-Buddy
  por 'abeto' —, `elegirFraseAleatoria`, `normalizarFrase` tolerante con tildes/comas/espacios,
  `esFraseValida` y `credencialDesdeFrase` determinista: `vaultId = vlt_<hash12>` +
  `secretKey = SHA-256(vaultId:frase)` en Base64 = 256 bits). 23 pruebas nuevas
  (13 crypto + 10 mnemónica). Gate: lint ✓ / test ✓ (216, 20 archivos) / build ✓ /
  escaneo anti-CJK ✓.
- **DV-K-3 (resolución del esquema frase↔clave):** 6 palabras NO codifican reversiblemente
  256 bits (~42 bits disponibles). Se adopta el esquema real de Teacher-Buddy: la frase es
  la FUENTE de la credencial y ambos hashes la derivan de forma determinista en cualquier
  dispositivo (sin transporte adicional del secreto). Consecuencia: el sobre cifrado NO
  lleva `salt` (la clave siempre es de 256 bits; el PBKDF2 solo aplica a derivación desde
  frase con salt explícito fuera del sobre, `derivarClaveDesdeFrase`). K-3 leído en ese
  sentido (`{ ciphertext, iv, algoritmo, version }`).
- **Fase 3 — Credenciales y modal de alistamiento: EJECUTADA (2026-10-20).** Creados
  `src/services/vaultService.ts` (+ 10 pruebas) y reescrito `src/components/SyncModal.tsx`
  como modal de bóveda. Servicio: `contasis_vault_creds` vía storage existente
  (Electron/Capacitor/web), `crearBoveda` (frase aleatoria → credencial determinista),
  `alistarDesdeQr` (`{v,url,vaultId,secretKey}`, válido https/http-local),
  `alistarDesdeFrase` (deriva y COMPRA el vaultId esperado; rechazo sin escritura),
  `desalistar`, `actualizarEtiqueta`, `verificarRelay` (/health, jamás lanza) y
  `construirPayloadQr`. Modal: escritorio crea/muestra QR + frase + historial
  (metadatos del relay) + "Desalistar" con confirmación inline; móvil escanea
  (BarcodeScanner, igual que antes) o pega el payload/frase. `SyncModal` ya no recibe
  `localState`/`onApplyRemoteState` (esas integraciones pasan a `App` en Fase 5);
  `vite-env.d.ts` ganó `VITE_RELAY_URL` (K-12; el retiro de `VITE_UPSTASH_*` sigue
  siendo Fase 6). Gate: lint ✓ / test ✓ (233, 21 archivos) / build ✓ / escaneo CJK ✓.
- **DV-K-4:** los dispositivos alineados por QR guardan `frase: ''` (solo su creador
  tiene la frase); la validación de credenciales lo tolera. Antes fallaría la
  relectura por un mínimo de 4 caracteres erróneo — corregido a tope de 120.
- **DV-K-5:** `alistarDesdeFrase` sin `vaultIdEsperado` crea/se adhiere la bóveda que
  nace de la frase tecleada (escritorio y móvil); la búsqueda de `vaultIdEsperado`
  es opcional para blindar la alineación contra frases de otras bóvedas.
- **Fase 4 — Motor de auto-sync: EJECUTADA (2026-10-20).** Creado
  `src/services/vaultSyncEngine.ts` con clase `VaultSyncEngine` (dependencias
  inyectables: `fetchImpl`, `socketFactory`, `guardar`/`leer`) y lógica pura
  exportada (`decidirFrenteDocumento`, `definirSiguienteVersion`,
  `parseDocumentoRemoto` — espejo local del validador del worker, sin acople
  carpeta app↔worker). Comportamiento: push con debounce 1.5 s + coalescing
  120 s (marca temporal anotada AL ENTRAR a `publicar`, con anti-reingreso y
  reinicio de la marca si falla, para reintentos sin castigo); pull pasivo 60 s
  con `?version=` barato + WebSocket vivo con latido de 25 s y reconexión de
  5 s; sondeo suspendido si hay socket vivo o pestaña oculta, y re-tirado al
  volver `online`/`visible`. K-7: remoto ≤ versión local se ignora; remoto
  mayor con local limpio auto-se aplica; con local sucio emite evento
  `conflicto` y expone `resolverConflicto(mantenerLocal)` (elegir local
  publica con `max(local, remoto) + 1`; aceptar remoto restaura y toma su
  versión). K-11: documento en cola cuando `puedeEscribir()` es falso o el
  motor está ocupado, desatado por `aplicarPendiente()`; anti-eco
  (`aplicandoRemoto`) suprime `schedulePublicacion` durante la restauración.
  Punteros persistentes: `contasis_vault_last_version` y `contasis_vault_dirty`
  (la bandera se escribe DESPUÉS de limpiar `sucio` — DV interna de orden).
  15 pruebas nuevas (decisiones puras, debounce/coalescing con timers
  virtuales, push/pull/conflicto con cifrado real, cola canSave, anti-eco, WS
  y persistencia). Gate: lint ✓ / test ✓ (248, 22 archivos) / build ✓ /
  escaneo CJK ✓.
- **DV-K-6:** el snapshot de la bóveda se guarda sin el envoltorio de
  exportación (metadatos `version`/`generatedAt` del modal resumen a la fecha
  del documento KV): el blob contiene el `BackupSnapshotV3` crudo
  (`{empresas, activaId}`); `esBackupV3` valida antes de restaurar. La
  versión entera del documento ES la de la bóveda (K-5), separada de la
  "3.0.0" del formato de respaldo.
