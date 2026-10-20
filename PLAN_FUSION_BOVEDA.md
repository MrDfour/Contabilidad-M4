# PLAN_FUSION_BOVEDA.md — Fusión de bóveda por hora de captura (BL-6)

> **Propósito:** agregar el tercer camino de resolución del conflicto K-7 —
> **"Fusionar ambos"** — que conserva las entradas capturadas en DOS dispositivos
> cuando el conflicto nace de capturas paralelas sin conexión. Complementa (no
> reemplaza) a "Conservar datos locales" / "Sobrescribir con datos remotos".
>
> **Estado:** PLAN ABIERTO. Decidir fases aquí, ejecutar con gates
> (`npm run lint && npm run test && npm run build` + escaneo anti-CJK/mojibake),
> registrar cada fase en la sección 7. Regla de mantenimiento: cambios de
> estructura → actualizar `ARCHITECTURE.md` en el mismo commit.
>
> Base técnica ya vigente (v0.9.8): `Poliza.capturadoEn` / `Poliza.editadoEn`
> estampados silenciosos; `importPolizas` estima la captura con la fecha fiscal;
> botón "Restaurar" del SyncModal con blobs `?full=1`.

---

## 1. Contexto y caso de uso

Escenario de uso: PC captura lo del día, móvil capta un gasto emergente sin
conexión, ambos confluyen. Hoy el modal K-7 obliga a elegir UN lado; el lado
descartado queda en el historial de la nube y se recupera a mano (y su trabajo
nunca sube). La fusión resuelve: **el snapshot final contiene las pólizas de los
dos lados, ordenadas por hora de captura y con folios sanos**.

## 2. Decisiones (F-1 … F-8)

- **F-1 — Alcance del merge v1: solo ALTAS.** El merge une pólizas por `id`
  (unión de conjuntos); NO respeta borrados (no hay tumbstones, el snapshot
  sigue v3). Si un dispositivo borró y otro capturó, el conflicto se resuelve
  con las opciones actuales del modal. El caso "misma captura accidentada en dos
  dispositivos" queda cubierto por la revisión de duplicados (F-5).

- **F-2 — Folios: pantalla de decisión explícita.** Los entrantes con folio
  LIBRE conservan su folio tal cual; los colisionantes (mismo tipo, folio tomado)
  van a una pantalla de revisión con decisión POR ELEMENTO:
  - **(a) Re-foliar por captura** — el lote del conflicto se re-ordena con
    `nextPolizaFolio` tomando `capturadoEn` como criterio del orden,
  - **(b) Folio pendiente** — `folio: 0` (centinela "sin asignar"), mostrada
    como "pendiente"; se asigna después con la acción F-6,
  - **(c) Al final consecutivo** — el entrante toma el siguiente folio
    disponible del tipo (continúa la serie local).
  El resto de la serie local NO se re-folia: los folios locales son sagrados y
  la opción (a) solo reordena el lote del conflicto.

- **F-3 — Edición cruzada: gana `editadoEn`.** Si el mismo `id` existe en ambos
  con contenido distinto, prevalece la edición con `editadoEn` más reciente
  (pólizas legadas sin estampado: gana la local si su par tampoco lo tiene). El
  reporte de la revisión lista qué ediciones ganaron.

- **F-4 — Dominios no foliables: gana el dispositivo que dispara el merge.**
  Inventarios finales y catálogo de empresas/activaId NO se fusionan (saldos
  numéricos, semántica no conmutativa): se conserva lo del dispositivo que
  dispara el merge. Cuentas
  y activos fijos se unen por `id` (el `id` ya existente → gana el local).

- **F-5 — Duplicados sospechosos: listado ANTES de aplicar.** Pólizas del
  remoto con el mismo tipo+fecha+concepto que una local van a la revisión con
  checkbox incluir/excluir (preseleccionadas como excluir — la causa más común
  es una captura accidental duplicada). NADA se aplica sin pasar por ahí.

- **F-6 — Acción "Asignar folios pendientes".** En la tabla de pólizas, asigna a
  cada póliza con `folio === 0` el siguiente folio disponible de su tipo,
  ordenadas por `capturadoEn`. Manual a pedido; NADA automático (el usuario
  controla cuándo cierra la serie). Se LISTAN en la revisión del merge las
  afectadas.

- **F-7 — Publicación del snapshot fusionado.** El resultado se aplica
  (`aplicarSnapshotV3`) y se publica COMO VERSIÓN NUEVA (`max+1` contra el
  vigente) vía `publicarAhora` forzado sin chequeo remoto (la toma de decisión
  ya ocurrió); los otros dispositivos lo absorben por la vía normal. La huella
  anti-eco K-11 no debe bloquear el envío (contenido fusionado difiere del
  remoto original).

- **F-8 — El conflicto vigente no se toca sin decisión.** El engine sigue
  bloqueado en estado `conflicto` durante la revisión; ninguna publicación
  automática interrumpe (schedulePublicacion respeta el mismo estado como
  hoy). El conflicto queda de pie hasta APLICAR (o cancelar) la fusión; el
  botón "Fusionar ambos" solo lo consume tras aplicar el merge.

