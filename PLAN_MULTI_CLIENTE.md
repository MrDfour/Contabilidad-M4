# Plan Multi-Cliente (D-17) — Contabilidad M4 Pro

> **CERRADO Y ARCHIVADO — IMPLEMENTADO COMPLETO (2026-10-19).** Registro de decisiones y ejecución.
> El mapa vigente sigue siendo `ARCHITECTURE.md` (actualizado al modelo multi-cliente).

## 1. Objetivo

El usuario (contador externo) atiende **varios clientes**: cada cliente es una
**empresa/workspace** con su propio catálogo de cuentas, activos fijos, inventario,
pólizas (con folios independientes por cliente+tipo) y **RFC propio** para los
archivos SAT. Un selector permite alternar el cliente activo; los reportes y la
captura operan SIEMPRE sobre el cliente activo.

## 2. Decisiones congeladas (C-1..C-8)

| ID | Decisión | Por qué |
|----|----------|---------|
| C-1 | Concepto en UI: **"Clientes"**; tipo en código: `Empresa` (id/nombre/rfc). El botón del header muestra el nombre del cliente activo y abre el gestor (modal `EmpresasModal`), no un dropdown en el header. | Encaja con el caso real (contador → clientes); modal centraliza switch/renombre/RFC/alta/baja con menos UI frágil. |
| C-2 | **Claves de datos POR CLIENTE con sufijo**: `contasis_polizas_<empresaId>`, `contasis_accounts_<empresaId>`, `contasis_fixed_assets_<empresaId>`, `contasis_final_inventories_<empresaId>` (helper puro `clavePorEmpresa`). Las claves globales ANTIcas (`contasis_polizas`, etc.) quedan como ARCHIVO tras la migración one-shot (flag `contasis_empresas_migrated`): se copian a las claves del cliente por defecto y NO se borran (mismo conservadurismo que `contasis_journals`). | Aislar clientes sin fusionarlos; conserva "un dominio = un hook = su clave" (anti-R1) con clave compuesta; la migración es copia segura y reversible. |
| C-3 | **`contasis_empresas`** guarda `{ activaId, empresas: Empresa[] }` — dueño EXCLUSIVO: nuevo hook `useEmpresas`. El RFC vive en `Empresa.rfc`. | Una sola clave de metadatos; RFC respaldado/sincronizable con la empresa. |
| C-4 | **Cambio de cliente = recarga orquestada**: `useAppData` rehidrata los 4 dominios leyendo las claves del cliente activo. Durante el cambio `canSave` baja a false (App lo resetea) hasta que la carga termina — protege R2 y evita escribir el estado vacío transitorio sobre el storage del cliente saliente. | Menor RAM (no precarga todos los clientes), un único camino de carga, los hooks de dominio intactos en lógica interna. |
| C-5 | **Respaldos v3**: snapshot = todas las empresas con sus datos (`empresas: EmpresaWorkspace[]` + `activaId`). Restauración: v3 → hidrata todo; **v2/v1 sobrescriben SOLO los datos del cliente ACTIVO** (semántica predecible, no revienta otros clientes). `getSnapshot` se vuelve async (lee las claves de TODAS las empresas). | Los respaldos viejos siguen funcionando; la exportación cubre a todos los clientes. |
| C-6 | **Sync** comparte el estado del cliente ACTIVO (`SyncState` gana `empresaId`/`empresaNombre`). Al aplicar remoto: si el `empresaId` remoto existe → sobrescribe ESE cliente; si no existe → crea un cliente nuevo con su nombre; formato viejo (v2/v1, sin `empresaId`) → sobrescribe el cliente activo (semántica previa). | No rompe la pantalla de sync; acompañamiento de equipos por cliente. |
| C-7 | **SAT por cliente**: `ContabilidadElectronicaView` precarga el RFC del cliente activo y lo persiste en `Empresa.rfc` tras una exportación exitosa. | RFC propio por cliente (motivo central del feature). |
| C-8 | **Eliminar cliente**: prohibido eliminar el ÚLTIMO cliente; se confirma vía `ConfirmDeleteData` con tipo `'empresa'`. Eliminar el activo cambia el activo al primero restante. | Evita quedar sin workspace; borrado destructivo siempre con confirmación. |

## 3. Fases

### Fase 1 — Tipos + helpers puros
- [ ] `types.ts`: `Empresa`, `EstadoEmpresas`.
- [ ] `lib/empresas.ts`: `clavePorEmpresa(base, empresaId)`, `DOMINIOS_POR_EMPRESA`.
- [ ] Tests puros `lib/empresas.test.ts`.

### Fase 2 — `useEmpresas` + migración one-shot
- [ ] `hooks/useEmpresas.ts`: dueño de `contasis_empresas` (+ flag `contasis_empresas_migrated`): CRUD (create/rename/update RFC/delete con guarda de último), setActiva, hydrate persistente, persistencia con puerta `canSave`.
- [ ] Tests `useEmpresas.test.ts`.

### Fase 3 — Dominios por cliente + `useAppData` + App
- [ ] `usePolizas` / `useCatalog` / `useInventories`: prop `empresaId`; clave compuesta; `hydrateEmpresa(empresaId, valor)` para restauración/boot (anti-R1: el hook escribe SU clave sea cual sea el cliente).
- [ ] Activos fijos dentro de `App.tsx`: persistencia con clave por cliente + puerta `canSave`.
- [ ] `useAppData`: boot (migración one-shot legacy → cliente por defecto "Mi Empresa" + flag; carga de metadatos y dominios del activo) + efecto de RE-CARGA al cambiar `activaId` (sin duplicar el arranque).
- [ ] `App.tsx`: `useEmpresas`, `activa`, `empresaId` hacia los dominios, reset de `canSave` en cambio de cliente.
- [ ] Tests actualizados (fixtures con sufijo `_e1`) + carga por cambio de cliente.

