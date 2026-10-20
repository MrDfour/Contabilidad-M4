# Mapa del Proyecto — Contabilidad M4 Pro

> **Propósito:** Este documento es el mapa único de referencia para trabajar en el código.
> Su objetivo es dar contexto completo a un asistente de IA (o desarrollador nuevo) en una sola lectura,
> sin necesidad de explorar todo el repositorio.
> **Regla de mantenimiento:** si cambias la estructura, los datos almacenados o agregas archivos, actualiza este documento en el mismo commit.
>
> **⚠ En transición:** existe un plan de migración al modelo de Pólizas en curso
> (`PLAN_POLIZAS.md`, Fases 6–7 pendientes al cierre de la Fase 5). Durante ese proceso,
> la regla de mantenimiento aplica doble: cada fase del plan DEBE actualizar este documento
> en el mismo commit que introduzca cambios de estructura. La tabla de archivos y la
> sección 9 (convenciones) son las que envejecen más rápido.

Versión del código: v0.7.1 · Licencia: Apache-2.0 · README de usuario: `README.md`

---

## 1. Qué es esta aplicación

App de gestión contable (español, dominio fiscal mexicano) que funciona en **tres plataformas con un solo código base**:

| Plataforma | Empaquetado | Punto de entrada extra |
|---|---|---|
| Web/navegador | Vite (build estático en `dist/`) | — |
| Escritorio | Electron (instaladores con `electron-builder`) | `electron/main.js` |
| Android | Capacitor (`capacitor.config.ts`) | — |

Módulos funcionales: Pólizas Contables (captura principal: Ingreso/Egreso/Diario), Libro Diario (reporte consolidado de solo lectura), Cuentas T, Balance General, Estado de Resultados, Catálogo de Cuentas, Activos Fijos con depreciación, Contabilidad Electrónica SAT (Anexo 24) y sincronización Escritorio ↔ Móvil.

**Stack:** React 19 + TypeScript strict + Vite + Tailwind CSS v4 (sin componentes de UI externos; la UI es propia). Exportación con ExcelJS / jsPDF / html2canvas-pro. Sincronización con PeerJS (WebRTC) + Upstash Redis REST como respaldo.

---

## 2. Estructura de archivos (qué es cada cosa)

