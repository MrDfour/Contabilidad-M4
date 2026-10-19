# Guía Central — Módulo de Pólizas Contables y Refactorización del Libro Diario

> **Documento vivo de ejecución.** Este archivo es la referencia única para implementar (y reanudar en cualquier agente) el módulo de Pólizas Contables.
> El mapa vigente del proyecto está en `ARCHITECTURE.md` — leerlo completo ANTES de escribir código.
> Este plan complementa (no reemplaza) al mapa; `REFACTORING_PLAN.md` está cerrado y es solo histórico.

---

## 1. Objetivo y alcance

Establecer las **Pólizas Contables (Ingreso, Egreso, Diario)** como módulo principal de captura contable y convertir el Libro Diario en un **reporte consolidado de solo lectura**.

Alcance cubierto en este plan:

| # | Área | Fase |
|---|------|------|
| 1 | Tipos `TipoPoliza`, `PartidaPoliza`, `Poliza` | Fase 1 |
| 2 | Hook `usePolizas`, migración automática, integración `useAppData` | Fase 2 |
| 3 | Lógica pura: `validatePolizaBalance`, `flattenPolizasToJournalEntries`, folios | Fase 1 |
| 4 | `components/polizas/` (vista, filtro, formulario, lista, impresión) | Fase 3 |
| 5 | Libro Diario de solo lectura + re-cableado de rutas de captura | Fase 4 |
| 6 | Navegación: `polizas` primaria y predeterminada | Fase 3 |
| 7 | SAT: exportación de pólizas (Anexo 24) por folios reales | Fase 6 |
| 8 | Compatibilidad de respaldos/sync y desmantelamiento del modelo `Journal` | Fase 5 |
| 9 | Documentación y cierre | Fase 7 |

**Resultado final:** el asiento contable del usuario nace SIEMPRE como `Poliza` (captura manual o programas automáticas de cierre/depreciación), los reportes (Cuentas T, Balance, Resultados, DIOT, XML SAT) se alimentan de la proyección aplanada de pólizas, y el Libro Diario queda como vista de lectura.

---

## 2. Protocolo de reanudación (para cualquier agente nuevo)

Ejecutar **en orden estricto**:

1. **Contexto:** leer `README.md`, `ARCHITECTURE.md` completo y este documento completo. No improvisar decisiones que ya están tomadas en §5 (Decisiones de diseño).
2. **Estado:** revisar §11 (Registro de ejecución) y localizar la primera fase con estado ≠ `Completada`. Los checkboxes de cada fase también reflejan avance; ante divergencia manda el Registro de ejecución.
3. **Verificar el piso antes de tocar nada:**
   ```pwsh
   npm run lint; npm run test; npm run build
   ```
   Si algo falla ANTES de empezar: detener, no "avanzar con el test rojo". Arreglar o reportar al usuario. **Baseline de referencia: 85 tests en verde (post Fase 5 de modularización).**
4. **Implementar solo la fase actual** (una fase por sesión de trabajo si es posible). No mezclar fases en un solo cambio.
5. **Pruebas en el mismo cambio:** cualquier modificación de comportamiento lleva sus tests actualizados/agregados en el MISMO trabajo (regla del proyecto, ver §3).
6. **Actualizar `ARCHITECTURE.md`** en el mismo cambio si la fase altera árbol de archivos, claves de storage, flujo de datos o el modelo de tipos (§4 del mapa).
7. **Gate final de la fase:** `npm run lint && npm run test && npm run build` verde + escaneo de caracteres CJK (§3.5) + prueba manual sugerida al usuario.
8. **NO commitear.** El usuario revisa, prueba y commitea con GitHub Desktop. Entregarle: resumen de la fase, mensaje(s) de commit sugerido(s) (prefijo convencional), y qué probar a mano.
9. **Actualizar §11** (Registro de ejecución) y las casillas de la fase al confirmar que quedó todo verde.

**Regla de oro ante lo inesperado:** si el código real contradice este plan (firma distinta, quirk no documentado), NO se improvisa: se anota en §12 (Desviaciones y hallazgos) con la evidencia y se ajusta el plan ANTES de seguir.

---

## 3. Reglas de proyecto inmutables

### 3.1 Commits
- Convencionales: `feat:`, `refactor:`, `test:`, `docs:`, `chore:`, `fix:` en español.
- Nunca commitear directo a `main`; trabajar en rama (sugerencia: `feat/modulo-polizas`).
- El asistente nunca ejecuta `git commit`; el usuario lo hace vía GitHub Desktop.

### 3.2 Dependencias
- **PROHIBIDO `npm audit fix --force`** (rompe dependencias). Hay vulnerabilidades conocidas asumidas.
- No agregar dependencias nuevas sin necesidad: los tests ya usan Vitest + Testing Library; el XML se construye a mano (patrón existente en `satExport.ts`); el Excel con ExcelJS.

### 3.3 Idioma y catálogo SAT
- Toda la documentación y comentarios de código van en **español**.
- Los nombres/códigos de cuentas del catálogo y códigos de agrupación SAT (`satGroupCode`) **jamás se traducen ni se alteran**.

### 3.4 Fidelidad de comportamiento
- Quirks preexistentes se **preservan y anotan**, no se "arreglan" de paso (regla del refactor anterior). Excepciones requieren decisión explícita del usuario anotada en §12.
- Regla anti-R1 (propiedad de claves): **cada hook dueño de UNA clave la escribe solo él**. Escrituras multi-dominio viajan por un único orquestador (`App.tsx` o `useAppData`).

### 3.5 Escaneo anti-CJK (obligatorio tras cada edición de archivos)
Los agentes anteriores han generado ocasionalmente caracteres CJK espurios. Tras TODA edición ejecutar:
```pwsh
Select-String -Path .\*.md,.\src\*.ts,.\src\*.tsx,.\src\**\*.ts,.\src\**\*.tsx -Pattern '[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]'
```
(ajustar `-Path` a los archivos tocados). Salida vacía = limpio. Si aparece algo, corregirlo.

### 3.6 Red de pruebas
- Tests colocados junto al módulo (`.test.ts(x)`), descubiertos por `src/**/*.test.{ts,tsx}`.
- Cambios en `lib/` y hooks de dominio deben mantener `npm run lint && npm run test` verde, con tests actualizados en el mismo commit.

