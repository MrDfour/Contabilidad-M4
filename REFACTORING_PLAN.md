# Plan de Modularización y Fortalecimiento — Contabilidad M4 Pro

> **ESTADO ACTUAL del plan (actualizar este bloque al cerrar cada fase):**
> - **Fase -1** — completa. Entorno instalado, lint limpio, smoke test base validado, rama `refactor/modularizacion`.
> - **Fase 0** — completa y validada por usuario. `lib/format.ts` + modales extraídos. `App.tsx`: 1,190 → 1,034.
> - **Fase 1** — completa (cálculos en `lib/accounting.ts` + tipo `TAccountsData`).
> - **Fase 2** — refactor implementado (hooks `useJournals`, `useCatalog`, `useInventories`, `useBackup`, `useAppData`; `App.tsx`: 990 → 738). Smoke test del usuario: todo correcto excepto sync, cuya falla proviene de credenciales Upstash caducadas (se inyectan por GitHub Secrets; no requiere cambio de código). **✓ Commits y push realizados por el usuario.**
> - **Fase 3** — completa y validada por usuario (layout → `components/layout/`: MobileMenu, Sidebar, AppHeader, AppFooter; `App.tsx`: 738 → 414; navegación tipada en `lib/navigation.ts`).
> - **Fase 4** — refactor implementado (JournalView 1,157 → 241; `components/journal/` con EntryForm/EntryList/EntryCard/AccountPicker/JournalTabs + `lib/importEntriesFromExcel.ts`). Sin smoke test aún.
> - **Criterio específico de salida de Fase 4**: import Excel con cuentas válidas e inválidas (mensaje de rechazo), asiento cuadrado/descuadrado (botón deshabilitado + diferencia en rojo), edición y reordenar, pestañas de diario con renombrado inline, lectura de CFDI XML en modo fiscal.
> - **Sigue Fase 5** (red de pruebas: unit tests de `lib/`; closing del plan y archivo del documento transitorio).
> - Nota de diseño: `useAppData` no es dueño de claves; solo hidrata y notifica `onLoaded`. El estado `hasLoaded` vive en `App`.
> - Pendientes fuera del plan: sincronización => migración futura a Cloudflare KV Workers (decisión del autor, no iniciada).

> **Propósito:** documento de transición. Describe el plan para desmontar los archivos monolíticos
> (`App.tsx`, `JournalView.tsx`, `utils.ts`), añadir una red de pruebas y establecer la disciplina
> de commits por fase. **Cuando todas las fases estén completas, este documento puede eliminarse**
> (o marcarse como archivado) dejando como única referencia `ARCHITECTURE.md`.
>
> **Regla de oro:** cada fase = 1 rama de trabajo, N commits atómicos, y **actualización de
> `ARCHITECTURE.md` en el mismo commit** que introduce el cambio de estructura. Un `ARCHITECTURE.md`
> desactualizado rompe la economía de trabajo con modelos de IA de baja cuota.

Contexto de diagnóstico: ver sección "Diagnóstico" al final. Riesgos identificados (R1–R6) se referencian por ID.

---

## 0. Pre-requisitos (Fase -1: Entorno)

Antes de tocar código:

- [x] `npm install` — completado. 665 paquetes, lint dejaba de fallar solo por módulos ausentes. *Nota: `npm audit` reporta 41 vulnerabilidades (3 críticas, en su mayoría en `xlsx@0.18.5` y la cadena de electron-builder); NO ejecutar `npm audit fix --force` — rompería dependencias. Revisar en fase posterior si se actualiza `xlsx`.*
- [x] Verificar línea base: `npm run lint` sin errores ✓ y `npm run dev` sirviendo en `localhost:3000` (HTTP 200) ✓.
- [ ] Registrar línea base funcional: ejecutar la app y anotar en este archivo (o en un issue) un "smoke test manual" de ~10 pasos (crear diario → capturar asiento cuadrado → verificar Cuentas T → Balance cuadrado → P&L con inventario final → export PDF/Excel → import Excel → activar Modo Fiscal → depreciar activo → sync). Este guion será el criterio de aceptación de cada fase hasta que existan tests automatizados. *(PENDIENTE — requiere prueba manual del usuario en el navegador; es el único ítem bloqueante para iniciar Fase 0.)*
- [x] Crear rama `refactor/modularizacion` desde `main` — completado.

**Criterio de salida:** lint limpio + smoke test manual pasando en la rama base. *(lint ✓ · smoke test pendiente)*

---

## Fase 0 — Deduplicación y extracción de modales (riesgo: BAJO)

