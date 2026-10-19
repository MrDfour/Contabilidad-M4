# Mapa del Proyecto — Contabilidad M4 Pro

> **Propósito:** Este documento es el mapa único de referencia para trabajar en el código.
> Su objetivo es dar contexto completo a un asistente de IA (o desarrollador nuevo) en una sola lectura,
> sin necesidad de explorar todo el repositorio.
> **Regla de mantenimiento:** si cambias la estructura, los datos almacenados o agregas archivos, actualiza este documento en el mismo commit.
>
> **⚠ En transición:** existe un plan de modularización y testing en curso (`REFACTORING_PLAN.md`).
> Durante ese proceso, la regla de mantenimiento aplica doble: cada fase del plan DEBE actualizar
> este documento en el mismo commit que introduzca cambios de estructura. La tabla de archivos
> y la sección 9 (convenciones) son las que envejecen más rápido.

Versión del código: v0.7.1 · Licencia: Apache-2.0 · README de usuario: `README.md`

---

## 1. Qué es esta aplicación

App de gestión contable (español, dominio fiscal mexicano) que funciona en **tres plataformas con un solo código base**:

| Plataforma | Empaquetado | Punto de entrada extra |
|---|---|---|
| Web/navegador | Vite (build estático en `dist/`) | — |
| Escritorio | Electron (instaladores con `electron-builder`) | `electron/main.js` |
| Android | Capacitor (`capacitor.config.ts`) | — |

Módulos funcionales: Libro Diario, Cuentas T, Balance General, Estado de Resultados, Catálogo de Cuentas, Activos Fijos con depreciación, Contabilidad Electrónica SAT (Anexo 24) y sincronización Escritorio ↔ Móvil.

**Stack:** React 19 + TypeScript strict + Vite + Tailwind CSS v4 (sin componentes de UI externos; la UI es propia). Exportación con ExcelJS / jsPDF / html2canvas-pro. Sincronización con PeerJS (WebRTC) + Upstash Redis REST como respaldo.

---

## 2. Estructura de archivos (qué es cada cosa)