---

## 4. Estado actual del código (inventario relevante)

### 4.1 Claves de storage vigentes (dueño, contenido)

| Clave | Dueño | Contenido |
|-------|-------|-----------|
| `contasis_journals` | `useJournals` | `Journal[]` — diarios con `entries: JournalEntry[]` y `subAccounts?: Account[]` (catálogo local del diario) |
| `contasis_accounts` | `useCatalog` | `Account[]` — catálogo global (INITIAL_ACCOUNTS con `isReadOnly: true` + las creadas por el usuario sin marcar) |
| `contasis_final_inventories` | `useInventories` | `Record<journalId, number>` — inventario final POR diario |
| `contasis_fixed_assets` | `App.tsx` (único dominio sin hook) | `FixedAsset[]` |
| `contasis_last_backup` | `useBackup` | ISO timestamp del último respaldo |
| `contasis_app_mode` | `App.tsx` | `'basic' \| 'fiscal'` |

La capa de persistencia real es `src/services/storageService.ts` (`saveToStorage`/`loadFromStorage`): **Electron IPC → Capacitor Filesystem → localStorage**. El plan NO introduce IndexedDB ni redux: todo pasa por `storageService` (ver Desviación DV-3).

### 4.2 Estructuras a migrar (tipos reales, no teóricos)

```ts
export interface Movement {
  accountId: string;
  type: 'debit' | 'credit';
  amount: number;
  uuidCFDI?: string;  // Folio fiscal de 36 caracteres — ALIMENTA CompNal y DIOT
  rfcTercero?: string; // RFC del proveedor o cliente — ALIMENTA DIOT
}

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  movements: Movement[];
  policyType?: 'diario' | 'ingreso' | 'egreso'; // ¡ya existía el concepto de tipo!
}

export interface Journal {
  id: string;
  name: string;
  entries: JournalEntry[];
  subAccounts?: Account[]; // catálogo LOCAL por diario
}
```

### 4.3 Dónde nacen y dónde se leen los asientos (mapa de captura/lectura)

**Rutas de CAPTURA (`onAdd`/`addEntry` — todas deben pasar a `usePolizas` en Fase 4):**
1. `components/journal/EntryForm.tsx` (alta manual en Libro Diario).
2. `components/ProfitLossView.tsx` — crea asientos de ajuste/cierre (recibe `onAdd`).
3. `components/FixedAssetsView.tsx` — genera póliza de depreciación mensual (recibe `onAdd`).
4. `components/JournalView.tsx` — importación Excel → `parseJournalImport` (`lib/importEntriesFromExcel.ts`) → `importEntries`.

**Rutas de LECTURA de `entries` del diario activo (todas se re-alimentan con la proyección aplanada en Fase 4):**
- Derivaciones centrales de `App.tsx`: `buildTAccountsData(entries)` y `computeAccountBalances(...)` → alimentan Cuentas T, Balance y Resultados.
- `JournalView.tsx` (exports Excel/PDF + listado), `EntryList.tsx`, `EntryCard.tsx`.
- `CatalogView.tsx` (recibe `entries` para bloquear el borrado de cuentas en uso).
- `ContabilidadElectronicaView.tsx` (`entries` + `tAccountsData` para Catalogo/Balanza/Pólizas/DIOT XML; `generatePolizasXML` en `lib/satExport.ts` **ya existe** y filtra por periodo `${anio}-${mes}`).

**Acoplados al concepto "diario activo" (la especificación no los menciona — tratados en Fase 5):**
- `useCatalog`: catálogo híbrido global + `subAccounts` del diario activo (`commitSubAccounts` → `useJournals.setSubAccounts`).
- `useInventories`: inventario final indexado POR `activeJournalId`.
- `AppHeader`: props `hasActiveJournal` y `activeJournalName`.
- `App.tsx`: `fallback 'Diario'` para etiqueta móvil y redirección de pestañas fiscales a `'journal'`.
- `useBackup` / `SyncModal` / `syncService`: `BackupSnapshot.journals` y `SyncState.journals`.

### 4.4 Estado de la navegación (hoy)

- El arreglo base de pestañas vive **en `App.tsx`** (líneas ~191-198), NO en `navigation.ts`; ahí solo están `FISCAL_NAV_TABS` y los tipos `AppMode`/`AppTab`/`NavigationTab`.
- `AppTab` inicial: `'journal'` (`useState` en App). Redirección: modo básico → pestaña fiscal → `setActiveTab('journal')`.
- `Sidebar.tsx` y `MobileMenu.tsx` solo renderizan el arreglo que reciben (`navigationTabs` prop) — el cambio de orden es automático al mover Pólizas al primer lugar. Icono sugerido: `BookOpen` / `BookLock` de lucide-react (decisión libre, consistente con el set actual).

### 4.5 Quirks congelados (no "arreglar" sin decisión)

1. **`CONCEPTO` nunca funcionó** en la importación Excel: el encabezado se normaliza DESPUÉS del chequeo (solo reconoce `GLOSA`). Si Fase 4 reutiliza `parseJournalImport`, el quirk se preserva y anota.
2. **Import genérico:** el `catch` de importación siempre dice "Formato no soportado" aunque el parser tenga mensajes específicos (documentado, no adeudado).
3. **NumUnIdenPol hoy = índice + 1** del periodo en `generatePolizasXML` (no es folio real por tipo). Fase 6 lo reemplaza por `poliza.folio` — cambiar esto ES parte del plan, no un quirk.
4. `useJournals.hydrate` persiste SIEMPRE (incluso vacío) — decisión de atomicidad para sync remoto. La sucesora `usePolizas.hydrate` hereda el mismo contrato.
5. `useInventories`: la clave `contasis_final_inventories` NO tiene auto-guardado (solo guardado explícito) — comportamiento reforzado por tests; respetarla.

---

## 5. Decisiones de diseño adoptadas (no re-decidir)