```
Contabilidad-M4/
├── index.html                  # Plantilla HTML de Vite
├── vite.config.ts              # Config Vite + plugin React + Tailwind (puerto 3000)
├── vitest.config.ts            # Config de la red de pruebas (espeja define/alias de Vite)
├── tsconfig.json               # TS strict, bundler moduleResolution
├── capacitor.config.ts         # Config de empaquetado Android
├── package.json                # Scripts + config de electron-builder (app: "main" arriba)
│
├── electron/
│   ├── main.js                 # Proceso principal Electron: ventana, IPC de persistencia en disco,
│   │                           #   auto-actualización (electron-updater), menú.
│   └── preload.js              # Expone window.electronAPI (saveData/loadData/progress) al renderer.
│
├── .github/workflows/          # CI: release de Electron (electron-release.yml) y update de lockfile
│
└── src/
    ├── main.tsx                # Montaje de React (renderRoot), importa index.css
    ├── index.css               # Tailwind v4 + estilos globales + animaciones de paleta
    ├── vite-env.d.ts           # Tipos de entorno Vite
    ├── types.ts                # ⭐ TODOS los tipos de dominio + INITIAL_ACCOUNTS (catálogo base).
    │                           #   `Journal`/`JournalEntry`/`Movement` SOLO sobreviven como formatos
    │                           #   legacy: migración one-shot, respaldos v1 y sync remoto viejo.
    ├── App.tsx                 # ⭐ ORQUESTADOR (Fase 5): composición de hooks de dominio SIN el
    │                           #   dominio Journal en RAM, navegación de vistas (appMode/activeTab),
    │                           #   modales de UI, activos fijos, orquestadores multi-dominio (sync
    │                           #   remoto, restauración de respaldo v1/v2); shell visual en layout/
    │
    ├── components/             # Vistas puras (reciben datos por props, no tocan storage)
    │   ├── layout/                   # Shell de layout extraído de App (Fase 3): presentacionales,
    │   │   ├── MobileMenu.tsx          #   drawer móvil (AnimatePresence), ítems derivados de NavigationTab[]
    │   │   ├── Sidebar.tsx             #   sidebar desktop: SIEMPRE montado (se oculta con CSS en móvil)
    │   │   │                          #   para preservar la animación layoutId="sidebar-active-indicator"
    │   │   ├── AppHeader.tsx           #   sticky header + toggle Básico/Fiscal (layoutId="app-mode-indicator",
    │   │   │                          #   riesgo R4: existe en móvil y desktop; verifica en ambos)
    │   │   └── AppFooter.tsx           #   botones de respaldo/restaurar/acerca de/feedback
    │   ├── journal/                  # Carpeta residual: SOLO vive AccountPicker (retiro Fase 5);
    │   │                             #   moverlo a una carpeta común es opcional (Fase 7)
    │   │   └── AccountPicker.tsx       # SearchableAccountSelect: lo consumen FixedAssetsView y
    │   │                              #   polizas/PolizaForm
    │   ├── polizas/                  # ⭐ MÓDULO DE PÓLIZAS (Fase 3 PLAN_POLIZAS): captura principal.
    │   │   │                         #   Vistas puras; los datos viven en hooks/usePolizas (anti-R1)
    │   │   ├── PolizaView.tsx          #   contenedor: toolbar (Nueva Póliza + Plantilla + Importar
    │   │   │                          #   Excel D-11), filtro+búsqueda, modales de captura/impresión
    │   │   ├── PolizaFilter.tsx        #   chips Todas/Ingresos/Egresos/Diario + buscador folio/concepto
    │   │   ├── PolizaList.tsx          #   listado con estados vacíos diferenciados (filtro vs sin datos)
    │   │   ├── PolizaCard.tsx          #   tarjeta: folio ING/EGR/DIA, distintivo de tipo, desglose de
    │   │   │                          #   partidas con sumas iguales; editar/imprimir/eliminar
    │   │   ├── PolizaForm.tsx          #   modal de captura: partida doble EN VIVO (guardado bloqueado
    │   │   │                          #   si <2 partidas o desbalance), tipo CONGELADO al editar (D-8),
    │   │   │                          #   CFDI UUID/RFC por partida en modo fiscal (+ Lectura XML y
    │   │   │                          #   modal de discrepancia, mismo patrón que EntryForm)
    │   │   └── PolizaPrintModal.tsx    #   formato físico imprimible (@media print): sumas iguales y
    │   │                              #   renglones de firma Elaboró/Revisó/Autorizó
    │   ├── TAccountsView.tsx         # Cuentas T calculadas de los asientos; export PDF/Excel
    │   ├── BalanceSheetView.tsx      # Balance General (Activo/Pasivo/Capital) desde saldos Cuentas T
    │   ├── ProfitLossView.tsx        # Estado de Resultados (método analítico); inventario final manual
    │   ├── CatalogView.tsx           # Catálogo de cuentas: listar/crear/editar (INITIAL_ACCOUNTS read-only)
    │   ├── FixedAssetsView.tsx       # Activos fijos: registro, baja, depreciación mensual (genera asiento),
    │   │                             #   deducción fiscal INPC
    │   ├── ContabilidadElectronicaView.tsx  # Genera CT.xml (catálogo SAT), BN.xml (balanza), DIOT.txt;
    │   │                             #   valida RFC; tipo de póliza diario/ingreso/egreso
    │   ├── SyncModal.tsx             # UI de emparejamiento Escritorio↔Móvil: QR, PIN de 6 dígitos,
    │   │                             #   resolución de conflictos (keep local / remote overwrite)
    │   ├── FeedbackModal.tsx         # Envío de feedback del usuario (issues)
    │   └── modals/                   # Modales globales extraídos de App (Fase 0): presentacionales,
    │       ├── GlobalInfoModal.tsx     #   éxito/error + variante de sugerencia de respaldo,
    │       │                          #   exporta ModalInfo y BACKUP_SUGGESTION_TITLE
    │       ├── ConfirmDeleteModal.tsx  #   confirmación de borrado (exporta ConfirmDeleteData)
    │       ├── UpdateAvailableModal.tsx # aviso de nueva versión (Browser.open de Capacitor vive aquí)
    │       ├── AboutModal.tsx          #   "Acerca de" + puente a Feedback
    │       └── DownloadProgressBar.tsx #   barra de progreso de descarga (Electron updater)
    │
    ├── lib/
    │   ├── format.ts            # ⭐ FUENTE ÚNICA de formateo/parseo de montos y texto:
    │   │                        #   normalizeAmount, parseFormattedAmount, parseImportedAmount,
    │   │                        #   formatAmountForInput/Input, formatCurrency (MXN),
    │   │                        #   formatSatGroupCode, normalizeString. PROHIBIDO duplicar en vistas.
    │   ├── accounting.ts        # ⭐ Funciones PURAS de derivación contable (sin React/storage):
    │   │                        #   buildTAccountsData, computeAccountBalances (saldo por naturaleza
    │   │                        #   deudora/acreedora), calculateMonthlyDepreciation,
    │   │                        #   calculateFiscalDeduction (INPC truncado a 4 dec, Art. 31 LISR),
    │   │                        #   + pólizas: validatePolizaBalance, flattenPolizasToJournalEntries
    │   │                        #   (D-6), nextPolizaFolio/formatPolizaFolio, entryToPolizaInput
    │   │                        #   (D-10) y entriesToPolizasDiarias (D-11)
    │   ├── navigation.ts        # Tipos de navegación compartidos: AppMode, AppTab, NavigationTab,
    │   │                        #   DEFAULT_TAB ('polizas'), BASIC_NAV_TABS y FISCAL_NAV_TABS.
    │   │                        #   Consumido por App y layout/
    │   ├── importEntriesFromExcel.ts  # Parser PURO de la plantilla Excel (valida encabezados,
    │   │                        #   carry-forward de celdas, groupKey por ASIENTO_ID,
    │   │                        #   cuentas por nombre normalizado/código y serial de Excel para fechas);
    │   │                        #   devuelve { entries, unmatchedAccounts } — el UI (polizas/PolizaView
    │   │                        #   desde Fase 4) arma los modales y convierte vía entriesToPolizasDiarias
    │   ├── migrateJournalsToPolizas.ts # Migración ONE-SHOT diarios legacy → pólizas (PURA, sin storage;
    │   │                        #   folios por tipo, ids reaprovechados, CFDI/RFC preservados).
    │   │                        #   Se invoca desde useAppData (primera carga) y App (respaldo v1
    │   │                        #   y sync remoto viejo → D-14); ver PLAN_POLIZAS.md D-2/D-3/D-4
    │   ├── migrateCatalogToGlobal.ts  # Migración ONE-SHOT subcuentas de diarios → catálogo global
    │   │                        #   (D-12, PURA: dedup por code, isReadOnly false en nuevas,
    │   │                        #   idempotente). La goberna el flag `contasis_catalog_migrated`
    │   ├── appMeta.ts           # APP_VERSION (única fuente del número de versión mostrado en UI)
    │   ├── utils.ts             # Exportaciones y utilidades: exportToExcel, exportTAccountsStyleToExcel,
    │   │                        #   exportToPDF (captura HTML→PDF), exportTableToPDF (autotable), readExcel,
    │   │                        #   cn (clases), calculateMonthlyDepreciation,
    │   │                        #   calculateFiscalDeduction (INPC)
    │   └── satExport.ts         # Serializadores XML TXT del módulo SAT (CT/BN, PL) y DIOT.
    │                            #   `buildPolizasXML` puro (Fase 6: folios reales, Concepto por
    │                            #   partida) + wrapper `exportPolizasXML` (DV-4)
    │
    │   # ⭐ Red de pruebas (Fase 5): cada .test.ts(x) COLOCADO junto a lo que prueba,
    │   #    descubierto por src/**/*.test.{ts,tsx} (ver sección 9, "Red de pruebas"):
    │   ├── lib/accounting.test.ts · lib/format.test.ts · lib/export.test.ts
    │   ├── lib/migrateJournalsToPolizas.test.ts · lib/migrateCatalogToGlobal.test.ts
    │   ├── lib/navigation.test.ts · lib/satExport.test.ts
    │   ├── hooks/useCatalog.test.ts · useAppData.test.ts
    │   │     · useBackup.test.ts · useInventories.test.ts · usePolizas.test.ts
    │   ├── components/polizas/PolizaForm.test.tsx · components/JournalView.test.tsx
    │   └── test/setup.ts        # Setup global: limpieza entre tests + polyfills jsdom
    │
    ├── services/
    │   ├── storageService.ts    # ⭐ Abstracción de persistencia multiplataforma (ver sección 5):
    │   │                        #   saveToStorage / loadFromStorage / migrateFromLocalStorage
    │   └── syncService.ts       # Motor de sincronización: PeerController (initializeHostPeer /
    │   │                        #   connectToSessionPeer), payloads, respaldo Upstash Redis REST
    │
    └── hooks/
        ├── useCheckForUpdates.ts    # Consulta GitHub Releases vs versión actual
        ├── useUpdateProgress.ts     # Progreso de descarga de la actualización (Electron)
        ├── useAppData.ts            # ⭐ HYDRATION inicial (Fase 5, SIN dominio Journal): carga las
        │                            #   4 claves activas; dispara las migraciones one-shot (pólizas,
        │                            #   catálogo D-12, inventarios D-13); marca onLoaded (protege R2).
        │                            #   `contasis_journals` solo se LEE para migrar (archivo histórico)
        ├── usePolizas.ts            # ⭐ Dueño de `contasis_polizas` + flag `contasis_polizas_migrated`:
        │                            #   alta/edición/borrado con partida doble VALIDADA (D-9, lanza),
        │                            #   folios por tipo (nextPolizaFolio), hydrate persistente SIEMPRE,
        │                            #   alta programática (cierre/depreciación). Persistencia post-carga
        │                            #   con puerta canSave — persiste incluso [] (anti re-migración, D-2)
        ├── useCatalog.ts            # ⭐ Dueño de `contasis_accounts` + flag `contasis_catalog_migrated`:
        │                            #   catálogo GLOBAL consolidado (D-12: sin híbrido por diario),
        │                            #   auto-recuperación quirúrgica de cuentas base, guardado con
        │                            #   debounce 300ms gated por canSave
        ├── useInventories.ts        # ⭐ Dueño de `contasis_final_inventories`: mapa con clave fija
        │                            #   'general' (D-13; migración legacy vía inventoriesToGeneral),
        │                            #   NO autoguarda (fiel al original)
        └── useBackup.ts             # ⭐ Dueño de `contasis_last_backup`: vigilante semanal (12h),
                                     #   exportación JSON v2 (snapshot CON polizas; journals vacío,
                                     #   D-14), parseo y validación de restauración v1/v2
```