**Objetivo:** eliminar el riesgo R6 (formateo de montos triplicado) y sacar del `App.tsx` todo lo que es UI aislada.

- [x] Crear `src/lib/format.ts` con `normalizeAmount`, `parseFormattedAmount`, `parseImportedAmount`, `formatAmountForInput`, `formatAmountInput`, `formatCurrency`, `formatSatGroupCode`, `normalizeString` (tomadas de `JournalView.tsx`, `App.tsx` y `utils.ts` — una sola implementación). *(Realidad del código: había 5 copias de `normalizeAmount` — también en `FixedAssetsView`, `ProfitLossView` y `TAccountsView` — todas verificadas idénticas antes de consolidar.)*
- [x] Actualizar los archivos consumidores para importar de `lib/format.ts` (`App.tsx`, `JournalView`, `FixedAssetsView`, `ProfitLossView`, `TAccountsView`, `BalanceSheetView`, `CatalogView`).
- [x] Extraer los 5 modales globales de `App.tsx` a `src/components/modals/`:
  - `GlobalInfoModal.tsx` (modal de éxito/error + variante de sugerencia de respaldo; exporta `ModalInfo` y `BACKUP_SUGGESTION_TITLE`)
  - `ConfirmDeleteModal.tsx` (exporta `ConfirmDeleteData`)
  - `UpdateAvailableModal.tsx` (`Browser.open` de Capacitor vive aquí; recibe `onNotify` para errores)
  - `AboutModal.tsx`
  - `DownloadProgressBar.tsx`
- [x] `App.tsx` los consume solo con props. La lógica que los dispara sigue en `App.tsx` (vigilante semanal, delete flows, dismissal de updates).

**Commits esperados:** `refactor: consolidar formateo de montos en lib/format`, `refactor: extraer modales globales a components/modals`, `docs: actualizar ARCHITECTURE.md fase 0`.

**Criterio de salida:** ~~`App.tsx` ~150 líneas menos~~ ✓ (1,190 → 1,034); smoke test pasa; grep de `normalizeAmount` devuelve 1 definición ✓. *(Pendiente al cierre: smoke test del usuario + commits + push.)*

---

## Fase 1 — Cálculos contables como funciones puras (riesgo: BAJO)

**Objetivo:** separar el "cerebro" del "cuerpo". Prepara el terreno para los tests (Fase 5).

- [x] Crear `src/lib/accounting.ts` con funciones puras (sin React, sin storage):
  - `buildTAccountsData(entries: JournalEntry[]): TAccountsData`
  - `computeAccountBalances(tAccountsData, accounts): Record<string, number>`
  - Movidas también `calculateMonthlyDepreciation` y `calculateFiscalDeduction` (antes en `utils.ts`; `FixedAssetsView` importa de `lib/accounting`).
- [x] `App.tsx` consume vía `useMemo` llamando a estas funciones (misma lógica, misma ubicación de invocación).
- [x] Tipado el tipo `TAccountsData` (+ `TAccountSide`, `TAccountColumns`) en `types.ts`. Se eliminaron **6 copias del tipo anónimo inline** (`App`, `TAccountsView` ×2, `ContabilidadElectronicaView`, `satExport`, `utils`).

**Commits:** `refactor: extraer cálculos contables a lib/accounting`, `docs: actualizar ARCHITECTURE.md fase 1`.

**Criterio de salida:** Balance y Cuentas T idénticos al smoke test; `lib/accounting.ts` importable sin React (esto habilita testearlo en Node puro en Fase 5). *(Pendiente al cierre: smoke test del usuario + commit + push.)*

---

## Fase 2 — Hooks de lógica (riesgo: MEDIO — aquí viven R1 y R2)

**Objetivo:** desmontar el "estado dios" de `App.tsx` en hooks con responsabilidad única, **sin** introducir Context ni reducers (ver R3).