```
Contabilidad-M4/
├── index.html                  # Plantilla HTML de Vite
├── vite.config.ts              # Config Vite + plugin React + Tailwind (puerto 3000)
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
    ├── types.ts                # ⭐ TODOS los tipos de dominio + INITIAL_ACCOUNTS (catálogo base)
    ├── App.tsx                 # ⭐ ORQUESTADOR (~410 líneas, Fase 3): composición de hooks de dominio,
    │                           #   navegación de vistas (appMode/activeTab), modales de UI, activos fijos,
    │                           #   orquestadores multi-dominio (sync remoto, restauración de respaldo);
    │                           #   el shell visual vive en components/layout/
    │
    ├── components/             # Vistas puras (reciben datos por props, no tocan storage)
    │   ├── layout/                   # Shell de layout extraído de App (Fase 3): presentacionales,
    │   │   ├── MobileMenu.tsx          #   drawer móvil (AnimatePresence), ítems derivados de NavigationTab[]
    │   │   ├── Sidebar.tsx             #   sidebar desktop: SIEMPRE montado (se oculta con CSS en móvil)
    │   │   │                          #   para preservar la animación layoutId="sidebar-active-indicator"
    │   │   ├── AppHeader.tsx           #   sticky header + toggle Básico/Fiscal (layoutId="app-mode-indicator",
    │   │   │                          #   riesgo R4: existe en móvil y desktop; verifica en ambos)
    │   │   └── AppFooter.tsx           #   botones de respaldo/restaurar/acerca de/feedback
    │   ├── journal/                  # Deconstrucción de JournalView (Fase 4): JournalView queda como
    │   │   │                         #   COMPOSITOR (~240 lín): toolbar de export/import, flujo de edición
    │   │   │                         #   (nuevo vs editar) y wrappers de animación del formulario
    │   │   ├── JournalTabs.tsx         #   pestañas de diarios + renombrado inline (estado local propio)
    │   │   ├── EntryList.tsx           #   tabla del diario agrupada por período mensual (Intl es-ES);
    │   │   │                          #   dueña del estado de asientos expandidos/períodos colapsados
    │   │   ├── EntryCard.tsx           #   filas de UN asiento (colapsado "N Mov.") + filas de movimientos
    │   │   ├── EntryForm.tsx           #   formulario de asiento: partida doble en vivo, partidas por lote,
    │   │   │                          #   y lectura de CFDI XML (UUID/RFC/Total + modal de discrepancia)
    │   │   └── AccountPicker.tsx       #   SearchableAccountSelect (búsqueda por nombre/código);
    │   │                              #   también lo consume FixedAssetsView
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
    │   │                        #   calculateFiscalDeduction (INPC truncado a 4 dec, Art. 31 LISR)
    │   ├── navigation.ts        # Tipos de navegación compartidos: AppMode, AppTab, NavigationTab,
    │   │                        #   FISCAL_NAV_TABS (pestañas del modo fiscal). Consumido por App y layout/
    │   ├── importEntriesFromExcel.ts  # Parser PURO del libro Excel del Libro Diario (valida encabezados
    │   │                        #   de la plantilla, carry-forward de celdas, groupKey por ASIENTO_ID,
    │   │                        #   cuentas por nombre normalizado/código y serial de Excel para fechas);
    │   │                        #   devuelve { entries, unmatchedAccounts } — el UI (JournalView) arma modales
    │   ├── appMeta.ts           # APP_VERSION (única fuente del número de versión mostrado en UI)
    │   ├── utils.ts             # Exportaciones y utilidades: exportToExcel, exportTAccountsStyleToExcel,
    │   │                        #   exportToPDF (captura HTML→PDF), exportTableToPDF (autotable), readExcel,
    │   │                        #   cn (clases), calculateMonthlyDepreciation,
    │   │                        #   calculateFiscalDeduction (INPC)
    │   └── satExport.ts         # Serializadores XML TXT del módulo SAT (CT/BN) y DIOT
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
        ├── useAppData.ts            # ⭐ HYDRATION inicial: migrate + las 4 claves; marca onLoaded
        │                            #   (protege R2: no persistir vacíos antes de cargar)
        ├── useJournals.ts           # ⭐ Dueño de `contasis_journals`: CRUD de asientos/diarios,
        │                            #   setSubAccounts (canal de useCatalog), hydrate (sync/respaldo)
        ├── useCatalog.ts            # ⭐ Dueño de `contasis_accounts`: catálogo híbrido
        │                            #   (globals read-only + subcuentas por diario, dedup por code),
        │                            #   guardado con debounce 300ms gated por canSave
        ├── useInventories.ts        # ⭐ Dueño de `contasis_final_inventories`: finalInventory
        │                            #   sincronizado al diario activo; NO autoguarda (fiel al original)
        └── useBackup.ts             # ⭐ Dueño de `contasis_last_backup`: vigilante semanal (12h),
                                     #   exportación JSON de snapshot, parseo+validación de restauración
```

Regla general: **el estado vive en hooks de dominio (uno por clave de storage, ver JSDoc de cada hook) que `App.tsx` compondrá; el cálculo contable y la exportación viven en `lib/`; las vistas son presentacionales.** `App.tsx` es el orquestador: cualquier escritura que toque 2+ dominios (sync remoto, restauración de respaldo) pasa por UNA sola función suya (regla anti-R1) — ningún hook escribe la clave de otro.

---

## 3. Flujo de datos principal

```
Usuario → JournalView (asientos) → App.tsx (estado journals)
       → TAccountsView / BalanceSheetView / ProfitLossView (derivaciones puras de lib/accounting.ts sobre journals + accounts)
       → FixedAssetsView → genera asiento automático → journals
```

- `App.tsx` es el orquestador: retiene navegación (`appMode`, `activeTab`), modales, activos fijos (`contasis_fixed_assets`, único dominio pendiente de migrar a hook) y compone los hooks de dominio.
- Los saldos de Cuentas T, Balance y Estado de Resultados **no se almacenan**: se recalculan en cada render a partir de `journals` (vía `lib/accounting.ts`).

### Propiedad de claves de storage (anti-R1)

| Clave | Hook dueño |
|---|---|
| `contasis_journals` | `useJournals` (efecto auto-guarda + `hydrate` explícito) |
| `contasis_accounts` | `useCatalog` (debounce 300 ms, gated por `hasLoaded`) |
| `contasis_final_inventories` | `useInventories` (solo guarda explícito — sin efecto automático, fiel al original) |
| `contasis_fixed_assets` | `App.tsx` (efecto auto-guarda, aún sin hook) |
| `contasis_app_mode` | `App.tsx` (localStorage simple) |
| `contasis_last_backup` | `useBackup` |