Regla general: **el estado vive en hooks de dominio (uno por clave de storage, ver JSDoc de cada hook) que `App.tsx` compondrá; el cálculo contable y la exportación viven en `lib/`; las vistas son presentacionales.** `App.tsx` es el orquestador: cualquier escritura que toque 2+ dominios (sync remoto, restauración de respaldo) pasa por UNA sola función suya (regla anti-R1) — ningún hook escribe la clave de otro.

---

## 3. Flujo de datos principal

```
Usuario → PolizasView (captura PRINCIPAL: manual + importación Excel D-11) → usePolizas (estado `contasis_polizas`)
        → App.tsx: proyección = flattenPolizasToJournalEntries(pólizas ordenadas fecha+folio)
        → TAccountsView / BalanceSheetView / ProfitLossView / CatalogView (consumen la proyección, NO los diarios)
        → Cont. Electrónica: CT/BN/DIOT consumen la proyección; el XML PL consume PÓLIZAS reales (Fase 6)
        → JournalView (REPORT de solo lectura sobre las mismas pólizas cronológicas)
        → ProfitLossView/FixedAssetsView (capturas programáticas) → createProgrammaticPoliza (D-10) → usePolizas
```

- `App.tsx` es el orquestador: retiene navegación (`appMode`, `activeTab`), modales, activos fijos (`contasis_fixed_assets`, único dominio pendiente de migrar a hook) y compone los hooks de dominio. Desde Fase 5 NO existe dominio Journal en RAM.
- **Cutover de reportes (Fase 4) / Desmantelamiento Journal (Fase 5) de `PLAN_POLIZAS.md`:** Cuentas T, Balance, Estado de Resultados, Catálogo (guard de cuentas en uso) y Cont. Electrónica se derivan de la PROYECCIÓN de pólizas (orden cronológico: fecha + folio). El Libro Diario es un reporte de solo lectura con las MISMAS pólizas. Las capturas programáticas pasan por `createProgrammaticPoliza` (adaptación `entryToPolizaInput` en App). Los badges de encabezado de Balance/P&L/Cuentas T muestran el literal fijo "Consolidado" (antes era el nombre del diario activo).
- Los saldos de Cuentas T, Balance y Estado de Resultados **no se almacenan**: se recalculan en cada render a partir de la proyección de pólizas (vía `lib/accounting.ts`).
- **Limitación conocida (acordada con el usuario, ver `PLAN_POLIZAS.md` §10/§12 DV-7):** no existe segmentación por libro contable/empresa — `Poliza` es la captura única consolidada. Caso de uso aclarado: **contador externo con varios clientes** (cada cliente = empresa con RFC, catálogo y activos propios); el modelo Journal viejo tampoco lo satisfacía (catálogo base global, activos globales, un solo RFC para SAT). Una futura decisión D-17 (concepto de cliente/workspace: `empresaId` en Poliza, RFC por cliente en `satExport`) se diseñará tras el cierre del plan; `contasis_journals` permanece intacto para permitir una re-migración segmentada si se decide.
- `useAppData` carga/migra pólizas (Fase 2) y desde Fase 5 consolida el catálogo (D-12: subcuentas de diarios → `contasis_accounts`, GOBERNADA por `contasis_catalog_migrated` — respeta eliminaciones del usuario) y normaliza inventarios a la clave `'general'` (D-13, vía `inventoriesToGeneral`).