- [x] `src/hooks/useAppData.ts` — carga inicial (`migrateFromLocalStorage` + las 4 claves) y exposición del flag "listo para guardar" (via `onLoaded(true)` → `setHasLoaded` en App; protege R2). *Nota de diseño: se llama al final de la cadena de hooks porque sus appliers vienen de los hooks creados primero; usa refs internos para ver la versión estable.*
- [x] `src/hooks/useJournals.ts` — `addEntry`, `updateEntry`, `moveEntry`, `deleteEntry`, `createJournal`, `renameJournal`, `importEntries`, `deleteJournal` (rama journal de handleConfirmDelete), `setSubAccounts` y `hydrate`. `handleConfirmDelete` (modal) quedó en App y delega a estos métodos.
- [x] `src/hooks/useCatalog.ts` — catálogo híbrido: `finalGlobals`, `combinedAccounts`, `handleCombinedAccountsUpdate` (firma intacta para satisfacer `React.Dispatch<React.SetStateAction<Account[]>>` de CatalogView), persistencia con debounce gated por `canSave`.
- [x] `src/hooks/useInventories.ts` — `finalInventories` + `finalInventory` sincronizado + `handleSetFinalInventory`. **Nota fiel al original: esta clave no tiene auto-guardado** (solo guarda explícito).
- [x] `src/hooks/useBackup.ts` — vigilante semanal + `handleExportBackup` + `handleImportBackup` (parseo/validación en el hook; los writes multi-dominio van al orquestador `restore` de App).
- [x] **Regla anti-R1 (atomicidad):** implementada con "orquestadores en App": `applyRemoteSyncState` compone `journalsState.hydrate` + `inventoriesState.hydrateFromRemote` en UNA función; la restauración de respaldo compone hydrate + writes crudos de cada hook. Cada hook documenta su clave en JSDoc:

  | Hook | Clave de storage de la que es dueño |
  |---|---|
  | `useJournals` | `contasis_journals` |
  | `useInventories` | `contasis_final_inventories` |
  | `useCatalog` | `contasis_accounts` |
  | (activos fijos, aún en `App`) | `contasis_fixed_assets` |
  | `useBackup` | `contasis_last_backup` (solo lectura/escritura simple) |

  | Hook | Clave de storage de la que es dueño |
  |---|---|
  | `useJournals` | `contasis_journals` |
  | `useInventories` | `contasis_final_inventories` |
  | `useCatalog` | `contasis_accounts` |
  | (activos fijos, aún en `App`) | `contasis_fixed_assets` |
  | `useBackup` | `contasis_last_backup` (solo lectura/escritura simple) |

**Commits:** uno por hook (`refactor: extraer useJournals de App`, etc.), más `docs: actualizar ARCHITECTURE.md fase 2`.

**Criterio de salida:** smoke test completo; específicamente probar sync móvil→escritorio y restauración de respaldo (escenarios R1). `App.tsx` debe quedar < 400 líneas. *(Estado: refactor completo e implementado — `App.tsx` quedó en 738 líneas; los operadores multi-dominio siguen en App sin migrar aún el layout, por lo que el "< 400" se alcanzará en Fase 3; el resto ✓. Pendiente: smoke test del usuario + commits + push.)*

---

## Fase 3 — Shell de layout (riesgo: BAJO-MEDIO, R4)

**Objetivo:** que `App.tsx` quede como orquestador puro (routing de pestañas + composición).

- [x] Extraer a `src/components/layout/`:
  - `Sidebar.tsx` (desktop) — **preservar** `layoutId="sidebar-active-indicator"` y que el componente se monte siempre (no condicional entre renders) para no romper la animación compartida.
  - `MobileMenu.tsx` + `MobileNavItem`
  - `AppHeader.tsx` — preservar `layoutId="app-mode-indicator"`.
  - `AppFooter.tsx` (botones de respaldo/restaurar/feedback).
- [x] Los modos `appMode`/`activeTab` siguen viniendo de `App.tsx` por props (nada de Context todavía).

**Notas de implementación (Fase 3):**
- `App.tsx`: 738 → **414 líneas**. Los ítems de navegación se derivan de `navigationTabs: NavigationTab[]` en App y pasan por props (el menú móvil antes tenía los ítems hardcodeados — ahora renderiza el mismo array, mismos labels/orden).
- `lib/navigation.ts` guarda `AppMode`/`AppTab`/`NavigationTab`/`FISCAL_NAV_TABS` (movidos de App); `lib/appMeta.ts` guarda `APP_VERSION`.
- `Sidebar` se monta **siempre** y se oculta con `hidden` en móvil (antes se desmontaba con `{!isMobile && ...}`) — mismo look, menos riesgo de animación.
- Limpieza incidental: se eliminaron de App 10 imports muertos de lucide (Plus, Trash2, ChevronRight, TrendingDown, Edit2, X, FileUp, Search, FileScan, ChevronDown/Up) que ya no tenían uso previo a la Fase 3.

**Commits:** `refactor: extraer layout a components/layout`, `docs: actualizar ARCHITECTURE.md fase 3`.

**Criterio de salida:** smoke test + inspección visual de las animaciones de indicador (R4 no se detecta con tsc).

---

## Fase 4 — Modularizar `JournalView` (riesgo: MEDIO)