| ID | Decisión | Justificación |
|----|----------|----------|
| D-1 | **Nueva clave `contasis_polizas`** con dueño exclusivo `usePolizas` (regla anti-R1). NO se reutiliza `contasis_journals`. | Modelos de datos distintos; los diarios quedan como archivo histórico legible una sola vez por la migración. |
| D-2 | **Migración automática y determinística**: al primer arranque tras la Fase 2, si `contasis_polizas` no existe, se transforman los diarios existentes → pólizas. Flag `contasis_polizas_migrated` (dueño: `usePolizas`) evita re-migrar. `contasis_journals` se PRESERVA intacto (nunca se borra ni reescribe). | Evita resucitar pólizas borradas por re-migración accidental; errar por prudencia con datos del usuario. |
| D-3 | **Reaprovechar IDs**: `Poliza.id = JournalEntry.id`, `PartidaPoliza.id = \`${entry.id}-p${i}\``. | Trazabilidad, dedup por si la migración re-corre, sin colisiones. |
| D-4 | **Folios: consecutivos independientes por tipo**, asignados en orden de iteración (diarios en orden de storage, asientos en orden de storage), empezando en 1. Helper puro `nextPolizaFolio` = `max(folio del tipo) + 1`. | Criterio del plan; tolerante a huecos; congelado por tests. |
| D-5 | **`PartidaPoliza` GANA campos opcionales `uuidCFDI` y `rfcTercero`** (además del `concept` de la especificación). | Sin esto, la migración PERDERÍA los datos CFDI/RFC que alimentan CompNal XML y el DIOT — violaría el criterio "migración sin pérdida de información". Ver DV-1. |
| D-6 | **Proyección pura de lectura**: `flattenPolizasToJournalEntries` convierte `Poliza[] → JournalEntry[]` SIN ordenar (respeta el orden de entrada). El orden cronológico lo aplica el consumidor (App ordena por `fecha` antes de aplanar). | Mantiene intactas Cuentas T, Balance, Resultados, DIOT y el catálogo (siguen consumiendo `JournalEntry[]`); función trivial de probar. |
| D-7 | **Total almacenado**: `Poliza.totalDebe`/`totalHaber` se recalculan con `normalizeAmount` en cada guardado (nunca se confía en lo que trae el payload). | Los XML SAT y la impresión consumen esos totales; invariantes centralizadas en un solo lugar. |
| D-8 | **Tipo de póliza congelado tras crear**: `PolizaForm` deshabilita el selector al editar. | Cambiar de tipo invalidaría el folio consecutivo por tipo. |
| D-9 | **`createPoliza` valida antes de aceptar**: `partidas.length >= 2` y `isBalanced` (por `validatePolizaBalance`). El guard (bloqueo de UI en `PolizaForm`) duplica la defensa; el hook es la última línea. | Criterio "imposible guardar pólizas desbalanceadas" en DOS capas. |
| D-10 | **Captura programática** (dep. de activos fijos, ajustes de Resultados) crea pólizas `tipo: 'diario'` sin UI: el hook expone `createProgrammaticPoliza` (valida pero sin modal; los montos ya cuadran por diseño). | Rutas 2 y 3 de §4.3 existen HOY y nadie mencionó moverlas; quedan dentro del nuevo modelo. |
| D-11 | **Importación Excel se traslada a Pólizas**: genera pólizas `tipo: 'diario'` con `folio` automático. Reutiliza `parseJournalImport` sin cambios. | El Libro Diario queda solo lectura; la importación es captura. |
| D-12 | **Catálogo: consolidación global** (Fase 5): las subcuentas por diario se consolidan one-shot en el catálogo global `contasis_accounts` con la migración; se retira el catálogo híbrido. | Sin "diario activo" no tiene sentido el catálogo local por diario. CAMBIO DE COMPORTAMIENTO APROBADO (subcuentas pasan a ser globales). Ver DV-2. |
| D-13 | **Inventario final: clave única `'general'`** (Fase 5): migración copia el primer valor (orden de inserción) → `finalInventories['general']`; de ahí en adelante el hook opera con esa clave fija. La clave de storage y el Record no cambian de forma. | Sin diario activo no hay clave por la cual indexar. Preserva la forma `Record<string, number>` y el comportamiento sin auto-guardado. |
| D-14 | **Respaldos versión 2**: el snapshot incluye `polizas` Y conserva `journals` vacío (compatibilidad); la restauración detecta formato viejo (solo `journals`) y lo migra al vuelo. | Los respaldos viejos (v1.0.0) deben poder restaurarse sin pérdida. |
| D-15 | **`useJournals` se retira en Fase 5** y sus componentes (`EntryForm`, `EntryList`, `JournalTabs`, `EntryCard`) se eliminan. `AccountPicker.tsx` SE CONSERVA en su carpeta actual (es reutilizado por `PolizaForm`) — moverlo es opcional en Fase 7. | Limpieza honesta: código muerto fuera, tests viejos retirados con su parte. |
| D-16 | **El Libro Diario consolida TODO**: cronológico de TODAS las pólizas (los tres tipos), no solo las de un periodo o tipo. | Así lo pide la especificación ("reporte consolidado"). CAMBIO DE COMPORTAMIENTO APROBADO: hoy los reportes derivan solo del diario activo. |

### 5.1 Desviaciones aprobadas respecto al TASK SPECIFICATION

| ID | Especificación pedía | Se implementa | Motivo |
|----|---------------------|---------------|--------|
| DV-1 | `PartidaPoliza { id, accountId, accountCode, accountName, debit, credit, concept? }` | Gana `uuidCFDI?: string; rfcTercero?: string` | Sin esos campos se pierden datos de CFDI/RFC en la migración (DIOT + CompNal SAT se rompen). |
| DV-2 | (No mencionaba catálogo ni inventarios) | Consolidación global de subcuentas y clave `'general'` de inventario | El "diario activo" desaparece; ambos dominios dependían de él. Decisión D-12/D-13. |
| DV-3 | "localStorage / IndexedDB" | Se mantiene `storageService` (Electron → Capacitor → localStorage) | El proyecto NO usa IndexedDB; inventar una segunda capa duplicaría el modelo. El servicio existente CUMPLE el requisito de persistencia local. |
| DV-4 | `exportPolizasXML(polizas: Poliza[], mes: number, anio: number)` | Firma conserva `rfc: string` como primer parámetro: `exportPolizasXML(rfc, anio, mes, polizas, accounts)` | El RFC es obligatorio del encabezado XML y del nombre de archivo `RFC+AÑO+MES+PL.xml` (patrón vigente). |
| DV-5 | "reconstruir JournalView" | Se reconstruye en Fase 4, no junto con el módulo | Permite fases pequeñas y verificables: primero EXISTE Pólizas (Fase 3), luego el Diario se convierte en solo lectura (Fase 4). |

