# Mapa del Proyecto — Contabilidad M4 Pro

> **Propósito:** Este documento es el mapa único de referencia para trabajar en el código.
> Su objetivo es dar contexto completo a un asistente de IA (o desarrollador nuevo) en una sola lectura,
> sin necesidad de explorar todo el repositorio.
> **Regla de mantenimiento:** si cambias la estructura, los datos almacenados o agregas archivos, actualiza este documento en el mismo commit.

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
    ├── App.tsx                 # ⭐ ORQUESTADOR (1,200 líneas): estado global, carga/guardado en
    │                           #   storage, navegación de vistas, modo fiscal, lógica de sync host
    │
    ├── components/             # Vistas puras (reciben datos por props, no tocan storage)
    │   ├── JournalView.tsx           # Libro Diario: CRUD de asientos, partida doble en vivo,
    │   │                             #   importar/exportar Excel, pestañas de diarios múltiples
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
    │   └── FeedbackModal.tsx         # Envío de feedback del usuario (issues)
    │
    ├── lib/
    │   ├── utils.ts             # ⭐ Utilidades compartidas (700 líneas): exportToExcel, exportTAccountsStyleToExcel,
    │   │                        #   exportToPDF (captura HTML→PDF), exportTableToPDF (autotable), readExcel,
    │   │                        #   formatDate, formatCurrency, cn (clases), calculateMonthlyDepreciation,
    │   │                        #   calculateFiscalDeduction (INPC), normalizeString
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
        └── useUpdateProgress.ts     # Progreso de descarga de la actualización (Electron)
```

Regla general: **estado y persistencia viven en `App.tsx`/`services`; cálculo contable y exportación viven en `lib/`; las vistas son presentacionales** (con alguna export action propia).

---

## 3. Flujo de datos principal

```
Usuario → JournalView (asientos) → App.tsx (estado journals)
       → TAccountsView / BalanceSheetView / ProfitLossView (cálculo derivado de journals + accounts)
       → FixedAssetsView → genera asiento automático → journals
```

- `App.tsx` mantiene: `journals[]`, `accounts[]`, `fixedAssets[]`, `finalInventories{journalId: monto}`, `appMode` (normal | fiscal), vista activa y journal activo.
- Los saldos de Cuentas T, Balance y Estado de Resultados **no se almacenan**: se recalculan en cada render a partir de `journals`.

---

## 4. Modelo de datos (`src/types.ts`)

| Tipo | Significado |
|---|---|
| `Account` | Cuenta contable (`id, code, name, type: 'asset'\|'liability'\|'equity'\|'revenue'\|'expense', subtype?, satGroupCode?, isReadOnly?`) |
| `Movement` | Línea de asiento (`accountId` → referencia a Account, `type: 'debit'\|'credit'`, `amount`, `uuidCFDI?`, `rfcTercero?`) |
| `JournalEntry` | Asiento (id, fecha, descripción, `movements[]`, `policyType?: 'diario'\|'ingreso'\|'egreso'`) |
| `Journal` | Libro diario (id, nombre, `entries[]`) |
| `FixedAsset` | Activo fijo (nombre, fecha, MOI, cuentas asociadas asset/depr/gasto, `fiscalRate`, `isDisposed`) |
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
- **WebRTC con PeerJS**: escritorio actúa de host con un ID de sesión; móvil escanea QR (MLKit) o entra un PIN de 6 dígitos (el PIN deriva el sessionId con aritmética mod CSRNG).
- **Respaldo Redis**: si WebRTC falla, serializa el estado a Upstash Redis REST (`VITE_UPSTASH_REDIS_REST_URL` en `.env` → variables `VITE_*`).
- Conflictos: el móvil ofrece "mantener local" vs "sobrescribir con datos remotos" (payload completo, no merge por asiento).
- Medidas de seguridad: límite de intentos de PIN, bloqueo temporal y regeneración de sesión.

---

## 7. Configuración de entorno (`.env.example`)

```env
GEMINI_API_KEY=     # funciones de IA (Google @google/genai existe en package.json)
APP_URL=            # referencia a si mismo en despliegue
VITE_UPSTASH_REDIS_REST_URL=   # respaldo de sync (usada por syncService)
VITE_UPSTASH_REDIS_REST_TOKEN=
```

> Ojo: esta app se originó como AI Studio applet; `GEMINI_API_KEY`/`APP_URL` son herencia de esa plantilla. Las variables usadas por Vite **deben** llevar el prefijo `VITE_`.

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
| Cambiar cómo se calcula Balance / P&L / Cuentas T | `src/components/BalanceSheetView.tsx` / `ProfitLossView.tsx` / `TAccountsView.tsx` |
| Cambiar formato de reportes Excel/PDF | `src/lib/utils.ts` |
| Cambiar XML/TXT SAT o DIOT | `src/lib/satExport.ts` |
| Cambiar reglas de persistencia | `src/services/storageService.ts` (+ IPC en `electron/main.js`) |
| Cambiar lógica de sync | `src/services/syncService.ts` (motor) y `SyncModal.tsx` (UI) |
| Agregar una vista/nueva pantalla | Nuevo componente + switch en `App.tsx` |
| Cambiar ventana Electron / autoupdater | `electron/main.js` |