**Objetivo:** desmontar el segundo monolito (1,194 líneas) que contiene subcomponentes completos.

- [x] Crear `src/components/journal/`:
  - `EntryForm.tsx` (formulario de asiento con CFDI)
  - `AccountPicker.tsx` (búsqueda de cuentas)
  - `EntryList.tsx` / `EntryCard.tsx` (lista con agrupación por período, expansión, reordenar)
  - `JournalTabs.tsx` (pestañas de diarios múltiples)
  - `importEntriesFromExcel.ts` en `lib/` (la lógica de import que hoy valida contra el catálogo)
- [x] `JournalView.tsx` queda como compositor de estos subcomponentes (< 300 líneas). → **241 líneas**.
- [x] Verificar que el parser de Excel usa `lib/format.ts` (no duplicados residuales). → `parseJournalImport` usa `normalizeString` + `parseImportedAmount` de `lib/format.ts`.

**Notas de implementación (Fase 4):**
- `JournalView.tsx`: 1,157 → **241 líneas**. Dashboard de pieza: EntryForm 403, EntryList 165, EntryCard 140, AccountPicker 111, JournalTabs 111, parser 112.
- Cambios de dueño de estado (equivalentes al original): `expandedEntries`/`collapsedPeriods` se movieron a `EntryList` (víve dentro de la misma vista, mismo ciclo de vida); `editingJournalId`/`editingName` a `JournalTabs`.
- `SearchableAccountSelect` ahora vive en `journal/AccountPicker.tsx`; se actualizó el import de `FixedAssetsView`.
- Detalle preservado fielmente (quirúrgico): el `catch` del import muestra SIEMPRE el mensaje genérico "Formato no soportado" aunque el parser lance mensajes más específicos ("archivo vacío", "formato inválido") — comportamiento idéntico al original; anotado como mejora futura (mostrar el mensaje del Error) NO aplicada en refactor.
- Detalle preexistente preservado: el estado vacío de la tabla usa `colSpan={7}` con 8 columnas de encabezado (mismatch original).
- React 19/tsc: los props tipados que reciben `key` (EntryCard, MobileNavItem) necesitan `key?: React.Key` declarado.

**Commits:** uno por subcomponente, más `docs: actualizar ARCHITECTURE.md fase 4`.

**Criterio de salida:** import Excel con cuentas válidas e inválidas (mensaje de rechazo); asiento cuadrado/descuadrado; edición y reordenado.

---

## Fase 5 — Red de pruebas (riesgo: BAJO, alto valor)

**Objetivo:** convertir el smoke test manual en una red automatizada que valida la viabilidad final del código tras la modularización. Las fases 1–2 dejaron funciones puras y hooks aislados precisamente para esto.

- [ ] **Stack:** Vitest (nativo del stack Vite) + `@testing-library/react` y `@testing-library/react-hooks`/`renderHook` para hooks + `jsdom`. Instalar solo `devDependencies`.
- [ ] **Niveles de prueba, en orden de implementación:**
  1. **Unitarias puras** (`lib/accounting.test.ts`, `lib/format.test.ts`): partida doble, saldos por naturaleza deudora/acreedora, redondeo de montos, deducción INPC truncada a 4 decimales. *Sin DOM, corren en cualquier modelo/CI.*
  2. **Funcional** (`lib/export.test.ts`): generar un Excel/PDF desde datos fixture y verificar cabeceras/hojas (ExcelJS permite inspeccionar el workbook resultante; jsPDF se valida vía autotable finalY).
  3. **Hooks** (`hooks/useCatalog.test.ts`, `useJournals.test.ts`): catálogo híbrido — recuperar cuentas globales borradas, dedup por `code`, escritura solo de subcuentas locales; reordenar extremos en `moveEntry`.
  4. **Integración/Render** (`components/__tests__/`): `EntryForm` cuadrado/descuadrado habilita/deshabilita guardar; `CatalogView` rechaza cuenta duplicada; render de `App` completo con storage simulado (mock de `storageService`).
  5. **Persistencia/sync (mock):** `applyRemoteSyncState` no deja estados huérfanos (R1); restauración de respaldo corrupto muestra error y no muta estado.
- [ ] Script `"test": "vitest run"` y `"test:watch": "vitest"` en `package.json`.
- [ ] **CI:** workflow `.github/workflows/test.yml` (lint + test en cada push a `main` y PR) — el repo ya tiene 2 workflows como plantilla de estilo.
- [ ] Actualizar `README.md` (sección scripts) y `ARCHITECTURE.md` (sección "convenciones") para reflejar que ya existe red de pruebas.