### Fase 4 — UI de clientes
- [ ] `components/EmpresasModal.tsx`: lista/selección, renombre, RFC, crear, eliminar (con confirmación `'empresa'` y guarda de último cliente).
- [ ] `AppHeader`: botón con nombre del cliente activo → abre el modal.
- [ ] Tests del modal.

### Fase 5 — Respaldo v3 y sync por cliente (C-5/C-6)
- [ ] `useBackup`: snapshot async v3 (todas las empresas); validación v3/v2/v1; restauración según C-5.
- [ ] `syncService`/`App`: `SyncState` con empresa activa; `applyRemoteSyncState` según C-6.
- [ ] Tests de backup v3/v2/v1.

### Fase 6 — SAT RFC por cliente + documentación + gate final
- [ ] RFC del cliente activo precargado y persistido tras exportar (C-7).
- [ ] `ARCHITECTURE.md` completo (claves por empresa, flujo, modelo), `README.md` (flujo de clientes), registro §9.
- [ ] Gate final completo + escaneo anti-CJK.

## 4. Quirks/notas
- `storageService` usa la clave como nombre de archivo en Electron/Capacitor: los ids uuid van al nombre de archivo — aceptado (C-2).
- La migración NO toca las claves globales antiguas: quedan como archivo histórico; solo se LEE en la migración one-shot.
- Los folios por tipo son independientes POR CLIENTE por diseño (cada array de pólizas es de un solo cliente).
- El reporte/libro/proyección ya derivan del estado activo: NO requieren cambios.

## 5. Registro de ejecución

| Fase | Estado | Fecha | Notas |
|------|--------|-------|-------|
| 1 — Tipos + helpers | ✅ Completada | 2026-10-19 | `Empresa`/`EstadoEmpresas` en types.ts; `lib/empresas.ts` con `clavePorEmpresa`, `BASES_POR_EMPRESA`, `arrayDe`, `objetoDe` + tests. |
| 2 — useEmpresas | ✅ Completada | 2026-10-19 | Hook dueño de `contasis_empresas` + flag `contasis_empresas_migrated`; CRUD con guarda de último cliente, `setActiva`, `hydrate`, puerta `canSave`; 12 tests. |
| 3 — Dominios por cliente | ✅ Completada | 2026-10-19 | `usePolizas`/`useCatalog`/`useInventories`/activos fijos con clave por cliente + `hydrateEmpresa`; `useAppData` reescrito (boot con migración one-shot C-2 + recarga C-4); App conectada. Tests re-fixtureados (`_e1`), flags heredados retirados de los hooks (ver DV-C-1). Gate: 164 tests. |
| 4 — UI clientes | ✅ Completada | 2026-10-19 | `EmpresasModal` (switch/alta/edición RFC/baja), botón en `AppHeader`, `ConfirmDeleteData.type` gana `'empresa'`; 7 tests. Gate: 171 tests. |
| 5 — Respaldo/sync v3 | ✅ Completada | 2026-10-19 | Backup v3 (todas las empresas, `getSnapshot` async; v2/v1 sobrescriben solo el activo), `SyncState` con `empresaId`/`empresaNombre` y asignación por empresa en `applyRemoteSyncState`. Gate: 174 tests. |
| 6 — SAT RFC + docs + gate | ✅ Completada | 2026-10-19 | RFC del cliente activo precargado y persistido tras cada exportación (C-7); README v0.8.0 (sección Clientes #1), ARCHITECTURE al día (claves por cliente, quirks #5/#6), package.json 0.8.0. Gate final: lint ✓, 174 tests ✓, build ✓, escaneo CJK ✓ (src + docs).

## 6. Desviaciones (DV)

| ID | Desviación | Justificación |
|----|------------|----------------|
| DV-C-1 | Los flags one-shot `contasis_polizas_migrated` (D-2) y `contasis_catalog_migrated` (D-12) **dejan de ser dueños de hook**: los hooks `usePolizas`/`useCatalog` ya no exponen `markMigrated`/`isMigrated` y sus appliers salieron de `AppDataAppliers`. Ambos flags SOLO se leen dentro de la migración one-shot de clientes (C-2). | Con `contasis_empresas_migrated` gobernando el boot, mantener tres flags vivos duplicaba gobernancia. El contenido de las claves globales (ya migrado por PLAN_POLIZAS) se copia íntegro; los flags legados siguen respetando su semántica (no re-migrar) dentro de esa única pasada. |
| DV-C-2 | El test `'migración de diarios legacy'` (journals con entries vacíos) sustituye al antiguo caso de migración completa; la migración real journals→pólizas conserva cobertura en `migrateJournalsToPolizas.test.ts` y se ejercita a través del caso "D-12 subsumida" de `useAppData.test.ts`. | El caso real de entrada de datos legacy está cubierto por el snapshot de pólizas (`contasis_polizas`) ya vencido en la app actual. |
| DV-C-3 | La restauración de respaldos v2/v1 cambia su mensaje: ahora informa que solo se restauró el cliente ACTIVO. | C-5 de este plan: los demás clientes quedan intactos por diseño. |

