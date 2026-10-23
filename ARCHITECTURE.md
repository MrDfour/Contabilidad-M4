# Mapa del Proyecto — Contabilidad M4 Pro

> **Propósito:** Este documento es el mapa único de referencia para trabajar en el código.
> Su objetivo es dar contexto completo a un asistente de IA (o desarrollador nuevo) en una sola lectura,
> sin necesidad de explorar todo el repositorio.
> **Regla de mantenimiento:** si cambias la estructura, los datos almacenados o agregas archivos, actualiza este documento en el mismo commit.
>
> **Planes cerrados:** los planes ya ejecutados (`PLAN_POLIZAS`, `PLAN_MULTI_CLIENTE`,
> `PLAN_SYNC_KV`, `PLAN_FUSION_BOVEDA`, `REFACTORING`) quedaron RETIRADOS del
> repositorio para no contaminarlo (2026-10-23). Las claves de decisión que este
> documento cita de ellos (D-xx, C-xx, K-xx, F-xx) siguen siendo contexto histórico
> válido; su contenido completo vive en el historial de git. Este archivo es ahora la
> única documentación viva de decisiones, junto con `BACKLOG.md` (trabajo pendiente)
> y `PLAN_CHEQUES.md` (único plan activo).

Versión del código: v0.9.9 · Licencia: Apache-2.0 · README de usuario: `README.md`

---

## 1. Qué es esta aplicación

App de gestión contable (español, dominio fiscal mexicano) que funciona en **tres plataformas con un solo código base**:

| Plataforma | Empaquetado | Punto de entrada extra |
|---|---|---|
| Web/PWA (Cloudflare Pages) | Vite (build estático en `dist/`) + `vite-plugin-pwa` (manifest + service worker) | — |
| Escritorio | Electron (instaladores con `electron-builder`) | `electron/main.js` |
| Android | Capacitor (`capacitor.config.ts`, proyecto `android/` committeado) | `MainActivity` (plugin `AppUpdater`) |