### Propiedad de claves de storage (anti-R1)

| Clave | Hook dueño |
|---|---|
| `contasis_polizas` | `usePolizas` (efecto con puerta `canSave` — persiste incluso `[]` — + `hydrate` explícito) |
| `contasis_polizas_migrated` | `usePolizas` (flag de migración ONE-SHOT; solo se consulta en `useAppData`) |
| `contasis_accounts` | `useCatalog` (debounce 300 ms, gated por `hasLoaded`) |
| `contasis_catalog_migrated` | `useCatalog` (flag de consolidación D-12; se consulta y comanda desde `useAppData` vía applier) |
| `contasis_final_inventories` | `useInventories` (solo guarda explícito — sin efecto automático, fiel al original) |
| `contasis_fixed_assets` | `App.tsx` (efecto auto-guarda, aún sin hook) |
| `contasis_app_mode` | `App.tsx` (localStorage simple) |
| `contasis_last_backup` | `useBackup` |
| `contasis_journals` | SIN dueño de escritura: ARCHIVO HISTÓRICO (D-2/D-15) — solo se LEE para las migraciones one-shot y para restaurar respaldos v1 |

> **Sin dominio Journal en RAM (Fase 5, D-15):** `useJournals` y los componentes de captura del diario (`EntryForm`, `EntryList`, `EntryCard`, `JournalTabs`) fueron retirados. `Journal`/`JournalEntry`/`Movement` sobreviven en `types.ts` únicamente como formatos de migración, respaldo v1 y sync remoto viejo.