---

## 6. Contratos exactos (copiar así; no variar firmas)

### 6.1 `src/types.ts` — adiciones (Fase 1)

```ts
/** Tipo de póliza contable: captura de Ingreso (1), Egreso (2) o Diario (3) para SAT. */
export type TipoPoliza = 'ingreso' | 'egreso' | 'diario';

/** Una línea de una póliza (partida contable de un solo lado). */
export interface PartidaPoliza {
  id: string;
  accountId: string;    // id del catálogo (Account.id)
  accountCode: string;  // Snapshot de código (para XML/imprimir sin buscar en catálogo)
  accountName: string;  // Snapshot de nombre
  debit: number;        // cargo — ≥ 0
  credit: number;       // abono — ≥ 0
  concept?: string;
  uuidCFDI?: string;    // ver DV-1: preserva Movimiento.uuidCFDI
  rfcTercero?: string;  // ver DV-1: preserva Movimiento.rfcTercero
}

/** Póliza contable formal: la unidad de captura primaria del sistema. */
export interface Poliza {
  id: string;           // = id de JournalEntry migrado (D-3) o crypto.randomUUID()
  folio: number;        // Consecutivo INDEPENDIENTE por tipo (D-4)
  tipo: TipoPoliza;
  fecha: string;        // YYYY-MM-DD
  concepto: string;
  partidas: PartidaPoliza[];
  totalDebe: number;    // Recalculado con normalizeAmount en cada guardado (D-7)
  totalHaber: number;   // idem
  uuidSat?: string;
  elaboro?: string;
  autorizo?: string;
}
```

Nota: `JournalEntry` y `Movement` se conservan (son la proyección de lectura). `Journal` queda solo como formato del archivo histórico que leerá la migración.

### 6.2 `src/lib/accounting.ts` — adiciones (Fase 1)

```ts
/** Valida partida doble. Función pura: no toca estado. Tolerante a ambas columnas en 0. */
export const validatePolizaBalance = (
  partidas: PartidaPoliza[]
): { isBalanced: boolean; totalDebe: number; totalHaber: number; difference: number } => {
  // totalDebe  = normalizeAmount(sum(debit))
  // totalHaber = normalizeAmount(sum(credit))
  // difference = normalizeAmount(totalDebe - totalHaber)
  // isBalanced = difference === 0
  //              (una póliza sin partidas: length === 0 → isBalanced false)
};

/** Proyección de lectura: Poliza[] → JournalEntry[] (D-6: NO ordena). */
export const flattenPolizasToJournalEntries = (
  polizas: Poliza[],
): JournalEntry[] => {
  // por cada póliza:
  //   movements = partidas.map(p => ({
  //     accountId: p.accountId,
  //     type: p.debit > 0 ? 'debit' : 'credit',
  //     amount: p.debit > 0 ? p.debit : p.credit,
  //     uuidCFDI: p.uuidCFDI, rfcTercero: p.rfcTercero
  //   }))
  //   → { id: poliza.id, date: poliza.fecha, description: poliza.concepto,
  //       movements, policyType: poliza.tipo }
  // Caso borde: partida con debit===0 && credit===0 → NO genera movimiento.
  //             (pólizas inválidas nunca deberían alcanzar aquí; defensa pasiva.)
};

/** Siguiente folio disponible para un tipo: max(folio)+1, 1 si no hay. */
export const nextPolizaFolio = (polizas: Poliza[], tipo: TipoPoliza): number => { ... };

/** Folio display: "ING-0001" | "EGR-0001" | "DIA-0001" (solo presentación). */
export const formatPolizaFolio = (poliza: Poliza): string => { ... };
```

`Movimiento ↔ partida` (reutilizable por migración y por `PolizaForm`):

| Campo partida | Fuente |
|---------------|--------|
| `debit` | `movement.type === 'debit' ? movement.amount : 0` |
| `credit` | `movement.type === 'credit' ? movement.amount : 0` |
| `accountCode` / `accountName` | lookup en catálogo (migración) o selección (form). Fallback: `''` |
| `uuidCFDI` / `rfcTercero` / `concept` | pasan tal cual (opcional) |

### 6.3 `src/lib/migrateJournalsToPolizas.ts` — nuevo (Fase 2)

```ts
/** Migración determinista de diarios legacy → pólizas (D-2, D-3, D-4). */
export const migrateJournalsToPolizas = (
  journals: Journal[],
  accounts: Account[]
): Poliza[] => { ... };
```
- Orden: diarios tal como vienen; asientos tal como vienen; folio por contador de tipo (debe ser estable y test-congelado).
- `partidas` según tabla de §6.2; `accountCode/Name` por lookup (fallback `''`).
- Devuelve `[]` si no hay entradas (el guard anti re-migración es el flag de storage, no esta función).

### 6.4 `src/hooks/usePolizas.ts` — nuevo (Fase 2)

Dueño EXCLUSIVO de: `contasis_polizas` + `contasis_polizas_migrated`.
*(Ajustado tras la ejecución de Fase 2 — ver DV-6: recibe `{ canSave }` para proteger R2 y la migración.)*

