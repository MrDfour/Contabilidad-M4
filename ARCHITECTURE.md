# Mapa del Proyecto — Contabilidad M4 Pro

> **Propósito:** Este documento es el mapa único de referencia para trabajar en el código.
> Su objetivo es dar contexto completo a un asistente de IA (o desarrollador nuevo) en una sola lectura,
> sin necesidad de explorar todo el repositorio.
> **Regla de mantenimiento:** si cambias la estructura, los datos almacenados o agregas archivos, actualiza este documento en el mismo commit.
>
> **⚠ En transición:** existe un plan de extensión MULTI-CLIENTE en curso
> (`PLAN_MULTI_CLIENTE.md`, heredero de `PLAN_POLIZAS.md` que quedó CERRADO).
> Durante ese proceso la regla de mantenimiento aplica doble: cada fase del plan
> DEBE actualizar este documento en el mismo commit que introduzca cambios de
> estructura. La tabla de archivos y la sección 9 (convenciones) son las que
> envejecen más rápido.

Versión del código: v0.9.7 · Licencia: Apache-2.0 · README de usuario: `README.md`

---

## 1. Qué es esta aplicación

App de gestión contable (español, dominio fiscal mexicano) que funciona en **tres plataformas con un solo código base**:

| Plataforma | Empaquetado | Punto de entrada extra |
|---|---|---|
| Web/PWA (Cloudflare Pages) | Vite (build estático en `dist/`) + `vite-plugin-pwa` (manifest + service worker) | — |
| Escritorio | Electron (instaladores con `electron-builder`) | `electron/main.js` |
| Android | Capacitor (`capacitor.config.ts`, proyecto `android/` committeado) | `MainActivity` (plugin `AppUpdater`) |

Módulos funcionales: Pólizas Contables (captura principal: Ingreso/Egreso/Diario), Multi-Cliente (contador con varios clientes: cada cliente = workspace con catálogo/activos/inventario/pólizas/RFC propios), Libro Diario (reporte consolidado de solo lectura), Cuentas T, Balance General, Estado de Resultados, Catálogo de Cuentas, Activos Fijos con depreciación, Contabilidad Electrónica SAT (Anexo 24) y sincronización Escritorio ↔ Móvil.

**Stack:** React 19 + TypeScript strict + Vite + Tailwind CSS v4 (sin componentes de UI externos; la UI es propia). Exportación con ExcelJS / jsPDF / html2canvas-pro. Sincronización con relay propio en Cloudflare Workers + KV (bóveda E2EE, §6). PWA con `vite-plugin-pwa` (autoUpdate).

---

## 2. Estructura de archivos (qué es cada cosa)