---

## 4. Modelo de datos (`src/types.ts`)

| Tipo | Significado |
|---|---|
| `Account` | Cuenta contable (`id, code, name, type: 'asset'\|'liability'\|'equity'\|'revenue'\|'expense', subtype?, satGroupCode?, isReadOnly?`) |
| `Movement` | Línea de asiento (`accountId` → referencia a Account, `type: 'debit'\|'credit'`, `amount`, `uuidCFDI?`, `rfcTercero?`) |
| `JournalEntry` | Asiento (id, fecha, descripción, `movements[]`, `policyType?: 'diario'&#124;'ingreso'&#124;'egreso'`). **Formato LEGACY (Fase 5):** ya no se captura en la app; vive para la migración one-shot, respaldos v1 y sync remoto viejo |
| `TipoPoliza` | Tipo de póliza contable: `'ingreso' \| 'egreso' \| 'diario'` (mapea a TipoPoliza SAT 1/2/3 en el XML Anexo 24) |
| `PartidaPoliza` | Línea de una póliza de un solo lado (`accountId`, snapshot `accountCode`/`accountName`, `debit ≥ 0`, `credit ≥ 0`, `concept?`, `uuidCFDI?`, `rfcTercero?`). Regla: si `debit > 0` entonces es cargo, si no, es abono en `credit` — nunca ambos |
| `Poliza` | Póliza contable formal (id, `folio` consecutivo INDEPENDIENTE por tipo, `tipo: TipoPoliza`, fecha, concepto, `partidas[]`, `totalDebe`/`totalHaber` recalculados al guardar con `normalizeAmount`, `elaboro?`, `autorizo?`). Unidad de captura del nuevo módulo de Pólizas (ver `PLAN_POLIZAS.md`) |
| `Journal` | Libro diario (id, nombre, `entries[]`, `subAccounts?`). **Formato LEGACY (Fase 5):** ya no existe estado RAM de diarios; el tipo sobrevive por migración/respaldo v1/sync viejo |
| `FixedAsset` | Activo fijo (nombre, fecha, MOI, cuentas asociadas asset/depr/gasto, `fiscalRate`, `isDisposed`) |
| `TAccountsData` | Cuentas T derivadas: `Record<accountId, { debits: TAccountSide[], credits: TAccountSide[] }>` con `ref` = nº de asiento (1-index). **No se almacena** — se recalcula vía `lib/accounting.ts` |
| `INITIAL_ACCOUNTS` | Catálogo base (~50 cuentas, códigos 1101…5113 con `satGroupCode` SAT). Las cuentas del catálogo base tienen `isReadOnly` y los usuarios pueden agregar cuentas nuevas |