---

## 4. Modelo de datos (`src/types.ts`)

| Tipo | Significado |
|---|---|
| `Account` | Cuenta contable (`id, code, name, type: 'asset'\|'liability'\|'equity'\|'revenue'\|'expense', subtype?, satGroupCode?, isReadOnly?`) |
| `Movement` | Línea de asiento (`accountId` → referencia a Account, `type: 'debit'\|'credit'`, `amount`, `uuidCFDI?`, `rfcTercero?`) |
| `JournalEntry` | Asiento (id, fecha, descripción, `movements[]`, `policyType?: 'diario'\|'ingreso'\|'egreso'`) |
| `Journal` | Libro diario (id, nombre, `entries[]`) |
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
| `contasis_journals` | `Journal[]` (diarios + asientos) |
| `contasis_fixed_assets` | `FixedAsset[]` |
| `contasis_final_inventories` | `{ [journalId]: number }` (inventario final por diario) |
| `contasis_accounts` | Catálogo de cuentas creado/editado por el usuario (se fusiona sobre `INITIAL_ACCOUNTS`) |
| `contasis_app_mode` | Solo localStorage: `'normal' \| 'fiscal'` |
| `contasis_last_backup` | Timestamp de último respaldo de sincronización |

`migrateFromLocalStorage()` traslada datos viejos de `contasis_journals`, `contasis_fixed_assets`, `contasis_final_inventories` (del localStorage) al backend físico, solo si no existen aún.

---

## 6. Sincronización Escritorio ↔ Móvil

- Central en `src/services/syncService.ts` (lógica) + `SyncModal.tsx` (UI).
- **WebRTC con PeerJS**: escritorio actúa de host con un ID de sesión; móvil escanea QR (MLKit) o entra un PIN de 6 dígitos (el PIN deriva el sessionId con aritmética módulo CSRNG).
- **Upstash Redis REST es parte integral del protocolo de emparejamiento, no un simple respaldo**: registra la sesión activa y compone el payload desktop ↔ móvil (`sync_desktop_*` / `sync_mobile_*`); el flujo de PIN usa Redis para el registro de sesiones, contadores de intentos fallidos y bloqueo temporal. Si faltan las credenciales, el escritorio lanza "Upstash Redis env vars are missing" y el companion "Failed to fetch". El rol "escritorio" solo se activa en Electron (`window.electronAPI`); un navegador puro siempre toma el flujo móvil (limitación preexistente, ver Mejoras futuras).
- Conflictos: el móvil ofrece "mantener local" vs "sobrescribir con datos remotos" (payload completo, no merge por asiento).
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
| `npm run lint` | `tsc --noEmit` (chequeo de tipos; es el test de facto — no hay test runner) |
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

---

## 10. Guía rápida: "¿dónde cambio X?"

| Quiero… | Archivo |
|---|---|
| Agregar/editar tipos de datos o cuentas base | `src/types.ts` |
| Cambiar reglas de cálculo (Cuentas T, saldos, depreciación, INPC) | `src/lib/accounting.ts` |
| Cambiar presentación de Balance / P&L / Cuentas T | `src/components/BalanceSheetView.tsx` / `ProfitLossView.tsx` / `TAccountsView.tsx` |
| Cambiar formato de montos/moneda o formateo de inputs | `src/lib/format.ts` |
| Cambiar formato de reportes Excel/PDF | `src/lib/utils.ts` |
| Cambiar parseo/formato del Excel de IMPORTACIÓN del Diario | `src/lib/importEntriesFromExcel.ts` (lógica) · `JournalView.tsx` (modales) |
| Cambiar XML/TXT SAT o DIOT | `src/lib/satExport.ts` |
| Cambiar reglas de persistencia | `src/services/storageService.ts` (+ IPC en `electron/main.js`) |
| Cambiar lógica de sync | `src/services/syncService.ts` (motor) y `SyncModal.tsx` (UI) |
| Agregar una vista/nueva pantalla | Nuevo componente + switch en `App.tsx` |
| Cambiar ventana Electron / autoupdater | `electron/main.js` |