```ts
export function usePolizas({ canSave }: { canSave: boolean }) {
  const [polizas, setPolizas] = useState<Poliza[]>([]);

  // Persistencia: SIEMPRE persiste, incluido [] (por diseño, D-14 heredado
  // de useJournals.hydrate — permite que eliminar todas las pólizas no
  // resucite datos por re-migración).
  useEffect(() => { saveToStorage(POLIZAS_KEY, polizas).catch(console.error); }, [polizas]);

  /** Alto nivel: valida (D-9) y asigna folio y totales (D-7). Lanza si inválida. */
  const createPoliza   = (data: Omit<Poliza, 'id' | 'folio' | 'totalDebe' | 'totalHaber'>): Poliza => {};
  const updatePoliza   = (id: string, data: Omit<Poliza, 'id' | 'folio' | 'totalDebe' | 'totalHaber'>): void => {};
  const deletePoliza   = (id: string): void => {};      // con confirmación en App
  const importPolizas  = (nuevas: Poliza[]): void => {}; // asigna folio faltante por tipo
  /** Alta programática sin UI (dep. activos, ajustes de resultados — D-10). */
  const createProgrammaticPoliza = (data: Parameters<typeof createPoliza>[0]): Poliza => {};

  /** Reemplazo atómico + persistencia SIEMPRE (respaldo, sync, migración). */
  const hydrate = (nextPolizas: Poliza[]): void => {};

  const markMigrated = (): void => {}; // persiste el flag TRUE vía storageService
  const isMigrated   = (): boolean => {};

  return { polizas, setPolizas, createPoliza, updatePoliza, deletePoliza,
           importPolizas, createProgrammaticPoliza, hydrate, markMigrated, isMigrated };
}
```

### 6.5 Navegación (Fase 3) — estado objetivo exacto

```ts
// src/lib/navigation.ts
export type AppTab = 'polizas' | 'journal' | 't-accounts' | 'balance'
                  | 'profit-loss' | 'assets' | 'electronic' | 'catalog';
export const DEFAULT_TAB: AppTab = 'polizas';
export const BASIC_NAV_TABS: NavigationTab[] = [
  { id: 'polizas', label: 'Pólizas Contables', shortLabel: 'Pólizas', icon: BookOpen },
  { id: 'journal', label: 'Libro Diario', shortLabel: 'Diario', icon: FileText },
  { id: 't-accounts', ... }, // resto igual
];
```
- En `App.tsx`: `useState<AppTab>(DEFAULT_TAB)`, redirección modo Básico → `setActiveTab(DEFAULT_TAB)`, fallback de etiqueta móvil `?? 'Pólizas'`. Aprovechar para subir el arreglo base de pestañas Básicas a `navigation.ts` (hoy vive en línea en App; reduce duplicación).
- `FISCAL_NAV_TABS` no cambia (sigue al final).

### 6.6 SAT — `src/lib/satExport.ts` (Fase 6)

- Extraer **constructor puro** `buildPolizasXML(rfc, anio, mes, polizas, accounts): string` (testeable sin DOM, mismo patrón que la red de pruebas de `lib/export`).
- `exportPolizasXML = download wrapper` (ver DV-4) — reemplaza el flujo de `generatePolizasXML`.
- Cambios respecto al generador vigente: `NumUnIdenPol = poliza.folio` (antes índice+1), `TipoPoliza` desde `poliza.tipo` (map vigente: `ingreso→1, egreso→2, diario→3`), `Concepto` de la Transacción = `partida.concept ?? poliza.concepto`, `CompNal` desde `partida.uuidCFDI/rfcTercero`. Todo lo demás (schema 1.3, `TipoSolicitud`, escaping) permanece tal cual.

---

## 7. Fases de implementación

Cada fase termina con: gate verde (`npm run lint && npm run test && npm run build`), `ARCHITECTURE.md` actualizado si aplica, escaneo CJK, y pruebas manuales entregadas al usuario.

---

### Fase 1 — Tipos y lógica contable pura

**Artefactos:**
- [x] `src/types.ts`: `TipoPoliza`, `PartidaPoliza` (con DV-1), `Poliza` exactamente como §6.1.
- [x] `src/lib/accounting.ts`: `validatePolizaBalance`, `flattenPolizasToJournalEntries`, `nextPolizaFolio`, `formatPolizaFolio` como §6.2.
- [x] `src/lib/accounting.test.ts`: agregar casos:
  - balance cuadrada → `{ isBalanced: true, difference: 0 }`; desbalance por 1 centavo → false; vacía → `{ isBalanced: false }`; mono-partida.
  - aplanado: mapea exacto `debit/credit`, respeta `uuidCFDI/rfcTercero`, `policyType` copiado, partida 0/0 ignorada, NO ordena (orden de entrada).
  - `nextPolizaFolio`: vacío → 1; tipo sin folios → 1; con huecos → max+1; independencia entre tipos (crear 'egreso' con folios [1,2] no toca 'ingreso').
- [x] Verificar que la suite completa sigue en verde (los tests actuales NO deben cambiar).
- [x] `ARCHITECTURE.md` §4 (modelo de datos): agregar los tres tipos.

**No permitido en esta fase:** tocar hooks, vistas o navegación. Solo tipos + lib + tests.

---

### Fase 2 — Hook `usePolizas` + migración automática

**Artefactos:**
- [x] `src/lib/migrateJournalsToPolizas.ts` según §6.3 + `src/lib/migrateJournalsToPolizas.test.ts`:
  - migración determinista (mismos datos → mismas pólizas y folios si se resetea UUID — usar con `journal id` existente),
  - folios por tipo consecutivos en orden de iteración,
  - preserva `uuidCFDI`/`rfcTercero` y descripción/concepto,
  - lookup de cuenta (code/name) y fallback `''`,
  - `[]` si no hay entradas.
- [x] `src/hooks/usePolizas.ts` según §6.4 + `src/hooks/usePolizas.test.ts`:
  - persistencia SIEMPRE (incluido `[]`): mutate → storage se llamó; estado inicial vacío NO persiste hasta primer set,
  - `createPoliza`: rechaza `< 2` partidas y desbalance (lanza), asigna folio correcto por tipo, recalcula totales (ignora los del payload),
  - `updatePoliza`: preserva `folio` y `tipo`; recalcula totales,
  - `deletePoliza`; `importPolizas` asigna folios faltantes sin duplicar,
  - `hydrate` persiste SIEMPRE,
  - `markMigrated`/`isMigrated` idempotentes.