## 3. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Folio 0 rompe pantallas/reportes que asumen folios positivos | Barrido exhaustivo de usos de `folio`; render "—" (pendiente); los reportes siguen ordenables; tests de pantalla del consolidado |
| El conflicto se ve interrumpido durante la revisión (push nuevo por WS) | El merge LEE el snapshot del conflicto UNA VEZ; los datos quedan en RAM local; al aplicar se publica max+1 — el WS posterior NO puede interponer conflicto (el estado conflicto ya se consumió) |
| Snapshot grande en la revisión (miles de pólizas) | La revisión solo LISTA: sumar, ediciones ganadoras, colisiones de folio, duplicados; NO editar pólizas ahí |
| Catálogos editados en ambos lados (una cuenta corregida en 2 lugares) | Gana el lado local + reporte (v1); revisión manual queda post-backlog |
| La huella anti-eco puede silenciar el envío del snapshot fusionado (contenido == remoto accidentado) | F-7 exige publicación forzada; con test del caso "fusiono y el resultado coincide con el remoto" (debe enviarse igualmente) |

## 4. Fases

### Fase A — Librería pura de fusión (`src/lib/unionBovedas.ts`)
Función pura `analizarFusion(local: BackupSnapshotV3, remoto: BackupSnapshotV3)`: regresa
análisis (pólizas a sumar, ediciones ganadoras F-3, colisiones de folio por tipo,
duplicados sospechosos F-5, catálogos unionables). `aplicarFusion(local, remoto,
DecisionesFolio[])`: produce el snapshot final y el resumen para el usuario.
Tests con snapshots divergentes (incluye: mismo id editado en ambos, misma captura
duplicada, folios colisionados por tipo, póliza sin estampado).

### Fase B — Motor: acceso al contenido del conflicto + publicación del merge
`VaultSyncEngine.contenidoConflicto(): Promise<unknown>` (descifra el doc del
conflicto con la credencial), `aplicarSnapshotFusionado(snapshot: unknown)`: aplica
y publica (F-7: versión máx(vigente, conflicto)+1, conflicto=null, estado 'al dia').
Tests del motor: fusión sin eco, conflicto despejado tras aplicar.

### Fase C — UI: tercer botón + pantalla de revisión
`ConflictoBovedaModal` tercer botón "Fusionar ambos (recomendado si solo hubo
ALTAS)" → pantalla de revisión (componente propio): secciones "se suman /
ediciones que ganan / folios colisionantes (3 opciones por elemento, F-2) /
duplicados sospechosos (checkbox, F-5)"; botón "Aplicar fusión" deshabilitado
mientras queden colisiones de folio SIN decisión. Aplica → publica → toast con
el resumen del reporte (pólizas sumadas, re-foliadas, pendientes).

### Fase D — Acción "Asignar folios pendientes" (F-6)
En la tabla de pólizas de escritorio: acción en lote con confirmación (asigna
el siguiente folio disponible a los `folio === 0`, en orden `capturadoEn`). El
orden y el alcance se previsualizan antes de confirmar; reporta las pólizas
tocadas.

### Fase E — Versionado, docs y pruebas de escena
Bump (0.9.x), `ARCHITECTURE.md` (motor, modal de conflicto, acción pendientes,
mapa del archivo nuevo), `BACKLOG.md` (BL-6 → ejecutado), gate completo, prueba
manual multi-dispositivo del escenario de uso.

## 5. Criterios de aceptación

- El escenario de uso (PC día + móvil gasto) se resuelve en CUATRO clics:
  conflicto → Fusionar ambos → (si hay colisión de folio) una decisión por
  elemento → Aplicar. Resultado: AMBAS entradas en ambos dispositivos, con
  folios continuos por tipo.
- Duplicados sospechosos NUNCA se aplican sin decisión del usuario (incluir/excluir
  en la pantalla de revisión, por defecto excluir).
- El snapshot fusionado sale publicado con versión `max+1` y los DEMÁS
  dispositivos lo absorben automáticamente (WS o sondeo), sin modal extra.
- La acción "Asignar pendientes" opera en cualquier momento (también fuera
  de conflicto).
- Gate verde + tests nuevos pasando; escaneo anti-CJK/mojibake limpio.

## 6. Fuera de alcance del plan (post-backlog)

- Tumbstones de borrado y snapshot v4 con lectura tolerante (BL-6 quedará
  extendido si la práctica demuestra borrados paralelos frecuentes).
- Merge granular de inventarios/cuentas con revisión semántica por campo.
- Restricción de escrituras a miembros con credencial (BL-1) — sin relación
  directa con la fusión, va para su propio plan.

## 7. Registro de fases / desviaciones

(fechas y compromisos conforme se ejecutan; una entrada por fase)

- **Fase A — COMPLETADA (2026-10-20).** `src/lib/unionBovedas.ts` con
  `analizarFusion(local, remoto)` → `AnalisisFusion` (ediciones F-3, entrantes
  directos, colisiones de folio con contraLocal/contraEntrantes, duplicados F-5,
  empresasFaltantes F-4) y `aplicarFusion(local, remoto, decisiones)` →
  `{ snapshot, resumen }`; decisión de folios por entrante
  ('refoliar'/'pendiente'/'final'} con SOBRE-esquema base predeterminado:
  colisionante sin decisión → 'pendiente', duplicado sin inclusión → excluido.
  La pasada de re-foliación reordena el lote (emisores locales + entrantes del
  conflicto) por `capturadoEn` con salto de folios tomados fuera del lote.
  15 tests en `src/lib/unionBovedas.test.ts` (total del proyecto: 273). Gate
  limpio (lint/tsc, vitest, build) y escaneo anti-CJK/mojibake sin hallazgos.
- Fase B (motor) — PENDIENTE.