Invariantes importantes:
- **Partida doble**: la suma del Debe = suma del Haber (se valida antes de guardar asiento).
- Los IDs de cuenta usados en asientos **deben existir** `accounts` (import Excel valida contra el catálogo).
- La app se administra en español; las cadenas de UI, nombres de cuenta y reportes viven en español.

---

## 5. Dónde se guarda el estado (persistencia)

`storageService.ts` decide el backend según plataforma:

```
Electron (window.electronAPI) → archivos en disco vía IPC (preload/custom storage del SO)
Capacitor nativo (Android)    → Filesystem plugin, Directory.Data, archivo "<clave>.json"
Navegador                     → window.localStorage (JSON.stringify)
```

Claves usadas (uniformes en las tres plataformas):

| Clave | Contenido |
|---|---|
| `contasis_polizas` | `Poliza[]` — unidad de captura contable primaria (ver `PLAN_POLIZAS.md`) |
| `contasis_polizas_migrated` | Flag `true` cuando la migración de diarios → pólizas ya corrió (una sola vez) |
| `contasis_catalog_migrated` | Flag `true` cuando la consolidación del catálogo (D-12) ya corrió (una sola vez) |
| `contasis_fixed_assets` | `FixedAsset[]` |
| `contasis_final_inventories` | `{ general: number }` (post-D-13); el formato legacy `{ [journalId]: number }` se normaliza al vuelo en la hidratación y sync |
| `contasis_accounts` | Catálogo de cuentas COMPLETO: cuentas base (readonly) + creadas/editadas por el usuario (post-D-12; antes solo globales) |
| `contasis_journals` | `Journal[]` — ARCHIVO HISTÓRICO: no se escribe desde Fase 5 (D-2/D-15); solo lectura para migraciones y compatibilidad de restauración |
| `contasis_app_mode` | Solo localStorage: `'basic' \| 'fiscal'` |
| `contasis_last_backup` | Timestamp de último respaldo de sincronización |

`migrateFromLocalStorage()` traslada datos viejos de `contasis_journals`, `contasis_fixed_assets`, `contasis_final_inventories` (del localStorage) al backend físico, solo si no existen aún.

---

## 6. Sincronización Escritorio ↔ Móvil

- Central en `src/services/syncService.ts` (lógica) + `SyncModal.tsx` (UI).
- **WebRTC con PeerJS**: escritorio actúa de host con un ID de sesión; móvil escanea QR (MLKit) o entra un PIN de 6 dígitos (el PIN deriva el sessionId con aritmética módulo CSRNG).
- **Upstash Redis REST es parte integral del protocolo de emparejamiento, no un simple respaldo**: registra la sesión activa y compone el payload desktop ↔ móvil (`sync_desktop_*` / `sync_mobile_*`); el flujo de PIN usa Redis para el registro de sesiones, contadores de intentos fallidos y bloqueo temporal. Si faltan las credenciales, el escritorio lanza "Upstash Redis env vars are missing" y el companion "Failed to fetch". El rol "escritorio" solo se activa en Electron (`window.electronAPI`); un navegador puro siempre toma el flujo móvil (limitación preexistente, ver Mejoras futuras).
- Conflictos: el móvil ofrece "mantener local" vs "sobrescribir con datos remotos" (payload completo, no merge por asiento). El `SyncState` compartido (Fase 5/D-14) incluye `polizas` (opcional para parsear clientes viejos; el desktop ya comparte pólizas y `journals: []`). Al aplicar un estado remoto de formato viejo (solo `journals`), App lo MIGRA al vuelo con `migrateJournalsToPolizas` antes de hidratar.
- Medidas de seguridad: límite de intentos de PIN, bloqueo temporal y regeneración de sesión.
- **Mejora futura identificada (no en refactor):** el sistema Upstash está planificado a reemplazarse por **Cloudflare KV Workers**; candidato a considerar entonces: emparejamiento por QR vía PeerJS puro sin Redis (degradación elegante cuando no haya credenciales).

---

## 7. Configuración de entorno (`.env.example`)

```env
GEMINI_API_KEY=     # funciones de IA (Google @google/genai existe en package.json)
APP_URL=            # referencia a sí mismo en despliegue
VITE_UPSTASH_REDIS_REST_URL=     # NO viene en .env.example (ver nota abajo)
VITE_UPSTASH_REDIS_REST_TOKEN=
```