Módulos funcionales: Pólizas Contables (captura principal: Ingreso/Egreso/Diario, en pantalla Clásica o en formato papel mexicano), Multi-Cliente (contador con varios clientes: cada cliente = workspace con catálogo/activos/inventario/pólizas/RFC propios), Libro Diario (reporte consolidado de solo lectura, con impresión por día/rango en formato papel), Cuentas T, Balance General, Estado de Resultados, Catálogo de Cuentas, Activos Fijos con depreciación, Contabilidad Electrónica SAT (Anexo 24) y sincronización Escritorio ↔ Móvil.

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
    │                           #   aquí con clave POR CLIENTE y guard de transición de cliente),
    │                           #   cambio de cliente activo, navegación
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
    │   │   ├── PolizaCard.tsx          #   tarjeta: folio ING/EGR/DIA (o "PENDIENTE" con folio
    │   │   │                          #   0 del merge), distintivo de tipo, desglose de
    │   │   │                          #   partidas con sumas iguales; editar/imprimir/eliminar
    │   │   ├── PolizaForm.tsx          #   modal de captura: partida doble EN VIVO (guardado bloqueado
    │   │   │                          #   si <2 partidas o desbalance), tipo CONGELADO al editar (D-8),
    │   │   │                          #   CFDI UUID/RFC por partida en modo fiscal (+ Lectura XML y
    │   │   │                          #   modal de discrepancia, mismo patrón que EntryForm);
    │   │   │                          #   toggle de vista "Clásica | Papel": el modo papel captura
    │   │   │                          #   directo a la hoja clásica mexicana (grid DEBE/HABER con
    │   │   │                          #   SUMAS IGUALES en vivo + campo Revisó); solo cambia la
    │   │   │                          #   presentación (misma validación/captura compartida), el
    │   │   │                          #   modo se persiste en localStorage `contasis_modo_captura`
    │   │   │                          #   CH-8 (PLAN_CHEQUES): papel FIRST — control único
    │   │   │                          #   FORMATO ▾ (Ingresos/Egresos/Diario/Cheque) reemplaza
    │   │   │                          #   el toggle del header; ÚLTIMA hoja usada en
    │   │   │                          #   `contasis_hoja_papel` (default Diario); grid papel
    │   │   │                          #   responsive (apilado en móvil); hoja CHEQUE con datos
    │   │   │                          #   del cheque (CH-4) + preview de anexo local (CH-6,
    │   │   │                          #   persistencia real en Fase 4; imagen NO viaja en bóveda)
    │   │   ├── PolizaSheet.tsx         #   hojas de póliza en FORMATO PAPEL compartidas
    │   │   │                          #   (PolizaPapelSheet: columnas Cta/Scta/Nombre/Parcial/
    │   │   │                          #   Debe/Haber, cuadro CONCEPTO, franja Control/Hecho por/
    │   │   │                          #   Revisado/Autorizado/Diario, Fecha/Nº póliza; renglones
    │   │   │                          #   por parámetro con RENGLONES_BASE=10 y overrides de
    │   │   │                          #   título/folio para los impresos consolidados; la consumen
    │   │   │                          #   la impresión individual Y el diario)
    │   │   │                          #   CH-9/CH-15 de PLAN_CHEQUES: PolizaChequeSheet (hoja
    │   │   │                          #   del cheque: título sello, zona de calcado EN BLANCO,
    │   │   │                          #   datos del cheque + fecha + Nº póliza, SUMAS IGUALES
    │   │   │                          #   con comentario de pendencia, Concepto del pago +
    │   │   │                          #   firma) y despacho HojaPolizaImprimible por tipo
    │   │   ├── PolizaPrintModal.tsx    #   impresión individual (@media print, @page A4 margen 12mm):
    │   │   │                          #   renderiza HojaPolizaImprimible (cheque→hoja propia);
    │   │   │                          #   celdas de firma Elaboró/Revisó quedan en blanco si no
    │   │   │                          #   hay captura (se firman a mano en el impreso)
    │   │   ├── DiarioPrintModal.tsx    #   impresión del LIBRO DIARIO (botón "Imprimir Pólizas" en
    │   │   │                          #   JournalView): filtro por día o rango Desde/Hasta con
    │   │   │                          #   presets Hoy/Este mes y 3 formatos (hoja por póliza /
    │   │   │                          #   póliza diaria consolidada / libro continuo); el formato
    │   │   │                          #   elegido se persiste en localStorage
    │   │   │                          #   `contasis_diario_formato`; toggle "Incluir cheques"
    │   │   │                          #   (Fase 3 PLAN_CHEQUES) en `contasis_diario_cheques`
    │   │   │                          #   (default ON): con OFF el cheque sale COMPLETO del
    │   │   │                          #   libro (hojas/consolidado/continuo/sumas) y el panel
    │   │   │                          #   avisa los excluidos; los consolidados se arman
    │   │   │                          #   en RAM con consolidarPolizasDiaria (folioOverride)
    │   │   └── AsignarFoliosPendientesModal.tsx  # v0.9.9: previsualización y confirmación de
    │   │                              #   la acción F-6 (PLAN_FUSION_BOVEDA.md): asigna el
    │   │                              #   siguiente folio disponible del tipo a los folio === 0
    │   │                              #   que dejó el merge, en orden capturadoEn (manual)
    │   ├── TAccountsView.tsx         # Cuentas T calculadas de los asientos; export PDF/Excel
    │   ├── BalanceSheetView.tsx      # Balance General (Activo/Pasivo/Capital) desde saldos Cuentas T
    │   ├── ProfitLossView.tsx        # Estado de Resultados (método analítico); inventario final manual
    │   ├── CatalogView.tsx           # Catálogo de cuentas: listar/crear/editar (INITIAL_ACCOUNTS read-only)
    │   ├── FixedAssetsView.tsx       # Activos fijos: registro, baja, depreciación mensual (genera asiento),
    │   │                             #   deducción fiscal INPC
    │   ├── ContabilidadElectronicaView.tsx  # Genera CT.xml (catálogo SAT), BN.xml (balanza), DIOT.txt;
    │   │                             #   valida RFC; tipo de póliza diario/ingreso/egreso
    │   ├── SyncModal.tsx             # UI de emparejamiento Escritorio↔Móvil: QR, PIN de 6 dígitos,
    │   │                             #   resolución de conflictos (keep local / remote overwrite);
    │   │                             #   v0.9.9: ROL DUAL en web (PWA) — sugerirRolWeb (UA inicial)
    │   │                             #   + toggle Escritorio/Móvil; nativos (Electron/APK) rol fijo
    │   ├── FeedbackModal.tsx         # Envío de feedback del usuario (issues)
    │   └── modals/                   # Modales globales extraídos de App (Fase 0): presentacionales,
    │       ├── GlobalInfoModal.tsx     #   éxito/error + variante de sugerencia de respaldo,
    │       │                          #   exporta ModalInfo y BACKUP_SUGGESTION_TITLE
    │       ├── ConfirmDeleteModal.tsx  #   confirmación de borrado (exporta ConfirmDeleteData)
    │       ├── UpdateAvailableModal.tsx # Aviso de nueva versión para APK Android MÁQUINA DE
    │       │                          #   ESTADOS estilo Mihon: Descargar → Descargando %
    │       │                          #   (via plugin nativo) → Instalar / Reintentar, changelog,
    │       │                          #   saltar versión; en web cae a Browser.open (fallback)
    │       ├── ConflictoBovedaModal.tsx # K-7 (v0.9.8): 3 caminos desde v0.9.9 ('local' |
    │       │                          #   'remoto' | 'fusionar'); al cancelar la fusión reaparece
    │       ├── FusionBovedaModal.tsx    # v0.9.9: revisión PREVIA de la fusión en 3 pestañas
    │       │                          #   (Resumen / Folios en disputa / Duplicados); "Aplicar
    │       │                          #   fusión" bloqueado sin decisiones F-8; publica el motor
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
    │   │                        #   (D-10), entriesToPolizasDiarias (D-11) y los folios pendientes
    │   │                        #   del merge: esFolioPendiente/asignarFoliosPendientes (F-6,
    │   │                        #   v0.9.9; formatPolizaFolio muestra "PENDIENTE" con folio 0);
    │   │                        #   consolidarPolizasDiaria (PURAMENTE de impresión: agrega TODAS
    │   │                        #   las pólizas de un día por cuenta+lado en una sola póliza
    │   │                        #   diaria con glosas unidas — nunca persiste ni gasta folio)
    │   ├── navigation.ts        # Tipos de navegación compartidos: AppMode, AppTab, NavigationTab,
    │   │                        #   DEFAULT_TAB ('polizas'), BASIC_NAV_TABS y FISCAL_NAV_TABS.
    │   │                        #   Consumido por App y layout/
    │   ├── empresas.ts          # ⭐ MULTI-CLIENTE (PLAN_MULTI_CLIENTE): helpers PURAS de claves
    │   │                        #   por cliente (clavePorEmpresa, arrayDe, objetoDe, BASES_POR_EMPRESA).
    │   │                        #   Toda composición de clave `<dominio>_<empresaId>` pasa por aquí.
    │   ├── unionBovedas.ts      # ⭐ FUSIÓN DE BÓVEDA (v0.9.9, PLAN_FUSION_BOVEDA): PURA. analizarFusion
    │   │                        #   (clasifica entrantes: directos, ediciones cruzadas F-3, colisiones
    │   │                        #   de folio F-2, duplicados F-5, clientes faltantes F-4) y aplicarFusion
    │   │                        #   (aplica DecisionesFusion → snapshot v3 fusionado). Sin red/storage.
    │   ├── importEntriesFromExcel.ts  # Parser PURO de la plantilla Excel (valida encabezados,
    │   │                        #   carry-forward de celdas, groupKey por ASIENTO_ID,
    │   │                        #   cuentas por nombre normalizado/código y serial de Excel para fechas);
    │   │                        #   devuelve { entries, unmatchedAccounts } — el UI (polizas/PolizaView
    │   │                        #   desde Fase 4) arma los modales y convierte vía entriesToPolizasDiarias
    │   ├── migrateJournalsToPolizas.ts # Migración ONE-SHOT diarios legacy → pólizas (PURA, sin storage;
    │   │                        #   folios por tipo, ids reaprovechados, CFDI/RFC preservados).
    │   │                        #   Se invoca desde useAppData (primera carga) y App (respaldo v1
    │   │                        #   y sync remoto viejo → D-14); decisiones D-2/D-3/D-4 del
    │   │                        #   plan de pólizas (retirado; historial en git)
    │   ├── migrateCatalogToGlobal.ts  # Migración ONE-SHOT subcuentas de diarios → catálogo global
    │   │                        #   (D-12, PURA: dedup por code, isReadOnly false en nuevas,
    │   │                        #   idempotente). La goberna el flag `contasis_catalog_migrated`
    │   ├── appMeta.ts           # APP_VERSION (única fuente del número de versión mostrado en UI)
    │   ├── temas.ts            # v0.9.9: catálogo de TEMAS de la UI (oscuro/claro/HC-oscuro/HC-claro),
    │   │                       #   clave global `contasis_tema`, temaValido, COLOR_BARRA_TEMA.
    │   │                       #   Colores en src/temas.css (remapeo var(--color-*) de Tailwind v4;
    │   │                       #   NINGÚN componente cambia clase — el switch es data-theme en <html>).
    │   ├── utils.ts             # Exportaciones y utilidades: exportToExcel, exportTAccountsStyleToExcel,
    │   │                        #   exportToPDF (captura HTML→PDF), exportTableToPDF (autotable), readExcel,
    │   │                        #   cn (clases), calculateMonthlyDepreciation,
    │   │                        #   calculateFiscalDeduction (INPC)
    │   └── satExport.ts         # Serializadores XML TXT del módulo SAT (CT/BN, PL) y DIOT.
    │                            #   `buildPolizasXML` puro (Fase 6: folios reales, Concepto por
    │                            #   partida) + wrapper `exportPolizasXML` (DV-4)
    │
    │   # ⭐ Red de pruebas: cada .test.ts(x) COLOCADO junto a lo que prueba (src/**),
    │   #    descubierto por vitest; la misma pasada `npm run test` incluye el test
    │   #    del relay en worker/tests/ (ver sección 9, "Red de pruebas"):
    │   ├── lib/accounting.test.ts · format.test.ts · export.test.ts · empresas.test.ts
    │   │    · navigation.test.ts · satExport.test.ts · unionBovedas.test.ts
    │   │    · mnemonic.test.ts · crypto.test.ts
    │   ├── lib/migrateJournalsToPolizas.test.ts · lib/migrateCatalogToGlobal.test.ts
    │   ├── hooks/usePolizas.test.ts · useCatalog.test.ts · useAppData.test.ts
    │   │    · useEmpresas.test.ts · useBackup.test.ts · useInventories.test.ts · useTemaApp.test.ts
    │   ├── services/vaultService.test.ts · services/vaultSyncEngine.test.ts
    │   ├── components/EmpresasModal.test.tsx · SyncModal.test.tsx · JournalView.test.tsx
    │   ├── components/polizas/PolizaForm.test.tsx · DiarioPrintModal.test.tsx
    │   │    · AsignarFoliosPendientesModal.test.tsx
    │   ├── components/modals/FusionBovedaModal.test.tsx
    │   └── test/setup.ts        # Setup global: limpieza entre tests + polyfills jsdom
    │
    ├── services/
    │   ├── storageService.ts    # ⭐ Abstracción de persistencia multiplataforma (ver sección 5):
    │   │                        #   saveToStorage / loadFromStorage / migrateFromLocalStorage
    │   ├── attachmentService.ts # ⭐ OWNER del binario del anexo del cheque (Fase 4 PLAN_CHEQUES):
    │   │                        #   escalera de compresión CONGELADA §8.2 (nunca rechaza: capado
    │   │                        #   300 KB), dedupe sha256, registro `contasis_anexos_<empresaId>`
    │   │                        #   + binario local por backend (IndexedDB / Filesystem / IPC),
    │   │                        #   huérfanos CH-14 (aviso día 4 / purga día 5) y descarga de rescate
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
        │                            #   persistencia incluso [] con puerta canSave +
        │                            #   guard de transición de cliente (salta 1 escritura
        │                            #   cuando la clave acaba de cambiar: anti-race C-4)
        ├── useCatalog.ts            # ⭐ Dueño de `contasis_accounts_<empresaId>`: catálogo POR
        │                            #   CLIENTE (heredero del global D-12), auto-recuperación
        │                            #   quirúrgica de cuentas base por cliente, hydrateEmpresa,
        │                            #   guardado con debounce 300ms gated por canSave +
        │                            #   guard de transición de cliente (anti-race, C-4)
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
        → JournalView (REPORT de solo lectura sobre las mismas pólizas cronológicas;
          su impresión por día/rango arma los documentos con polizas/DiarioPrintModal)
        → ProfitLossView/FixedAssetsView (capturas programáticas) → createProgrammaticPoliza (D-10) → usePolizas