```
Contabilidad-M4/
├── index.html                  # Plantilla HTML de Vite (+ metas PWA/iOS: apple-touch-icon)
├── vite.config.ts              # Config Vite + React + Tailwind + VitePWA (manifest/SW autoUpdate)
├── vitest.config.ts            # Config de la red de pruebas (espeja define/alias de Vite)
├── tsconfig.json               # TS strict, bundler moduleResolution
├── capacitor.config.ts         # Config de empaquetado Android
├── package.json                # Scripts + config de electron-builder (app: "main" arriba)
├── public/
│   ├── icon-192.png            # Icono PWA 192x192 (art del launcher Android sobre #0a0f1d)
│   └── icon-512.png            # Icono PWA 512x512 (mismo método, propósito any+maskable)
│
├── android/                    # ⭐ Plataforma Capacitor COMMITTEADA (ya no se regenera en CI):
│   ├── app/build.gradle        #   versionCode/versionName; el CI los re-escribe desde package.json
│   │                           #   (fórmula maj*10000+min*100+pat; sin ello el APK nacía con
│   │                           #   versionCode 1 fijo y Android rechazaba actualizarlo)
│   └── app/src/main/java/…/    #   MainActivity (registra AppUpdater en load() ANTES de
│   │                           #   super.load(); tras super.onCreate() el registro es un
│   │                           #   no-op silencioso — bug real ya documentado) y
│   │                           #   AppUpdaterPlugin: descarga del APK a cache con progreso
│   │                           #   por eventos + instalación via FileProvider/ACTION_VIEW
│   │                           #   (estilo Mihon: NewUpdateScreenModel).
│
├── electron/
│   ├── main.js                 # Proceso principal Electron: ventana, IPC de persistencia en disco,
│   │                           #   auto-actualización (electron-updater), menú.
│   └── preload.js              # Expone window.electronAPI (saveData/loadData/progress) al renderer.
│
├── .github/workflows/          # CI: electron-release.yml (desktop WIN/LIN/MAC + APK Android
│                               #   firmado + release con versionCode desde package.json);
│                               #   deploy-relay.yml (Worker); test.yml; update-package-lock.yml
│
└── src/
    ├── main.tsx                # Montaje de React (renderRoot), importa index.css
    ├── index.css               # Tailwind v4 + estilos globales + animaciones de paleta
    ├── vite-env.d.ts           # Tipos de entorno Vite
    ├── types.ts                # ⭐ TODOS los tipos de dominio + INITIAL_ACCOUNTS (catálogo base).
    │                           #   `Empresa`/`EstadoEmpresas` = clientes (D-17); `Journal`/`JournalEntry`/
    │                           #   `Movement` SOLO sobreviven como formatos legacy: migración one-shot,
    │                           #   respaldos v1 y sync remoto viejo.
    ├── App.tsx                 # ⭐ ORQUESTADOR: composición de hooks de dominio (activos fijos viven
    │                           #   aquí con clave POR CLIENTE), cambio de cliente activo, navegación
    │                           #   (appMode/activeTab), modales de UI, orquestadores multi-dominio
    │                           #   (sync remoto, restauración de respaldo v1/v2/v3); shell en layout/
    │
    ├── components/             # Vistas puras (reciben datos por props, no tocan storage)
    │   ├── EmpresasModal.tsx         # ⭐ Gestor de CLIENTES (C-1): lista/switch de cliente activo,
    │   │                             #   alta, renombre, RFC y baja con confirmación (C-8);
    │   │                             #   el switch dispara la recarga orquestada (C-4)
    │   ├── layout/                   # Shell de layout extraído de App (Fase 3): presentacionales,
    │   │   ├── MobileMenu.tsx          #   drawer móvil (AnimatePresence), ítems derivados de NavigationTab[]
    │   │   ├── Sidebar.tsx             #   sidebar desktop: SIEMPRE montado (se oculta con CSS en móvil)
    │   │   │                          #   para preservar la animación layoutId="sidebar-active-indicator"
    │   │   ├── AppHeader.tsx           #   sticky header + selector de cliente activo (abre el
    │   │   │                          #   gestor EmpresasModal) + toggle Básico/Fiscal
    │   │   │                          #   (layoutId="app-mode-indicator", riesgo R4: existe en
    │   │   │                          #   móvil y desktop; verifica en ambos)
    │   │   └── AppFooter.tsx           #   botones de respaldo/restaurar/acerca de/feedback
    │   ├── account/                  # Selector de cuentas compartido (movido desde journal/ en Fase 7)
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
    │       ├── UpdateAvailableModal.tsx # Aviso de nueva versión para APK Android MÁQUINA DE
    │       │                          #   ESTADOS estilo Mihon: Descargar → Descargando %
    │       │                          #   (via plugin nativo) → Instalar / Reintentar, changelog,
    │       │                          #   saltar versión; en web cae a Browser.open (fallback)
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
    │   ├── empresas.ts          # ⭐ MULTI-CLIENTE (PLAN_MULTI_CLIENTE): helpers PURAS de claves
    │   │                        #   por cliente (clavePorEmpresa, arrayDe, objetoDe, BASES_POR_EMPRESA).
    │   │                        #   Toda composición de clave `<dominio>_<empresaId>` pasa por aquí.
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
    │   # ⭐ Red de pruebas: cada .test.ts(x) COLOCADO junto a lo que prueba,
    │   #    descubierto por src/**/*.test.{ts,tsx} (ver sección 9, "Red de pruebas"):
    │   ├── lib/accounting.test.ts · lib/format.test.ts · lib/export.test.ts
    │   ├── lib/empresas.test.ts · lib/migrateJournalsToPolizas.test.ts · lib/migrateCatalogToGlobal.test.ts
    │   ├── lib/navigation.test.ts · lib/satExport.test.ts
    │   ├── hooks/useEmpresas.test.ts · useCatalog.test.ts · useAppData.test.ts
    │   │     · useBackup.test.ts · useInventories.test.ts · usePolizas.test.ts
    │   ├── components/polizas/PolizaForm.test.tsx · components/JournalView.test.tsx
    │   ├── components/EmpresasModal.test.tsx
    │   └── test/setup.ts        # Setup global: limpieza entre tests + polyfills jsdom
    │
    ├── services/
    │   ├── storageService.ts    # ⭐ Abstracción de persistencia multiplataforma (ver sección 5):
    │   │                        #   saveToStorage / loadFromStorage / migrateFromLocalStorage
    │   ├── vaultService.ts      # ⭐ Ciclo de vida de la bóveda E2EE (PLAN_SYNC_KV.md): credenciales
    │   │                        #   en `contasis_vault_creds`, alistamiento por QR/frase, desalistado,
    │   │                        #   verificación de relay /health y construcción del payload QR
    │   ├── appUpdater.ts        # Envoltura tipada del plugin nativo AppUpdater (Android):
    │   │                        #   descargarApkConProgreso (eventos progreso/completado/error),
    │   │                        #   instalarApk, permisos de instalación y const esAndroidNativo
    │   └── vaultSyncEngine.ts   # ⭐ Motor de auto-sync (Fase 4): push con debounce 1.5 s + coalescing
    │                            #   120 s (K-5), sondeo pasivo 60 s + WebSocket vivo (K-6), regla de
    │                            #   conflicto "manos sucias" (K-7), cola hasta canSave y anti-echo por
    │                            #   huella SHA-256 (K-11/DV-K-7) — cipher en src/lib/crypto.ts
    │
    └── hooks/
        ├── useCheckForUpdates.ts    # Consulta GitHub Releases vs versión actual: SOLO APK Android
        │                            #   (Electron usa electron-updater; la PWA usa el service
        │                            #   worker de vite-plugin-pwa con autoUpdate). Respeta la
        │                            #   versión "saltada" por el usuario (estilo Mihon)
        ├── useUpdateProgress.ts     # Progreso de descarga de la actualización (Electron)
        ├── useAppData.ts            # ⭐ HYDRATION + ORQUESTADOR MULTI-CLIENTE: boot con migración
        │                            #   ONE-SHOT legacy → empresa por defecto "Mi Empresa" (C-2,
        │                            #   flag `contasis_empresas_migrated`; ahí corre por única vez
        │                            #   la migración de diarios→pólizas D-2 y la consolidación
        │                            #   D-12), carga de los 4 dominios del cliente ACTIVO y
        │                            #   recarga orquestada al cambiar de cliente (C-4, puerta
        │                            #   canSave durante la transición). Las claves legacy se
        │                            #   leen, NUNCA se borran (archivo histórico)
        ├── useEmpresas.ts           # ⭐ Dueño de `contasis_empresas` ({activaId, empresas}) + flag
        │                            #   `contasis_empresas_migrated`: CRUD de clientes (crear con
        │                            #   uuid/renombrar/RFC/eliminar con guarda de último, C-8),
        │                            #   setActiva, hydrate persistente SIEMPRE, puerta canSave
        ├── usePolizas.ts            # ⭐ Dueño de `contasis_polizas_<empresaId>` (C-2): alta/edición/
        │                            #   borrado con partida doble VALIDADA (D-9, lanza), folios por
        │                            #   TIPO Y POR CLIENTE (nextPolizaFolio), hydrate (activo) +
        │                            #   hydrateEmpresa (cualquier cliente, escribe SU clave),
        │                            #   persistencia incluso [] con puerta canSave
        ├── useCatalog.ts            # ⭐ Dueño de `contasis_accounts_<empresaId>`: catálogo POR
        │                            #   CLIENTE (heredero del global D-12), auto-recuperación
        │                            #   quirúrgica de cuentas base por cliente, hydrateEmpresa,
        │                            #   guardado con debounce 300ms gated por canSave
        ├── useInventories.ts        # ⭐ Dueño de `contasis_final_inventories_<empresaId>`: mapa con
        │                            #   clave fija 'general' (D-13, migración vía
        │                            #   inventoriesToGeneral), hydrateFromRemote + hydrateEmpresa,
        │                            #   NO autoguarda (fiel al original)
        └── useBackup.ts             # ⭐ Dueño de `contasis_last_backup`: vigilante semanal (12h),
                                     #   exportación JSON v3 ASYNC (todas las empresas con sus 4
                                     #   dominios, C-5; getSnapshot lee las claves de los otros
                                     #   clientes), restauración v3 completa / v1-v2 solo cliente
                                     #   activo (v1 migra al vuelo, D-14)
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

- `App.tsx` es el orquestador: retiene navegación (`appMode`, `activeTab`), modales y el panel de ACTIVOS FIJOS (su dominio no vive en hook: `App` es dueño de la clave `contasis_fixed_assets_<empresaId>`, C-2) y compone los hooks de dominio. Desde Fase 5 NO existe dominio Journal en RAM.
- **MULTI-CLIENTE (D-17/F-17 de `PLAN_MULTI_CLIENTE.md`):** la captura y todos los reportes operan SIEMPRE sobre el CLIENTE ACTIVO. `contasis_empresas` (dueño: `useEmpresas`) guarda la lista y el `activaId`; los 4 dominios de datos viven en claves por cliente (`contasis_<dominio>_<empresaId>`, C-2) y el cambio de cliente es una recarga orquestada por `useAppData` con `canSave` bajado durante la transición (C-4). Los folios de póliza son consecutivos POR TIPO Y POR CLIENTE. El RFC de la exportación SAT es `Empresa.rfc` (C-7): se precarga en Cont. Electrónica y se persiste tras exportar.
- **Cutover de reportes (Fase 4) / Desmantelamiento Journal (Fase 5) de `PLAN_POLIZAS.md`:** Cuentas T, Balance, Estado de Resultados, Catálogo (guard de cuentas en uso) y Cont. Electrónica se derivan de la PROYECCIÓN de pólizas (orden cronológico: fecha + folio). El Libro Diario es un reporte de solo lectura con las MISMAS pólizas. Las capturas programáticas pasan por `createProgrammaticPoliza` (adaptación `entryToPolizaInput` en App). Los badges de encabezado de Balance/P&L/Cuentas T muestran el literal fijo "Consolidado".
- Los saldos de Cuentas T, Balance y Estado de Resultados **no se almacenan**: se recalculan en cada render a partir de la proyección de pólizas (vía `lib/accounting.ts`).
- `useAppData` carga los dominios del cliente activo y ejecuta la migración ONE-SHOT a clientes (C-2): al no existir el flag `contasis_empresas_migrated`, copia los contenidos históricos de las claves GLOBALES (sin sufijo) a las claves por cliente de la empresa por defecto "Mi Empresa"; las claves globales quedan como ARCHIVO (nunca se borran). El flag `contasis_polizas_migrated` heredado se lee y respeta dentro de esa migración; esos flags ya no gobiernan el boot normal.

### Propiedad de claves de storage (anti-R1)

| Clave | Hook dueño |
|---|---|
| `contasis_empresas` | `useEmpresas` — `{ activaId, empresas: Empresa[] }` (efecto con puerta `canSave` + `hydrate` explícito) |
| `contasis_empresas_migrated` | `useEmpresas` (flag de migración ONE-SHOT C-2; consulta solo en `useAppData`) |
| `contasis_polizas_<empresaId>` | `usePolizas` (`hydrate` del activo implícito + `hydrateEmpresa` para escribir UN cliente; persiste incluso `[]`) |
| `contasis_accounts_<empresaId>` | `useCatalog` (debounce 300 ms, gated por `canSave`; `hydrateEmpresa` para el resto) |
| `contasis_final_inventories_<empresaId>` | `useInventories` (solo guarda explícito — sin efecto automático, fiel al original) |
| `contasis_fixed_assets_<empresaId>` | `App.tsx` (efecto auto-guarda con puerta `canSave`; `hydrateAssetsEmpresa` como applier del boot) |
| `contasis_app_mode` | `App.tsx` (localStorage simple) |
| `contasis_last_backup` | `useBackup` |
| `contasis_polizas` / `contasis_accounts` / `contasis_fixed_assets` / `contasis_final_inventories` (SIN sufijo) | ARCHIVO HISTÓRICO (C-2) — leídos UNA vez por la migración a clientes; nunca se escriben ni se borran |
| `contasis_polizas_migrated` / `contasis_catalog_migrated` | Flags legados: solo se consultan dentro de la migración one-shot C-2; mantienen su semántica original |
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
| `Poliza` | Póliza contable formal (id, `folio` consecutivo INDEPENDIENTE por tipo y por CLIENTE, `tipo: TipoPoliza`, fecha, concepto, `partidas[]`, `totalDebe`/`totalHaber` recalculados al guardar con `normalizeAmount`, `elaboro?`, `autorizo?`). Unidad de captura del módulo de Pólizas (ver `PLAN_POLIZAS.md`) |
| `Empresa` | Cliente del contador (C-1 de `PLAN_MULTI_CLIENTE.md`): `{ id` (uuid estable; compone las claves de storage por cliente)`, nombre, rfc? }` — el RFC es el que llevan los XML SAT (C-7) |
| `EstadoEmpresas` | Metadatos de clientes: `{ activaId: string \| null, empresas: Empresa[] }`; clave `contasis_empresas`, dueño `useEmpresas` |
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
| `contasis_empresas` | `{ activaId, empresas: Empresa[] }` — metadatos de clientes (C-1/C-3; RFC propio por cliente) |
| `contasis_empresas_migrated` | Flag `true` cuando la migración one-shot legacy → cliente por defecto "Mi Empresa" ya corrió (C-2) |
| `contasis_polizas_<empresaId>` | `Poliza[]` del cliente (folios por tipo y por cliente); la clave SIN sufijo quedó como archivo histórico |
| `contasis_accounts_<empresaId>` | Catálogo COMPLETO del cliente: cuentas base (readonly) + propias (post-D-12) |
| `contasis_fixed_assets_<empresaId>` | `FixedAsset[]` del cliente |
| `contasis_final_inventories_<empresaId>` | `{ general: number }` del cliente (post-D-13); formato legacy `{ [journalId]: number }` se normaliza al vuelo |
| `contasis_polizas` / `contasis_accounts` / `contasis_fixed_assets` / `contasis_final_inventories` (sin sufijo) | ARCHIVO HISTÓRICO (C-2): contenido previo a multi-cliente, leído UNA vez por la migración; nunca se escribe ni se borra |
| `contasis_polizas_migrated` | Flag heredado (D-2): respetado dentro de la migración one-shot C-2 |
| `contasis_catalog_migrated` | Flag heredado (D-12): respetado dentro de la migración one-shot C-2 |
| `contasis_journals` | `Journal[]` — ARCHIVO HISTÓRICO: no se escribe desde Fase 5 (D-2/D-15); solo lectura para migraciones y compatibilidad de restauración |
| `contasis_app_mode` | Solo localStorage: `'basic' \| 'fiscal'` |
| `contasis_last_backup` | Timestamp de último respaldo |

La composición de las claves por cliente se hace SIEMPRE con el helper puro `clavePorEmpresa` (`lib/empresas.ts`, C-2).

`migrateFromLocalStorage()` traslada datos viejos de `contasis_journals`, `contasis_fixed_assets`, `contasis_final_inventories` (del localStorage) al backend físico, solo si no existen aún.

---

## 6. Sincronización Escritorio ↔ Móvil (bóveda E2EE en Cloudflare KV)

> Reemplazo integral de la capa anterior (PeerJS + Upstash Redis + PIN), ejecutado en `PLAN_SYNC_KV.md` (v0.9.0). Detalle de decisiones en ese plan (K-1 … K-14).

- **Transporte único**: Worker propio en Cloudflare (`worker/src/index.ts`) + KV namespace (`CONTABILIDAD_VAULT`). Nada de PeerJS ni de credenciales de tercero; deploy por GitHub Actions (`workflow_dispatch`) con Tokens `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`.
- **Ciclo de vida** (`src/services/vaultService.ts`): credenciales por dispositivo en `contasis_vault_creds` vía `storageService`; alistamiento por **QR** (`{v,url,vaultId,secretKey}`) o **frase mnemónica determinista** de 6 palabras (la frase GENERA la misma credencial en cualquier dispositivo: `vaultId = vlt_<sha256(frase)[0..12]>`, `secretKey = SHA-256(vaultId:frase)`).
- **Cifrado** (`src/lib/crypto.ts`): AES-GCM 256 con IV de 96 bits por blob; el relay SOLO ve blobs ilegibles. El sobre es `{ciphertext, iv, algoritmo, version}` sin salt.
- **Motor** (`src/services/vaultSyncEngine.ts`, Fase 4): push con debounce 1.5 s + coalescing 120 s (K-5; el flush manual `publicarAhora` y la resolución de conflicto lo SALTAN, y con publicación en vuelo esperan su resultado — bugs de 0.9.6 corregidos: el botón "Publicar ahora" mentía "El relay no respondió" tras una auto-publicación exitosa), sondeo pasivo de 60 s con consulta barata `?version=` + WebSocket en vivo (`/ws`) con degradación natural (K-6; el sondeo corre SIEMPRE — el broadcast del WS solo alcanza al mismo runtime/isolate del worker, el sondeo es la coherencia entre runtimes). Los eventos `error` del motor suben su detalle real hasta SyncModal (App.tsx conecta `falloBoveda`). Carga útil = snapshot v3 completo de TODAS las empresas (K-4); la restauración remota reusa el camino `restore` v3 (DV-C-3).
- **Conflicto "manos sucias"** (K-7): remoto ≤ versión local → ignorar; remoto mayor y local limpio → auto-aplicar; ambos lados cambiaron → `ConflictoBovedaModal` ("Conservar datos locales" publica con `max+1` / "Sobrescribir con datos remotos"). El que gana deja una sola versión para todos.
- **Historial** (K-8): `vlt:<id>:hist:<n>` máx 5, TTL 30 d; consultable en el modal (solo metadatos).
- **Cuota** (K-5, DV-K-1): por push − 1 `put()` + hasta 5 `put()` de historial; sondeo = 1 `get()`, y con WebSocket conectado sondeo suspendido. Presupuesto ajustado al free tier de KV (1 000 escrituras/día, 100 000 lecturas/día).
- **Indicador**: punto en el botón Sync del `AppHeader` (gris sin bóveda / verde al día / naranja pendiente / rojo conflicto o error).

### Distribución y actualizaciones (escritorio · Android · PWA)

Un solo build (`dist/`) alimenta las tres plataformas; cada una con su estrategia de update:

| Plataforma | Distribución | Actualización |
|---|---|---|
| Escritorio | `electron-release.yml` → Release de GitHub (NSIS/DMG/AppImage) | `electron-updater` (`electron/main.js`), progreso en `DownloadProgressBar` |
| Android APK | `electron-release.yml` job `build-android` → asset `.apk` del Release (requiere Secrets `ANDROID_KEYSTORE*`; el `versionCode` lo fija el CI desde `package.json`) | In-app estilo Mihon: `useCheckForUpdates` (solo Android nativo) → `UpdateAvailableModal` (máquina Descargar→%→Instalar) → plugin nativo `AppUpdater` (descarga con progreso a cache + `ACTION_VIEW` vía FileProvider; permiso `REQUEST_INSTALL_PACKAGES`) |
| PWA (web) | Cloudflare Pages, integración Git del dashboard (build `npm run build`, output `dist`, env `VITE_RELAY_URL` en la config del proyecto) | Service worker de `vite-plugin-pwa` (`registerType: 'autoUpdate'`): precache de `**/*.{js,css,html,ico,png,svg,woff2}`, refresco al reabrir/visitar |

Notas operativas duras ganadas en la Fase de updater:
- `MainActivity.load()` registra `AppUpdaterPlugin` ANTES de `super.load()`: el Bridge de Capacitor crea la lista de plugins en `create()`; registrar después de `super.onCreate()` es un no-op silencioso ("plugin not implemented").
- El runtime se limita al APK: `esAndroidNativo` (Capacitor nativo + plataforma android). En web/PWA y Electron el hook no corre (cada quien tiene su updater).
- El fallo de descarga muestra el mensaje real en caja roja del modal (nativo reporta `Throwable` con nombre de excepción) — diagnósticado el caso "plugin no registrado" en pantalla.

---

## 7. Configuración de entorno (`.env.example`)

```env
GEMINI_API_KEY=     # funciones de IA (Google @google/genai existe en package.json)
APP_URL=            # referencia a sí mismo en despliegue
VITE_RELAY_URL=     # URL base del relay propio (ej. https://…workers.dev) — PLAN_SYNC_KV.md K-12
```

> Ojo: esta app se originó como AI Studio applet; `GEMINI_API_KEY`/`APP_URL` son herencia de esa plantilla. Las variables usadas por Vite **deben** llevar el prefijo `VITE_`.
>
> **Relay de la bóveda:** `VITE_RELAY_URL` es opcional; sin ella el botón Sync avisa "Relay no configurado" y la app funciona igual. Para desarrollo local se incluye en un `.env` manual (gitignoreado). El despliegue del worker y su namespace KV está documentado en `worker/README.md`; las credenciales de deploy van como **GitHub Secrets** por el convenio del plan.
>
> **PWA en Cloudflare Pages (integración Git del dashboard):** el build de Pages corre con las variables definidas EN SU PROPIA configuración — los Secrets de GitHub (deploy del relay, firma del APK) no le alcanzan. Hoy la única variable requerida del proyecto Pages es `VITE_RELAY_URL` (el runtime habla HTTPS/WS contra el relay; el cache de KV vive del lado del Worker, sin tokens — ver §6 y `BACKLOG.md` para el blindaje del relay).

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

Dependencias clave instaladas: React 19, Tailwind v4 (`@tailwindcss/vite`), ExcelJS, **xlsx** (lectura de imports), jsPDF + jspdf-autotable, html2canvas-pro, qrcode.react, vite-plugin-pwa, @capacitor-mlkit/barcode-scanning, @capacitor/android (proyecto `android/` committeado), electron-updater, Motion, lucide-react.

El `npm run build` genera además del `dist/` clásico: `manifest.webmanifest`, `sw.js` y `registerSW.js` (PWA). En el APK el SW no aplica (Capacitor WebView no ejecuta service workers); en escritorio nadie lo registra — neutro.

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
- **Niveles cubiertos (22 archivos / 249 tests):**
  1. Unitarias puras: `lib/accounting.test.ts` (Cuentas T, saldos por naturaleza, depreciación, INPC truncado + validación/flatten/folios/entrada-a-póliza), `lib/format.test.ts` (normalización, parseo de importaciones, sanitización de input y contrato de `parseJournalImport`), `lib/satExport.test.ts` (XML PL re-parseado: folios reales, tipos 1/2/3, CompNal, escaping, filename) y `lib/empresas.test.ts` (C-2: composición de claves por cliente + normalizadores `arrayDe`/`objetoDe`).
  2. Funcional: `lib/export.test.ts` — el workbook Excel se RELEE con ExcelJS (solo `file-saver` mockeado) y el PDF se valida por firma `%PDF-` real.
  3. Migraciones: `lib/migrateJournalsToPolizas.test.ts` (determinismo congelado: folios por tipo, ids, CFDI/RFC) y `lib/migrateCatalogToGlobal.test.ts` (D-12: dedup por código, idempotencia, orden).
  4. Hooks: `hooks/usePolizas` (CRUD de pólizas, folios por tipo, tipo congelado en edición, hydrate persistente + `hydrateEmpresa` por cliente, puerta `canSave`), `useEmpresas` (CRUD de clientes, guarda de último cliente C-8, hydrate, flag own), `useCatalog` (catálogo por cliente: recuperación de base, dedup por `code`, debounce gated por `canSave`, `hydrateEmpresa`), `useAppData` (boot multi-cliente: migración one-shot C-2, carga del activo, recarga por cambio de cliente C-4, fallback de metadatos corruptos SIN escribir claves), `useBackup` (respaldo v3 con todas las empresas, import v3/v2/v1, vigía 7 días, import corrupto NO restaura), `useInventories` (clave 'general' D-13, helper `inventoriesToGeneral`, `hydrateEmpresa`, sin auto-guardado), `lib/navigation.test.ts` (DEFAULT_TAB = polizas, composición de pestañas).
  5. Render: `components/polizas/PolizaForm.test.tsx` (partida doble en vivo, tipo congelado D-8), `components/JournalView.test.tsx` (contrato de solo lectura) y `components/EmpresasModal.test.tsx` (gestor de clientes C-1/C-8: switch, alta recortada, edición nombre+RFC mayúsculas, baja con confirmación, último cliente deshabilitado).
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
| Capturar/editar/imprimir pólizas contables | `src/components/polizas/` (UI) · `src/hooks/usePolizas.ts` (reglas: folios por tipo y cliente, validación, tipo congelado) · `src/lib/accounting.ts` (validación partida doble, folio formateado) |
| Gestionar clientes (switch/alta/renombre/RFC/baja) | `src/components/EmpresasModal.tsx` (UI) · `src/hooks/useEmpresas.ts` (CRUD + activaId) · botón del header en `layout/AppHeader.tsx` |
| Cambiar cómo se cargan/cambian los clientes | `src/hooks/useAppData.ts` (boot + recarga C-4) |
| Modificar migraciones legacy | `useAppData.ts` (migración one-shot a cliente por defecto C-2, que respeta los flags heredados) · `src/lib/migrateJournalsToPolizas.ts` · `src/lib/migrateCatalogToGlobal.ts` (D-12) · `inventoriesToGeneral` en `hooks/useInventories.ts` (D-13) |
| Ajustar el reporte del Libro Diario (solo lectura y sus exports) | `src/components/JournalView.tsx` (fecha/folio/tipo/cuenta/concepto/debe/haber) |
| Cambiar navegación de pestañas / tab inicial | `src/lib/navigation.ts` (BASIC_NAV_TABS, FISCAL_NAV_TABS, DEFAULT_TAB) |
| Cambiar XML/TXT SAT o DIOT | `src/lib/satExport.ts` (el XML de Pólizas consume PÓLIZAS reales desde ContabilidadElectronicaView: folio real = NumUnIdenPol, Fase 6) |
| Cambiar reglas de persistencia | `src/services/storageService.ts` (+ IPC en `electron/main.js`) |
| Cambiar lógica de sync | `src/services/vaultSyncEngine.ts` (motor) · `SyncModal.tsx` / `ConflictoBovedaModal.tsx` (UI) · `src/services/vaultService.ts` (credenciales/opera) |
| Cambiar el updater in-app de Android | plugin nativo `android/app/src/main/java/…/AppUpdaterPlugin.java` (descarga/instalación) · `src/services/appUpdater.ts` (puente JS) · `src/components/modals/UpdateAvailableModal.tsx` (UX máquina de estados) |
| Cambiar la build/distribución (desktop · APK · PWA) | `.github/workflows/electron-release.yml` (desktop + APK + release) · manifest/PWA en `vite.config.ts` (`VitePWA`) |
| Agregar una vista/nueva pantalla | Nuevo componente + switch en `App.tsx` |
| Cambiar ventana Electron / autoupdater | `electron/main.js` |
| Agregar/modificar lógica sujeta a pruebas | Colocar/actualizar el `.test.ts(x)` COLOCADO junto al módulo (regla y niveles en §9 "Red de pruebas"); `npm run lint && npm run test` en verde antes de commitear |

### Quirks conocidos (anotados, no son bugs por decidir — ver `PLAN_POLIZAS.md` §4.5)

1. **Encabezado `CONCEPTO` del Excel de importación nunca funcionó:** el parser (`importEntriesFromExcel.ts`) valida los encabezados ANTES de normalizarlos y solo reconoce `GLOSA`; así se congeló por decisión del plan (no rompe nada: la plantilla siempre usó `GLOSA`).
2. **Error de importación Excel siempre genérico:** el catch de `PolizaView` muestra "Formato no soportado" ante CUALQUIER fallo (JSON corrupto, plantilla incompleta, etc.) — comportamiento heredado que se conservó.
3. **`NumOrden` fijo en el XML de Pólizas:** lleva el valor de referencia `AFO1234567/26` (entrega estándar AF, Acto de Fiscalización). Personalizarlo sería un cambio futuro del valor, no del pipeline.
4. **Inventario final sin auto-guardado:** `contasis_final_inventories_<empresaId>` solo persiste al capturar el inventario o aplicar sync (diseño fiel al original, no descuido).
5. **Metadatos de clientes corruptos → cliente en RAM:** si `contasis_empresas` se corrompe con el flag ya presente, la app arranca con un cliente "Mi Empresa" NUEVO en RAM y el boot NO escribe claves de dominio (el storage real queda intacto); las claves por cliente huérfanas no son visibles hasta un restauro de respaldo (fallback defensivo, aceptado).
6. **Baja de cliente no borra claves de dominio:** `eliminarEmpresa` solo saca el cliente de `contasis_empresas`; sus claves `contasis_<dominio>_<id>` quedan huérfanas en el almacenamiento (archivo permanente, conservadurismo C-2/C-8).