**Commits:** uno por nivel de prueba (`test: unitarias accounting/format`, `test: hooks catalog`, `ci: workflow de tests`, `docs: ...`).

**Criterio de salida (cierre del plan):** `npm run lint && npm run test` en verde; el smoke test manual queda como documento de e2e opcional. A partir de aquí, `REFACTORING_PLAN.md` se archiva.

---

## 6. Disciplina de commits, push y rollback (GitHub Desktop)

### Por qué un commit por extracción

Cada commit es un punto de retorno independiente y un "delta legible": si usas modelos con cuota limitada, poder alimentar a un modelo nuevo solo con el diff de un commit (`git show <hash>`) en lugar de todo el repositorio, multiplica tu presupuesto de tokens. Además, si una fase rompe algo, `git revert` del commit específico es quirúrgico.

### Ritual por unidad de trabajo

1. Trabajar solo en la rama `refactor/modularizacion` (nunca directo en `main`).
2. Al terminar una extracción coherente: `git add` solo los archivos de esa extracción.
3. Mensaje con convención: `refactor:`, `test:`, `docs:`, `chore:` + descripción breve en español. Ejemplos: `refactor: extraer useJournals de App`, `docs: actualizar ARCHITECTURE.md fase 2`.
4. `docs:` de `ARCHITECTURE.md` **en el mismo commit o inmediatamente después** del refactor correspondiente. Un push no debe existir con el mapa desactualizado.
5. Push a `origin` al final de **cada sesión de trabajo** (no cada commit necesariamente, pero sí antes de cerrar el día) — GitHub se convierte en tu segunda salvaguarda.

### Red de salvaguardas (3 niveles)

| Nivel | Herramienta | Qué recupera | Cómo |
|---|---|---|---|
| 1 | `git checkout` / GitHub Desktop "Discard changes" | Cambios no commiteados | Descartar working copy antes del commit |
| 2 | GitHub Desktop → **Revert commit** | Un commit ya hecho (local o pusheado) | Clic derecho sobre el commit → "Revert commit". Crea un commit inverso — **no** reescribe historia, seguro si ya hiciste push |
| 3 | GitHub Desktop → Branch → "View on GitHub" / `git reset --hard <hash>` | Varios commits locales **aún sin push** | Solo para historia no compartida. **Nunca** force-push a `main` (podría romper los workflows de release existentes) |

> **Regla con GitHub Desktop:** una vez que un commit está pusheado, la única operación segura es **Revert** (nivel 2). Reservar `reset --hard` para trabajo local. Esto evita cualquiera de los clásicos desastres de reescritura de historia.

### Puntos de control recomendados

- **Al inicio de cada fase:** push de la rama con la fase anterior completa + smoke test en verde.
- **Al completar la fase:** merge a `main` (GitHub Desktop: "Create pull request" o merge directo) y tag opcional `refactor-fase-N`. Así cada fase queda publicada como punto estable e inmutable.

---

## 7. Diagnóstico (base de este plan)

| Archivo | Líneas | Problema principal |
|---|---|---|
| `src/App.tsx` | ~1,190 | 4 responsabilidades: lógica de negocio, persistencia, cálculos derivados y shell UI con 5 modales inline |
| `src/components/JournalView.tsx` | 1,194 | Contiene subcomponentes completos (formulario de asiento, account picker, import Excel) y duplica helpers de formateo |
| `src/lib/utils.ts` | 708 | Cajón de sastre: clases/formato + export Excel + export PDF + lectura Excel + cálculos fiscales, sin relación entre sí |
| `src/components/SyncModal.tsx` | 576 | Aceptable (motor ya separado en `syncService.ts`); no prioritario |
| `src/services/storageService.ts` | 45 | Bien; abstracción multiplataforma correcta |

**Riesgos referenciados (del análisis original):**
- **R1** Atomicidad de sync/respaldo: escrituras multi-estado pueden competir con efectos de persistencia.
- **R2** Sin red de pruebas: regressions de comportamiento (orden de asientos, catálogo híbrido, debounce) no son detectables por `tsc`.
- **R3** Props drilling vs Context: separar hooks sin Context puede empeorar el pasamanos; con Context, re-renders ampliados.
- **R4** `layoutId` de Framer Motion: la re-parentación de componentes puede romper animaciones compartidas silenciosamente.
- **R5** Costo de contexto IA: más archivos = más lecturas; mitigado por `ARCHITECTURE.md` actualizado.
- **R6** Duplicación de formateo de montos en 3 archivos (riesgo de redondeos divergentes).