> Ojo: esta app se originó como AI Studio applet; `GEMINI_API_KEY`/`APP_URL` son herencia de esa plantilla. Las variables usadas por Vite **deben** llevar el prefijo `VITE_`.
>
> **Credenciales de sync (Upstash):** no están en `.env.example`; en producción/despliegue se inyectan vía **GitHub Secrets**, y para desarrollo local se crea un `.env` manual (gitignoreado). Los tokens tienen vigencia (caducan) — un "Failed to fetch" del companion o el mensaje "Upstash Redis env vars are missing" en escritorio casi siempre significa token expirado o ausente. Sincronización local requiere: regenerar tokens en Upstash → `.env` local → `npm run build` + `npx electron .` (escritorio carga `dist/`, no el dev server) y reiniciar `npm run dev` (Vite solo lee `.env` al arrancar).

---

## 8. Scripts y comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite en `http://localhost:3000` (host 0.0.0.0) |
| `npm run build` | Build de producción web → `dist/` |
| `npm run preview` | Sirve el build localmente |
| `npm run lint` | `tsc --noEmit` (chequeo de tipos) |
| `npm run test` | Red de pruebas **Vitest** (una pasada; ver sección 9) |
| `npm run test:watch` | Vitest en modo vigilante (re-ejecuta al guardar) |
| `npm run electron:build` | `vite build` + electron-builder → instaladores en `release/` |

Dependencias clave instaladas: React 19, Tailwind v4 (`@tailwindcss/vite`), ExcelJS, **xlsx** (lectura de imports), jsPDF + jspdf-autotable, html2canvas-pro, peerjs + qrcode.react, @capacitor-mlkit/barcode-scanning, electron-updater, Motion, lucide-react, @google/genai.

---

## 9. Convenciones del código

- TypeScript **estricto**, sin ninguna librería de estado global: el estado vive en `useState` en `App.tsx` y baja via props.
- Sufijos de import común: `import { X } from '../types'` (sin default exports en services/lib).
- Estilos solo con clases Tailwind (sin CSS modules); helper `cn()` para clases condicionales.
- Iconos: `lucide-react`. Animaciones: librería `motion` (Framer Motion v12).
- Errores asíncronos de persistencia se loguean con `console.error` sin bloquear la UI.
- El dominio es contabilidad mexicana: NO traducir nombres de cuenta del catálogo, ni cambiar códigos/nomenclatura SAT (Anexo 24, INPC, DIOT, CFDI).

### Red de pruebas (Fase 5 — Vitest + Testing Library + jsdom)

- Stack: `vitest` + `@testing-library/react` + `jest-dom`, **solo devDependencies**. Config en `vitest.config.ts` (espeja el `define __APP_VERSION__` de Vite); setup global en `src/test/setup.ts` (limpieza de DOM/storage entre tests + polyfills de jsdom: `crypto.randomUUID`, `URL.createObjectURL`).
- **Ubicación:** cada `.test.ts(x)` vive COLOCADO junto al código que prueba (`lib/`, `hooks/`, `components/`). Vitest descubre `src/**/*.test.{ts,tsx}`.
- **Niveles cubiertos (14 archivos / 146 tests):**
  1. Unitarias puras: `lib/accounting.test.ts` (Cuentas T, saldos por naturaleza, depreciación, INPC truncado + validación/flatten/folios/entrada-a-póliza), `lib/format.test.ts` (normalización, parseo de importaciones, sanitización de input y contrato de `parseJournalImport`) y `lib/satExport.test.ts` (XML PL re-parseado: folios reales, tipos 1/2/3, CompNal, escaping, filename).
  2. Funcional: `lib/export.test.ts` — el workbook Excel se RELEE con ExcelJS (solo `file-saver` mockeado) y el PDF se valida por firma `%PDF-` real.
  3. Migraciones: `lib/migrateJournalsToPolizas.test.ts` (determinismo congelado: folios por tipo, ids, CFDI/RFC) y `lib/migrateCatalogToGlobal.test.ts` (D-12: dedup por código, idempotencia, orden).
  4. Hooks: `hooks/usePolizas` (CRUD de pólizas, folios por tipo, tipo congelado en edición, hydrate persistente, puerta `canSave`), `useCatalog` (catálogo global sin híbrido: recuperación de base, dedup por `code`, flag own `contasis_catalog_migrated`, debounce gated por `canSave`), `useAppData` (hidratación sin Journal, migraciones D-12/D-13, migración de pólizas y fallback corrupto), `useBackup` (respaldo v2 con polizas+journals vacío, import v1/v2, vigía 7 días, import corrupto NO restaura), `useInventories` (clave 'general' D-13, helper `inventoriesToGeneral`, sin auto-guardado), `lib/navigation.test.ts` (DEFAULT_TAB = polizas, composición de pestañas básicas/fiscales).
  5. Render: `components/polizas/PolizaForm.test.tsx` (partida doble en vivo: 0/0 bloqueado, diferencia visible en un solo nodo, cuadre habilita, campos CFDI solo en fiscal, mín. 2 partidas, tipo congelado al editar D-8, elaboro/autorizo al input) y `components/JournalView.test.tsx` (contrato de solo lectura: sin captura, fila por partida con folio/tipo, 0/0 no genera fila).