- [x] `src/hooks/useAppData.ts`: extender `AppDataAppliers` con `setPolizas`. Carga: 1) `contasis_polizas` si existe → `setPolizas`; 2) si NO existe Y no hay flag → cargar `contasis_journals` + `contasis_accounts` y migrar → `setPolizas(migradas)` + `markMigrated()`. Conservar la creación del "Diario Inicial" intacto (los Journals siguen vivos hasta Fase 5).
- [x] `src/App.tsx`: montar `usePolizas` y pasar `setPolizas` a `useAppData`. **AÚN sin UI nueva.**
- [x] `src/hooks/useAppData.test.ts`: extender — polizas cargadas desde storage; migración corriendo UNA vez (flag persiste); con flag y clave ausente → `[]` sin re-migrar; corrupto de journals → migración con `[]` + flag igual.
- [x] `ARCHITECTURE.md`: §5 tabla de claves (dos nuevas), §3 flujo.

**Comportamiento visible:** NINGUNO. La app sigue idéntica; las pólizas migradas viven en storage.

---

### Fase 3 — Módulo de Pólizas (UI) + Navegación

**Artefactos:**
- [ ] `src/components/polizas/PolizaView.tsx` — contenedor: toolbar (Nueva Póliza; "Importar Excel" se agrega en Fase 4 — aquí solo placeholder deshabilitado o ausente), estado de filtro, composición de subcomponentes.
- [ ] `src/components/polizas/PolizaFilter.tsx` — segmentos Todas / Ingresos / Egresos / Diario + buscador por folio numérico y concepto (case-insensitive).
- [ ] `src/components/polizas/PolizaList.tsx` + `PolizaCard.tsx` — tarjetas con: folio formateado (`formatPolizaFolio`), tipo con distintivo de color, fecha, concepto, totales debe/haber, y desglose de partidas (código — cuenta — concepto — debe — haber). Acciones: Editar, Eliminar (vía `ConfirmDeleteModal` existente), Imprimir.
- [ ] `src/components/polizas/PolizaForm.tsx` — modal de captura:
  - seleccionar `tipo` (DISABLED en edición — D-8), fecha (default hoy), concepto general, `elaboro`, `autorizo`,
  - tabla dinámica de partidas con `AccountPicker` (reutilizado de `components/journal/AccountPicker.tsx` sin mover), monto, concepto por partida y (modo fiscal) `uuidCFDI`/`rfcTercero`,
  - validación visual EN VIVO (bandera de cuadre con `difference`),
  - botón Guardar deshabilitado si: `partidas < 2` || no balanceada (D-9; el hook re-valida igualmente),
  - alta desde creación: `createPoliza`; edición: `updatePoliza`.
- [ ] `src/components/polizas/PolizaPrintModal.tsx` — formato físico: encabezado (folio, tipo, fecha, elaboró/autorizó), cuerpo de partidas, línea "SUMAS IGUALES" con `totalDebe === totalHaber`, y tres renglones de firma (Elaboró / Revisó / Autorizó). Botón Imprimir → `window.print()` con estilos `@media print` que aíslan la hoja.
- [ ] `src/lib/navigation.ts` + `src/App.tsx` según §6.5 (DEFAULT_TAB, pestaña primera, redirección, extraer `BASIC_NAV_TABS`).
- [ ] Tests:
  - `src/components/polizas/PolizaForm.test.tsx`: bloquea 0/0 y desbalance; diferencia visible en vivo; mínimo 2 partidas; tipo congelado al editar; campos CFDI solo en modo fiscal (patrón de `EntryForm.test.tsx`).
  - `src/lib/navigation.test.ts` (nuevo, trivial): `DEFAULT_TAB === 'polizas'`, pestaña primera es `polizas`, fiscales al final.
- [ ] Retirar `src/components/journal/EntryForm.test.tsx` SOLO si la captura del diario quedó desechada en esta fase — NO: en esta fase el diario sigue vivo (coexistencia). Tests antiguos intactos.
- [ ] `ARCHITECTURE.md`: §2 árbol (carpeta `polizas/`), §10 (guía "¿dónde cambio X?").

**Estado intermedio aceptado (documentar en PR):** coexistencia. La captura nueva nace en Pólizas; el Diario aún muestra solo diarios legacy. Pólizas creadas NO aparecen en el Diario hasta Fase 4.

---

### Fase 4 — Cutover de reportes y Libro Diario de solo lectura

**Artefactos:**
- [ ] `src/App.tsx`: derivaciones centrales cambian de fuente:
  ```ts
  const proyeccion = useMemo(
    () => flattenPolizasToJournalEntries(
      [...polizas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.folio - b.folio)
    ),
    [polizas]
  );
  const tAccountsData = useMemo(() => buildTAccountsData(proyeccion), [proyeccion]);
  ```
  El desempate por folio es determinista; verificar que la `ref` de las Cuentas T sea el índice 1-based de la proyección (comportamiento equivalente al previo).
- [ ] Vistas que recibían `entries` del diario activo ahora reciben `proyeccion`: `CatalogView` (guard de cuentas en uso), `ContabilidadElectronicaView` (DIOT/XML), `TAccountsView` (indirecto), Balance/Resultados (vía `accountBalances`).
- [ ] `src/components/JournalView.tsx` → **reporte de solo lectura**: ELIMINA `EntryForm`, su botón "Nuevo Asiento" y los tabs de diarios. Tabla cronológica consolidada: FECHA / FOLIO / TIPO / CUENTA / CONCEPTO / DEBE / HABER (proyección complementada con folio/tipo; opción: pasar `polizas` en paralelo para enriquecer cada fila). Exporta Excel/PDF sobre la misma proyección, SIN importador ni plantilla (se trasladan en el punto siguiente).
- [ ] Rutas de captura re-cableadas:
  - `ProfitLossView` (`onAdd` → `createProgrammaticPoliza` D-10).
  - `FixedAssetsView` (`onAdd` → `createProgrammaticPoliza`, tipo diario, concepto "Depreciación mensual").
  - Importación Excel: botón se traslada a `PolizaView`; genera pólizas diario vía `importPolizas` a partir de `parseJournalImport` (reusar el resultado, que ya resuelve `accountCode`/`accountName`). Quirk CONCEPTO preservado y anotado (§4.5).