```

- `App.tsx` es el orquestador: retiene navegación (`appMode`, `activeTab`), modales y el panel de ACTIVOS FIJOS (su dominio no vive en hook: `App` es dueño de la clave `contasis_fixed_assets_<empresaId>`, C-2) y compone los hooks de dominio. Desde Fase 5 NO existe dominio Journal en RAM.
- **MULTI-CLIENTE (D-17/F-17 de `PLAN_MULTI_CLIENTE.md`):** la captura y todos los reportes operan SIEMPRE sobre el CLIENTE ACTIVO. `contasis_empresas` (dueño: `useEmpresas`) guarda la lista y el `activaId`; los 4 dominios de datos viven en claves por cliente (`contasis_<dominio>_<empresaId>`, C-2) y el cambio de cliente es una recarga orquestada por `useAppData` con `canSave` bajado durante la transición (C-4). COMPLEMENTO del C-4 (guard anti-race): la puerta `canSave` entra DEMASIADO TARDE en el commit del cambio de cliente (los efectos de persistencia de dominio corren antes que el de `useAppData`, por orden de declaración en App), así que CADA efecto de persistencia automática (`usePolizas`, `useCatalog` y el efecto de activos fijos en App) lleva un **guard de transición**: si la clave de storage acaba de cambiar, salta UNA escritura — sin él se escribia el estado en RAM del cliente ANTERIOR en la clave del NUEVO (contaminaba y destruyó los datos destino: el switch parecía "no hacer nada"). Los inventarios están a salvo (solo persisten por escritura explícita). Los folios de póliza son consecutivos POR TIPO Y POR CLIENTE. El RFC de la exportación SAT es `Empresa.rfc` (C-7): se precarga en Cont. Electrónica y se persiste tras exportar.
- **Cutover de reportes (Fase 4) / Desmantelamiento Journal (Fase 5) de `PLAN_POLIZAS.md`:** Cuentas T, Balance, Estado de Resultados, Catálogo (guard de cuentas en uso) y Cont. Electrónica se derivan de la PROYECCIÓN de pólizas (orden cronológico: fecha + folio). El Libro Diario es un reporte de solo lectura con las MISMAS pólizas — y su impresión por día/rango en 3 formatos de papel vive en `polizas/DiarioPrintModal.tsx`; los consolidados tipo "póliza diaria" son artefactos SOLO de impresión que nunca persisten ni gastan folio. Las capturas programáticas pasan por `createProgrammaticPoliza` (adaptación `entryToPolizaInput` en App). Los badges de encabezado de Balance/P&L/Cuentas T muestran el literal fijo "Consolidado".
- **Captura/impresión en FORMATO PAPEL:** la captura es PRIMERO HOJA (CH-8 de PLAN_CHEQUES): `polizas/PolizaForm.tsx` abre en modo papel con control único **FORMATO ▾** (Ingresos/Egresos/Diario/Cheque — es el tipo de póliza, 1:1 con la hoja), la ÚLTIMA hoja usada se recuerda en `contasis_hoja_papel` (default Diario), y el enlace "usar captura clásica (campos)" cambia al modo de columnas (ambos modos persistidos por `PolizaView` en `contasis_modo_captura`, default 'papel'; la hoja de cheque añade datos del cheque CH-4 y preview de anexo local CH-6). El impreso físico vive en `polizas/PolizaSheet.tsx` — `HojaPolizaImprimible` despacha por tipo: la póliza de CHEQUE imprime su hoja propia (`PolizaChequeSheet`: zona de calcado en blanco CH-5, datos del cheque, pie SUMAS IGUALES CH-15 con comentario de pendencia, Concepto del pago + firma) y las demás la hoja clásica (`PolizaPapelSheet`); lo comparten la impresión individual `PolizaPrintModal` y el diario `DiarioPrintModal` (donde el toggle "Incluir cheques" en `contasis_diario_cheques`, default ON, saca al cheque del libro impreso completo). Las celdas de firma Elaboró/Revisó quedan en blanco si no hay captura (se firman a mano).
- **Anexo de imagen del cheque (Fase 4 de `PLAN_CHEQUES.md`):** pieza OWNER `services/attachmentService.ts` (anti-R1: los componentes jamás tocan el binario). Flujo al guardar: `PolizaForm` entrega el archivo **como 2º argumento SÍNCRONO de `onSave`** (antes viajaba por un estado del dueño y React lo entregaba tarde: el anexo se perdía al guardar — corregido 2026-10-23) → `PolizaView` lo procesa con `guardarAnexo` (escalera de compresión congelada §8.2: objetivo 150 KB, CAP 300 KB — se guarda CAPADO, NUNCA rechaza; fallback JPEG) → sha256 con dedupe CH-10 → binario al backend local + metadato al registro por cliente; el metadato (`ChequeAnexo`) entra a `Poliza.cheque.anexos[]` (CH-16) y viaja con la póliza (respaldos/bóveda: metadatos SÍ, imágenes NO — CH-12, nota en el pie de respaldo). `PolizaCard` muestra miniatura compacta (~64 px, clic abre lightbox) o placeholder "solo en su equipo" si este dispositivo no tiene el binario (CH-11). Si el alta de la póliza falla el binario queda HUÉRFANO → ciclo CH-14: purga del día 5 al montar el módulo Pólizas + banner del día 4 con [Guardar en mi dispositivo] (`descargarAnexo`: `a.download` web, Filesystem+Share nativo) / [Ver] / [Descartar ya]. Al ELIMINAR una póliza, App borra en cascada el binario solo si pierde la ÚLTIMA referencia (dedupe puede compartirlo). Para SAT (Anexo 24) el cheque se exporta como EGRESOS (`TIPO_POLIZA_SAT.cheque = '2'`, CH-2).
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
| `Poliza` | Póliza contable formal (id, `folio` consecutivo INDEPENDIENTE por tipo y por CLIENTE, `tipo: TipoPoliza` — 4 valores CH-1 de PLAN_CHEQUES: ingreso/egreso/diario/**cheque con folio CHE- propio**, fecha, concepto, `partidas[]`, `totalDebe`/`totalHaber` recalculados al guardar con `normalizeAmount`, `elaboro?`, `reviso?`, `autorizo?`, `cheque?: ChequeDatos` CH-4 SOLO tipo cheque: número bancario/banco/beneficiario + anexos (referencias, binario local CH-6/CH-11)). Unidad de captura del módulo de Pólizas (polizas/, plan retirado en git) |
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
| `contasis_anexos_<empresaId>` | Registro de METADATOS del anexo del cheque (`ChequeAnexo[]`: sha256, bytes, mime, capturadoEn) — dueño: `attachmentService` (Fase 4 PLAN_CHEQUES). Los METADATOS viajan en `Poliza.cheque.anexos[]` y SÍ entran a respaldos/bóveda; el BINARIO nunca (CH-11/CH-12) |
| IndexedDB `contasis_anexos` / `Directory.Data` `anexo_<empresaId>_<sha>.<ext>` / `userData/attachments/` | El BINARIO del anexo, 100% LOCAL por backend: web (IndexedDB, store `anexos`, clave `<empresaId>_<sha>`) / Android (Filesystem) / Electron (vía IPC `save-attachment`/`load-attachment`/`delete-attachment`). Los componentes NUNCA lo tocan: solo `attachmentService` (anti-R1) |
| `contasis_diario_cheques` | Toggle "Incluir cheques" del diario impreso (default ON; OFF saca las pólizas de cheque del libro completo) |
| `contasis_hoja_cheque_imagen` | Opción "Con imagen del cheque" (decisión del usuario 2026-10-23, amplía CH-5): al imprimir la hoja de cheque, su zona de calcado lleva la IMAGEN anexa en vez de quedar en blanco (solo si este equipo tiene el binario CH-11). Default '0' (en blanco para el papel carbón); preferencia COMPARTIDA por el diario (`DiarioPrintModal`) y la impresión individual (`PolizaPrintModal`) |

La composición de las claves por cliente se hace SIEMPRE con el helper puro `clavePorEmpresa` (`lib/empresas.ts`, C-2).

`migrateFromLocalStorage()` traslada datos viejos de `contasis_journals`, `contasis_fixed_assets`, `contasis_final_inventories` (del localStorage) al backend físico, solo si no existen aún.

---

## 6. Sincronización Escritorio ↔ Móvil (bóveda E2EE en Cloudflare KV)

> Reemplazo integral de la capa anterior (PeerJS + Upstash Redis + PIN), ejecutado en v0.9.0 (plan de sync KV, retirado del repo). Detalle histórico de decisiones: K-1 … K-14, en el historial de git; el detalle vivo está en esta sección.

- **Transporte único**: Worker propio en Cloudflare (`worker/src/index.ts`) + KV namespace (`CONTABILIDAD_VAULT`). Nada de PeerJS ni de credenciales de tercero; deploy por GitHub Actions (`workflow_dispatch`) con Tokens `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`.
- **Ciclo de vida** (`src/services/vaultService.ts`): credenciales por dispositivo en `contasis_vault_creds` vía `storageService`; alistamiento por **QR** (`{v,url,vaultId,secretKey}`) o **frase mnemónica determinista** de 6 palabras (la frase GENERA la misma credencial en cualquier dispositivo: `vaultId = vlt_<sha256(frase)[0..12]>`, `secretKey = SHA-256(vaultId:frase)`). **Rol dual web (v0.9.9):** en la PWA el usuario elige si el dispositivo actúa como Escritorio (genera QR/frase, crea la bóveda) o Móvil (alinea pegando; el escaneo con cámara existe SOLO en el APK) — estado inicial `sugerirRolWeb` vía UA + toggle en `SyncModal`; Electron y APK mantienen su rol fijo sin toggle.
- **Cifrado** (`src/lib/crypto.ts`): AES-GCM 256 con IV de 96 bits por blob; el relay SOLO ve blobs ilegibles. El sobre es `{ciphertext, iv, algoritmo, version}` sin salt.
- **Motor** (`src/services/vaultSyncEngine.ts`, Fase 4): push con debounce 1.5 s + coalescing 120 s (K-5; el flush manual `publicarAhora` y la resolución de conflicto lo SALTAN, y con publicación en vuelo esperan su resultado — bugs de 0.9.6 corregidos), sondeo pasivo de 60 s con consulta barata `?version=` + WebSocket en vivo (`/ws`) con degradación natural (K-6; el sondeo corre SIEMPRE — el broadcast del WS solo alcanza al mismo runtime/isolate del worker, el sondeo es la coherencia entre runtimes). **Chequeo pre-publicación (v0.9.8)**: el PUT va precedido de un GET barato del vigente — si el remoto es más nuevo: dispositivo LIMPIO lo absorbe y publica encima; dispositivo SUCIO abre el conflicto K-7 en vez de pisar el blob con una versión colisionada. **Restaurar historial (v0.9.8)**: el SyncModal lista versiones previas (metadatos; el worker solo manda blobs con `?full=1`) y permite restaurar cualquier versión — se aplica EN PANTALLA sin retroceder `versionLocal` (el sondeo no la re-pisa) ni fijar huella (el auto-publica la sube como versión nueva para toda la bóveda). Los eventos `error` del motor suben su detalle real hasta SyncModal. Carga útil = snapshot v3 completo de TODAS las empresas (K-4); la restauración remota reusa el camino `restore` v3 (DV-C-3).
- **Conflicto "manos sucias"** (K-7): remoto ≤ versión local → ignorar; remoto mayor y local limpio → auto-aplicar (también por el chequeo pre-publicación); ambos lados cambiaron → `ConflictoBovedaModal` ("Conservar datos locales" publica con `max+1` / "Sobrescribir con datos remotos" — avisa que el lado no conservado queda en el historial de la nube, restaurable desde el SyncModal — / **"Fusionar ambos"**, nuevo en v0.9.9, ver el bullet siguiente). El que gana deja una sola versión para todos.
- **Fusión por hora de captura (v0.9.9, `PLAN_FUSION_BOVEDA.md`)**: tercer camino del K-7. El motor expone `contenidoConflicto()` (descifra el remoto en conflicto SOLO-LECTURA, sin tocar nada) y `aplicarSnapshotFusionado(snapshot)` (restaura en pantalla y publica FORZADO `max(vigente, conflicto)+1` sin chequeo remoto F-7, con `ignorarHuella` para que la huella anti-eco K-11 no silencie el envío del merge; si el PUT falla, el contenido queda aplicado aquí y el sync lo reenvía). La decisión pura vive en `lib/unionBovedas.ts` (`analizarFusion`/`aplicarFusion`, F-1…F-8): entrantes sin colisión conservan folio; ediciones del mismo `id` ganan por `editadoEn` (reportadas); colisiones de folio se deciden POR ELEMENTO con 3 opciones (re-foliar por captura / pendiente folio 0 / final consecutivo); duplicados tipo+fecha+concepto van excluidos por defecto con checkbox; inventarios/catálogo de clientes quedan del dispositivo que dispara; cuentas/activos se unen por `id` con gana local; nada se aplica sin decisiones completas (F-8) vía `FusionBovedaModal`. El fusionado solo suma ALTAS del snapshot v3 (sin tumbstones); el conflicto queda DE PIE en el motor durante la revisión (cancelar lo devuelve intacto). Los entrantes que el usuario deja "pendientes" llegan con `folio === 0` ("PENDIENTE" en pantalla) y se cierran a mano: acción **"Asignar pendientes"** en la vista de Pólizas (`usePolizas.asignarFoliosPendientes` + `AsignarFoliosPendientesModal`, orden `capturadoEn`; `satExport` NO genera la polización SAT si el periodo tiene pendientes).
- **Estampados silenciosos para el merge (v0.9.8, ya en uso)**: `Poliza.capturadoEn` (ISO al alta; `importPolizas` lo ESTIMA con la fecha contable, no con "ahora") y `Poliza.editadoEn` (al editar). Sin UI ni presencia en XML/print; son la materia prima de la fusión por hora de captura (`PLAN_FUSION_BOVEDA.md`, ejecutada).
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
- **Niveles cubiertos (28 archivos / 322 tests — 27 colocados en `src/` + `worker/tests/relay.test.ts`, que la misma pasada `npm run test` incluye):**
  1. Unitarias puras: `lib/accounting.test.ts` (Cuentas T, saldos por naturaleza, depreciación, INPC truncado + validación/flatten/folios/entrada-a-póliza + `consolidarPolizasDiaria`), `lib/format.test.ts` (normalización, parseo de importaciones, sanitización de input y contrato de `parseJournalImport`), `lib/satExport.test.ts` (XML PL re-parseado: folios reales, tipos 1/2/3, CompNal, escaping, filename), `lib/empresas.test.ts` (C-2: composición de claves por cliente + normalizadores `arrayDe`/`objetoDe`), `lib/navigation.test.ts` (DEFAULT_TAB = polizas, composición de pestañas), `lib/unionBovedas.test.ts` (fusión F-1…F-8: análisis de entrantes y aplicación del snapshot fusionado), `lib/mnemonic.test.ts` (frase → credencial determinista) y `lib/crypto.test.ts` (AES-GCM del sobre E2EE).
  2. Funcional: `lib/export.test.ts` — el workbook Excel se RELEE con ExcelJS (solo `file-saver` mockeado) y el PDF se valida por firma `%PDF-` real.
  3. Migraciones: `lib/migrateJournalsToPolizas.test.ts` (determinismo congelado: folios por tipo, ids, CFDI/RFC) y `lib/migrateCatalogToGlobal.test.ts` (D-12: dedup por código, idempotencia, orden).
  4. Servicios de bóveda: `services/vaultService.test.ts` (alistamiento QR/frase, credenciales, verificación de relay) y `services/vaultSyncEngine.test.ts` (motor: debounce/coalescing K-5, chequeo pre-publicación, conflicto K-7, huella anti-eco K-11). El anexo de cheques se cubre en `services/attachmentService.test.ts` (escalera congelada §8.2 + fallback nunca-rechaza CH-9, dedupe CH-10, registro por cliente, huérfanos aviso/purga CH-14, cascada de borrado) y `components/polizas/PolizaCard.test.tsx` (miniatura/placeholder/lightbox en tarjeta).
  5. Hooks: `hooks/usePolizas` (CRUD de pólizas, folios por tipo, tipo congelado en edición, hydrate persistente + `hydrateEmpresa` por cliente, puerta `canSave`, guard de transición C-4), `useEmpresas` (CRUD de clientes, guarda de último cliente C-8, hydrate, flag own), `useCatalog` (catálogo por cliente: recuperación de base, dedup por `code`, debounce gated por `canSave`, `hydrateEmpresa`, guard de transición C-4), `useAppData` (boot multi-cliente: migración one-shot C-2, carga del activo, recarga por cambio de cliente C-4, fallback de metadatos corruptos SIN escribir claves), `useBackup` (respaldo v3 con todas las empresas, import v3/v2/v1, vigía 7 días, import corrupto NO restaura), `useInventories` (clave 'general' D-13, helper `inventoriesToGeneral`, `hydrateEmpresa`, sin auto-guardado), `useTemaApp` (tema → data-theme/meta theme-color).
  6. Render: `components/polizas/PolizaForm.test.tsx` (partida doble en vivo, tipo congelado D-8 + modo papel + CH-8), `components/polizas/DiarioPrintModal.test.tsx` (rango/presets, los 3 formatos del diario y el toggle de cheques de Fase 3), `components/polizas/PolizaSheet.test.tsx` (hoja de cheque: calcado/datos/sumas + despacho por tipo), `components/polizas/AsignarFoliosPendientesModal.test.tsx` (F-6), `components/JournalView.test.tsx` (contrato de solo lectura), `components/SyncModal.test.tsx` (rol dual web v0.9.9, emparejamiento), `components/EmpresasModal.test.tsx` (gestor de clientes C-1/C-8: switch, alta recortada, edición nombre+RFC mayúsculas, baja con confirmación, último cliente deshabilitado) y `components/modals/FusionBovedaModal.test.tsx` (revisión de fusión, decisiones F-8).
- **Regla de oro:** cualquier cambio en `lib/accounting.ts`, `lib/format.ts`, `lib/importEntriesFromExcel.ts`, `lib/migrateCatalogToGlobal.ts` o los hooks de dominio DEBE dejar `npm run lint && npm run test` en verde antes de commitear; si el cambio es intencional de comportamiento, se actualiza el test en el MISMO commit.
- *Quirk de entorno documentado:* Node 22+ trae un `localStorage` global nativo que en Windows puede instalarse sin ruta válida; `setup.ts` rebindea al de jsdom (o memoria) si hace falta. No afecta navegador/Electron.
- Cobertura deliberadamente FUERA de alcance: render completo de `App` (requiere mock de sync/Upstash; `isDesktopRuntime` impide probar el rol escritorio en browser — mejora futura documentada en §6), el rechazo de duplicados de `CatalogView` en render (mismo aserto ya cubierto a nivel de hook en `handleCombinedAccountsUpdate`) y los tests retirados junto al dominio Journal (`useJournals.test.ts` se eliminó con su hook en Fase 5; registro de retiros en el plan de pólizas, retirado del repo).

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
| Cambiar la captura/impresión en FORMATO PAPEL (hoja clásica, hoja de cheque o diario impreso) | `polizas/PolizaForm.tsx` (FORMATO ▾/enlaces, `contasis_modo_captura` + `contasis_hoja_papel`) · `polizas/PolizaSheet.tsx` (`PolizaPapelSheet` + `PolizaChequeSheet` + despacho `HojaPolizaImprimible`) · `polizas/PolizaPrintModal.tsx` (impresión individual) · `polizas/DiarioPrintModal.tsx` + `JournalView.tsx` (diario: día/rango, 3 formatos `contasis_diario_formato` + toggle "Incluir cheques" `contasis_diario_cheques`) · `lib/accounting.ts` (`consolidarPolizasDiaria`) |
| Cambiar el anexo de imagen del cheque (compresión, dedupe, huérfanos, miniatura) | `services/attachmentService.ts` (OWNER del binario: escalera/dedupe/huérfanos/backends) · `polizas/PolizaForm.tsx` (picker + `onAnexoPendiente`) · `polizas/PolizaView.tsx` (procesa al guardar, banner CH-14, purga día 5) · `polizas/PolizaCard.tsx` (miniatura/lightbox/placeholder) · `App.tsx` (cascada al eliminar) · `electron/main.js`+`preload.js` (IPC `attachments/`) |
| Gestionar clientes (switch/alta/renombre/RFC/baja) | `src/components/EmpresasModal.tsx` (UI) · `src/hooks/useEmpresas.ts` (CRUD + activaId) · botón del header en `layout/AppHeader.tsx` |
| Cambiar/añadir temas de UI | `src/temas.css` (remapeo por tema; alfa blanco con selectores escapados) · `src/lib/temas.ts` (catálogo/persistencia clave contasis_tema) · `src/hooks/useTemaApp.ts` (data-theme + meta theme-color) · `layout/TemaMenu.tsx` (header) + `MobileMenu.tsx` (sección Tema) · `index.html` (boot anti-salto en web) · OJO: la hoja imprimible usa `neutral-*` a propósito (sin remapeo) |
| Cambiar cómo se cargan/cambian los clientes | `src/hooks/useAppData.ts` (boot + recarga C-4) |
| Modificar migraciones legacy | `useAppData.ts` (migración one-shot a cliente por defecto C-2, que respeta los flags heredados) · `src/lib/migrateJournalsToPolizas.ts` · `src/lib/migrateCatalogToGlobal.ts` (D-12) · `inventoriesToGeneral` en `hooks/useInventories.ts` (D-13) |
| Ajustar el reporte del Libro Diario (solo lectura y sus exports) | `src/components/JournalView.tsx` (fecha/folio/tipo/cuenta/concepto/debe/haber) |
| Cambiar navegación de pestañas / tab inicial | `src/lib/navigation.ts` (BASIC_NAV_TABS, FISCAL_NAV_TABS, DEFAULT_TAB) |
| Cambiar XML/TXT SAT o DIOT | `src/lib/satExport.ts` (el XML de Pólizas consume PÓLIZAS reales desde ContabilidadElectronicaView: folio real = NumUnIdenPol, Fase 6) |
| Cambiar reglas de persistencia | `src/services/storageService.ts` (+ IPC en `electron/main.js`) |
| Cambiar lógica de sync | `src/services/vaultSyncEngine.ts` (motor) · `SyncModal.tsx` / `ConflictoBovedaModal.tsx` (UI) · `src/services/vaultService.ts` (credenciales/opera) |
| Cambiar la fusión de bóveda (K-7 "Fusionar ambos") | `src/lib/unionBovedas.ts` (reglas puras F-1…F-8) · `vaultSyncEngine.ts` (`contenidoConflicto`, `aplicarSnapshotFusionado`) · `components/modals/FusionBovedaModal.tsx` (revisión) |
| Cambiar la asignación de folios pendientes (F-6) | `src/lib/accounting.ts` (`asignarFoliosPendientes`/`esFolioPendiente`) · `src/hooks/usePolizas.ts` (acción dueña) · `components/polizas/AsignarFoliosPendientesModal.tsx` + `PolizaView.tsx` (UI) · `src/lib/satExport.ts` (guard XML) |
| Cambiar el updater in-app de Android | plugin nativo `android/app/src/main/java/…/AppUpdaterPlugin.java` (descarga/instalación) · `src/services/appUpdater.ts` (puente JS) · `src/components/modals/UpdateAvailableModal.tsx` (UX máquina de estados) |
| Cambiar la build/distribución (desktop · APK · PWA) | `.github/workflows/electron-release.yml` (desktop + APK + release) · manifest/PWA en `vite.config.ts` (`VitePWA`) |
| Agregar una vista/nueva pantalla | Nuevo componente + switch en `App.tsx` |
| Cambiar ventana Electron / autoupdater | `electron/main.js` |
| Agregar/modificar lógica sujeta a pruebas | Colocar/actualizar el `.test.ts(x)` COLOCADO junto al módulo (regla y niveles en §9 "Red de pruebas"); `npm run lint && npm run test` en verde antes de commitear |

### Quirks conocidos (anotados, no son bugs por decidir; §4.5 del plan de pólizas retirado)

1. **Encabezado `CONCEPTO` del Excel de importación nunca funcionó:** el parser (`importEntriesFromExcel.ts`) valida los encabezados ANTES de normalizarlos y solo reconoce `GLOSA`; así se congeló por decisión del plan (no rompe nada: la plantilla siempre usó `GLOSA`).
2. **Error de importación Excel siempre genérico:** el catch de `PolizaView` muestra "Formato no soportado" ante CUALQUIER fallo (JSON corrupto, plantilla incompleta, etc.) — comportamiento heredado que se conservó.
3. **`NumOrden` fijo en el XML de Pólizas:** lleva el valor de referencia `AFO1234567/26` (entrega estándar AF, Acto de Fiscalización). Personalizarlo sería un cambio futuro del valor, no del pipeline.
4. **Inventario final sin auto-guardado:** `contasis_final_inventories_<empresaId>` solo persiste al capturar el inventario o aplicar sync (diseño fiel al original, no descuido).
5. **Metadatos de clientes corruptos → cliente en RAM:** si `contasis_empresas` se corrompe con el flag ya presente, la app arranca con un cliente "Mi Empresa" NUEVO en RAM y el boot NO escribe claves de dominio (el storage real queda intacto); las claves por cliente huérfanas no son visibles hasta un restauro de respaldo (fallback defensivo, aceptado).
6. **Baja de cliente no borra claves de dominio:** `eliminarEmpresa` solo saca el cliente de `contasis_empresas`; sus claves `contasis_<dominio>_<id>` quedan huérfanas en el almacenamiento (archivo permanente, conservadurismo C-2/C-8).