- **Regla de oro:** cualquier cambio en `lib/accounting.ts`, `lib/format.ts`, `lib/importEntriesFromExcel.ts`, `lib/migrateCatalogToGlobal.ts` o los hooks de dominio DEBE dejar `npm run lint && npm run test` en verde antes de commitear; si el cambio es intencional de comportamiento, se actualiza el test en el MISMO commit.
- *Quirk de entorno documentado:* Node 22+ trae un `localStorage` global nativo que en Windows puede instalarse sin ruta válida; `setup.ts` rebindea al de jsdom (o memoria) si hace falta. No afecta navegador/Electron.
- Cobertura deliberadamente FUERA de alcance: render completo de `App` (requiere mock de sync/Upstash; `isDesktopRuntime` impide probar el rol escritorio en browser — mejora futura documentada en §6), el rechazo de duplicados de `CatalogView` en render (mismo aserto ya cubierto a nivel de hook en `handleCombinedAccountsUpdate`) y los tests retirados junto al dominio Journal (`useJournals.test.ts` se eliminó con su hook en Fase 5, registro de retiros en `PLAN_POLIZAS.md`).

---

## 10. Guía rápida: "¿dónde cambio X?"

| Quiero… | Archivo |
|---|---|
| Agregar/editar tipos de datos o cuentas base | `src/types.ts` |
| Cambiar reglas de cálculo (Cuentas T, saldos, depreciación, INPC) | `src/lib/accounting.ts` |
| Cambiar presentación de Balance / P&L / Cuentas T | `src/components/BalanceSheetView.tsx` / `ProfitLossView.tsx` / `TAccountsView.tsx` |
| Cambiar formato de montos/moneda o formateo de inputs | `src/lib/format.ts` |
| Cambiar formato de reportes Excel/PDF | `src/lib/utils.ts` |
| Cambiar parseo/formato del Excel de IMPORTACIÓN | `src/lib/importEntriesFromExcel.ts` (lógica) · `polizas/PolizaView.tsx` (modales, D-11) · `lib/accounting.ts` (`entriesToPolizasDiarias`) |
| Capturar/editar/imprimir pólizas contables | `src/components/polizas/` (UI) · `src/hooks/usePolizas.ts` (reglas: folios, validación, tipo congelado) · `src/lib/accounting.ts` (validación partida doble, folio formateado) |
| Modificar migraciones legacy (pólizas/catálogo/inventario) | `src/lib/migrateJournalsToPolizas.ts` · `src/lib/migrateCatalogToGlobal.ts` (D-12) · `inventoriesToGeneral` en `hooks/useInventories.ts` (D-13); flags en `hooks/usePolizas.ts` y `hooks/useCatalog.ts`, comando en `hooks/useAppData.ts` |
| Ajustar el reporte del Libro Diario (solo lectura y sus exports) | `src/components/JournalView.tsx` (fecha/folio/tipo/cuenta/concepto/debe/haber) |
| Cambiar navegación de pestañas / tab inicial | `src/lib/navigation.ts` (BASIC_NAV_TABS, FISCAL_NAV_TABS, DEFAULT_TAB) |
| Cambiar XML/TXT SAT o DIOT | `src/lib/satExport.ts` (el XML de Pólizas consume PÓLIZAS reales desde ContabilidadElectronicaView: folio real = NumUnIdenPol, Fase 6) |
| Cambiar reglas de persistencia | `src/services/storageService.ts` (+ IPC en `electron/main.js`) |
| Cambiar lógica de sync | `src/services/syncService.ts` (motor) y `SyncModal.tsx` (UI) |
| Agregar una vista/nueva pantalla | Nuevo componente + switch en `App.tsx` |
| Cambiar ventana Electron / autoupdater | `electron/main.js` |
| Agregar/modificar lógica sujeta a pruebas | Colocar/actualizar el `.test.ts(x)` COLOCADO junto al módulo (regla y niveles en §9 "Red de pruebas"); `npm run lint && npm run test` en verde antes de commitear |