- [ ] Tests:
  - Actualizar `EntryForm.test.tsx` — si `EntryForm` se retira aquí, su batería migra a `PolizaForm.test.tsx` (que ya existe) y este test se elimina.
  - `useAppData`/`usePolizas` sin cambios estructurales (deben seguir en verde).
  - Comprobación de integridad: test liviano en `lib/accounting.test.ts` — el flatten de una póliza migrada de ejemplo produce los mismos totales que espera `buildTAccountsData`.
- [ ] `ARCHITECTURE.md`: §3 flujo de datos (fuente = pólizas), §2, §10.

**Criterio clave de la fase:** los reportes y XML reflejan TODO lo capturado en Pólizas; el Diario ya no captura nada.

---

### Fase 5 — Compatibilidad (respaldo/sync) y desmantelamiento del modelo Journal

**Artefactos:**
- [ ] `src/hooks/useBackup.ts`: `BackupSnapshot` gana `polizas: Poliza[]` (mantener `journals` para poder restaurar respaldos viejos → D-14). Restauración: si `backup.polizas` existe → `polizasState.hydrate`; si solo trae `journals` → migrar al vuelo con `migrateJournalsToPolizas` y `hydrate`.
- [ ] `App.tsx` orquestador `restore` actualizado (anti-R1 intacto).
- [ ] `SyncModal`/`syncService` (sin tocar el servicio remoto — los tokens están caducados y la migración a KV sigue estacionada): el estado LOCAL que se comparte ya incluye `polizas`; al aplicar estado remoto de formato viejo (con `journals`), mapear a pólizas antes de `hydrate`. Mínimo requerido: no romper la pantalla de sync.
- [ ] Catálogo (D-12): migración one-shot de todas las `subAccounts` de diarios → `contasis_accounts` (dedup por código, `isReadOnly` false para nuevas); `useCatalog` simplificado: SIN hibridación con diario (solo `accounts` global + auto-recuperación quirúrgica existente). CatalogView sin cambios profundos de UI.
- [ ] Inventario (D-13): migración de `Record<journalId, number>` → clave `'general'`; `useInventories` ya no depende de `activeJournalId`; `BalanceSheetView`/`ProfitLossView` sin cambios de comportamiento visibles.
- [ ] `AppHeader`: retirar props `hasActiveJournal`/`activeJournalName` (o sustituir por contador de pólizas del periodo — decisión mínima: retirar y dejar el título neutro).
- [ ] **Retirar legacy** (D-15): `useJournals.ts` + su test; `EntryForm.tsx`, `EntryList.tsx`, `EntryCard.tsx`, `JournalTabs.tsx` y sus tests si quedan; `lib/importEntriesFromExcel.ts` SE CONSERVA (lo usa la importación de pólizas). La clave `contasis_journals` NO se toca en storage (archivo histórico).
- [ ] `useAppData` simplificado: sin diario inicial; carga pólizas/catálogo/inventario/activos.
- [ ] Tests: `useBackup.test.ts` (restauración v2 y legacy migrado), `useCatalog.test.ts` (sin híbrido), `useInventories.test.ts` (clave 'general'), retirar `useJournals.test.ts`.
- [ ] `ARCHITECTURE.md` completo (árbol, clave, flujo, modelo): estado final del modelo de pólizas.

**Helper de la migración del catálogo:** función pura con pruebas `lib/migrateCatalogToGlobal.ts` (dedup por código, no duplica los globales readonly, conserva las creadas por el usuario, idempotente).

---

### Fase 6 — Exportación SAT (Anexo 24) por pólizas

**Artefactos:**
- [ ] `src/lib/satExport.ts` según §6.6: `buildPolizasXML` puro + wrapper `exportPolizasXML` (DV-4). Reemplaza la llamada desde `ContabilidadElectronicaView`.
- [ ] `lib/satExport.test.ts` (nuevo): el XML se genera, se re-parsea y se verifica:
  - 1 póliza ingreso (TipoPoliza="1"), egreso ("2"), diario ("3"),
  - `NumUnIdenPol` = folio real (NO índice),
  - Transacciones con `Concepto` de partida si existe (fallback concepto general),
  - `CompNal` preservado con uuidCFDI+RFC,
  - escaping de `&<>"'` en conceptos/cuentas,
  - nombre de archivo `RFCAÑOMESPL.xml` (verificar patrón vigente).
- [ ] `ContabilidadElectronicaView`: cambia fuente de entrada a pólizas del periodo (o proyección — revisar consistencia con Catalogo/Balanza, que siguen derivando de la proyección).
- [ ] `ARCHITECTURE.md`: sección SAT (si existe, actualizar menciones a folios).

---

### Fase 7 — Documentación, cierre y verificación global

**Artefactos:**
- [ ] `ARCHITECTURE.md` revisión íntegra final: árbol real, propiedad de claves con `contasis_polizas` + flag, flujo, modelo de datos (Poliza como unidad primaria, Journal como formato legacy de respaldo), quirks anotados.
- [ ] `README.md`: si describe el flujo de uso, reflejar Pólizas como captura principal.
- [ ] `PLAN_POLIZAS.md`: §11 registro final, §12 desviaciones cerradas; marcar plan COMPLETADO (documento pasa a histórico como hizo `REFACTORING_PLAN.md`).
- [ ] (Opcional, solo si sobra contexto) mover `AccountPicker.tsx` a una carpeta común (`components/account/`) — requiere tocar imports en `polizas/` y `journal/` restante. NO imprescindible.
- [ ] Gate final COMPLETO: `npm run lint && npm run test && npm run build` + CJK scan en todo + pruebas manuales end-to-end (lista en §8.3).

---

## 8. Criterios de aceptación globales (del TASK SPECIFICATION, mapeados)

### 8.1 Automáticos
1. `npx tsc --noEmit` / `npm run build` estricto — sin errores.
2. `npm run test` (Vitest) todo en verde; el número total solo puede crecer respecto al baseline (85) salvo retiros justificados en el registro.
3. **Imposibilidad de guardar pólizas desbalanceadas** — probada en DOS capas: UI (`PolizaForm.test.tsx`) y hook (`usePolizas.test.ts`).
4. **Migración sin pérdida de información** — `migrateJournalsToPolizas.test.ts` congelado: asientos → pólizas 1:1, CFDI/RFC preservados, folios por tipo consecutivos.

### 8.2 Estructurales
- `flattenPolizasToJournalEntries` alimenta TODOS los reportes sin romper las firmas de las vistas existentes (por diseño del plan: las derivaciones siguen recibiendo `JournalEntry[]`).
- Ninguna vista escribe claves de storage que no le pertenecen (anti-R1 revisado fase por fase).

### 8.3 Manuales (checklist del usuario al final de cada fase relevante)
- Fase 2: arranque normal; datos intactos; (inspección devtools) existe `contasis_polizas` + flag.
- Fase 3: Pólizas es pestaña por defecto; capturar una póliza de cada tipo; folios consecutivos por tipo; desbalance bloquea; impresión con sumas iguales y firmas.
- Fase 4: Cuentas T, Balance, Resultados, DIOT/XML reflejan lo capturado en pólizas; Libro Diario muestra cronológico consolidado sin botón de captura; cierre y depreciación generan pólizas diario.
- Fase 5: respaldo viejo JSON v1.0 restaura sin pérdida; catálogo incluye las subcuentas antes locales; inventario final persiste.
- Fase 6: XML de pólizas con folios reales abre correcto; CompNal presente.

---

## 9. Riesgos y puntos de atención

1. **Fase 3→4 ventana de coexistencia:** las pólizas nuevas NO aparecen en el Diario legacy hasta Fase 4. Comunicarlo al usuario explícitamente para evitar tickets fantasma.
2. **Cambio de alcance de reportes** (D-16): antes, la derivación era por diario activo; después, consolidado global. Balance/TAccounts cambian de total si el usuario tenía varios diarios con asientos — comportamiento NUEVO esperado y deseado, anotarlo.
3. **`journalSubAccounts` híbrido:** hasta Fase 5, `useCatalog` sigue híbrido; las cuentas nuevas del catálogo después de migrar pólizas deben ir al lugar correcto según fase (al diario hasta F5, al global después). Anotar en cada fase.
4. **IDs de `PartidaPoliza` derivados**: el helper de migración debe generar un ID determinístico `${entry.id}-p${i}`; NUNCA `crypto.randomUUID()` dentro de la migración (rompe la idempotencia).
5. **XML SAT vigente:** el generador actual rellena el atributo `Concepto` de la Transacción con la GLOSA del asiento; con pólizas, la partida puede llevar su propio concepto. Mantener el estándar (atributos exactos del Anexo 24 v1.3).
6. **Electron/Capacitor:** probar la migración también en escritorio (Electron) — `storageService` cambia de capa; el flag de migración debe persistir por la MISMA capa (`saveToStorage`, no `localStorage` crudo).
7. **Tests de UI con jsdom:** la modal de impresión (`window.print`) — mockear; los tests existentes de modales son el patrón.
8. **`getStoredAppMode`/localStorage quirks en tests:** recordar el setup de `src/test/setup.ts` (rebind de storage para Node 25 + Vitest) — los nuevos tests de hooks deben ejecutar bajo ese setup (ya global).

---

## 10. Fuera de alcance (documentado, no adeudado)

- Migración Upstash → Cloudflare KV (sync remoto sigue estacionado; tokens caducados).
- Mostrar el mensaje real del parser en el `catch` de importación (se mantiene el genérico).
- Navegador como rol de sync de escritorio.
- Eliminar `xlsx@0.18.5` (ExcelJS ya instalado) — candidato de limpieza aparte.
- Multimoneda y tipo de cambio dinámico (el formato SAT vigente asume MXN / TipoCambio=1).

---

## 11. Registro de ejecución (actualizar en cada fase)

| Fase | Estado | Fecha | Notas / commits |
|------|--------|-------|-----------------|
| 1 — Tipos + lógica pura | Completada | 2026-10-19 | 99 tests en verde (85 + 14 nuevos); lint y build limpios. Sin cambios de UI. Sugerencia de commit: `feat: tipos y lógica pura de pólizas contables` |
| 2 — Hook + migración | Completada | 2026-10-19 | 121 tests en verde (99 + 22 nuevos: migración, hook, hidratación); lint/build limpios. Migración ONE-SHOT activa al primer arranque. Sugerencia de commit: `feat: usePolizas con migración one-shot de diarios legacy` |
| 3 — Módulo Pólizas + navegación | Pendiente | — | |
| 4 — Cutover reportes + Diario read-only | Pendiente | — | |
| 5 — Compatibilidad + limpieza legacy | Pendiente | — | |
| 6 — SAT por pólizas | Pendiente | — | |
| 7 — Documentación y cierre | Pendiente | — | |

**Estados válidos:** `Pendiente` → `En curso` → `Completada` / `Detenida (motivo)`.

---

## 12. Desviaciones y hallazgos (log durante ejecución)

| ID | Fase | Hallazgo/Desviación | Decisión |
|----|------|--------------------|----------|
| DV-1 | def. | Especificación perdía CFDI/RFC al migrar | Se agregan campos opcionales a `PartidaPoliza` (D-5). |
| DV-2 | def. | Catálogo híbrido e inventarios dependían de "diario activo" (no mencionado en la especificación) | D-12 / D-13: consolidación global + clave `'general'`. |
| DV-3 | def. | Especificación pedía IndexedDB; el proyecto usa `storageService` (Electron/Capacitor/localStorage) | Se conserva la capa existente. |
| DV-4 | def. | Firma de `exportPolizasXML` sin RFC es inviable (header + filename del XML) | RFC se mantiene como parámetro. |
| DV-5 | def. | Reconstrucción del Diario requiere Pólizas ya existente | Separación Fase 3 / Fase 4. |
| DV-6 | 2 | El efecto de persistencia sin puerta escribía `[]` al montar y mataba la migración (condición de carrera con la hidratación async) | `usePolizas` recibe `canSave` (patrón de useCatalog): persiste solo pos-carga, SIEMPRE incluido `[]`; el App pasa `hasLoaded`. Contrato §6.4 ya corregido. |
| — | — | _nuevo hallazgo aquí_ | |

---

*Fin de la guía central. Última revisión de este documento: 2026-10-19 (creación, pre-Fase 1).*
