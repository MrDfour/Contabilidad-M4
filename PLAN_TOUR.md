# PLAN_TOUR.md
## Tour guiado interactivo — Contabilidad M4 Pro

> Tutorial paso a paso (coach marks + overlay semitransparente) que recorre **todas** las funciones de la app, con dos triggers: al primer inicio y a voluntad.
>
> **Nota clave (honestidad de implementación):** el codebase **no incluye todavía** `data-testid` para todos los elementos del formulario; el tour se basa en los **labels y `aria-label` reales** como fallback. Los `data-testid` agregados en F2 facilitan la ancla del spotlight.

---

## 0. Principios y restricciones (no negociables)

- **Español siempre.**
- **Nunca sobrescribe datos reales**. El tour solo lee. Si el usuario no tiene datos, abre el tour y guía a crear su primer cliente/póliza; el sembrado automático de `demo-tour` se posterga a F2.5.
- **No modifica catálogos SAT** ni binarios del anexo.
- **Gate**: `npm run lint && npm run test && npm run build` + escaneo anti-CJK.
- **Sin commit**: el usuario comitea con GitHub Desktop.

---

## 1. Checklist de `data-testid` F2 completados

✅ **PolizaView.tsx:**
- `poliza-plantilla` — botón Plantilla
- `poliza-importar` — botón Importar Excel  
- `poliza-asignar-folios` — botón Asignar pendientes
- `btn-nueva-poliza` — botón Nueva Póliza

✅ **PolizaCard.tsx:**
- `poliza-card` — artículo de la tarjeta
- `poliza-print-btn` — botón Imprimir de la tarjeta

✅ **PolizaPrintModal.tsx:**
- `cheque-adjuntar-btn` — checkbox Con imagen del cheque

✅ **DiarioPrintModal.tsx:**
- `diario-print-imagen-cheque` — checkbox Con imagen del cheque

✅ **JournalView.tsx:**
- `journal-excel` — botón Excel
- `journal-pdf` — botón PDF
- `diario-print-modal` — botón Imprimir Pólizas

✅ **F3 (modales de captura e impresión):**
- `poliza-form`, `poliza-form-campo-concepto`, `poliza-form-partida-{idx}`, `poliza-form-hoja`, `poliza-form-adjuntar-cheque`, `poliza-form-guardar` (PolizaForm.tsx)
- `poliza-print-modal` (PolizaPrintModal.tsx)
- `diario-print-sheet` (DiarioPrintModal.tsx)

✅ **Sidebar.tsx:**
- `sidebar-tab-polizas`, `sidebar-tab-journal`, `sidebar-tab-t-accounts`, `sidebar-tab-balance`, `sidebar-tab-profit-loss`, `sidebar-tab-catalog`

🕒 **Pendientes F2.5/F3:**
- `empresa-activa`, `tema-menu` (AppHeader.tsx)
- Tabs fiscales: `sidebar-tab-assets`, `sidebar-tab-electronic` (solo visibles en modo fiscal)
- CatalogView, FixedAssetsView, EmpresasModal, TemaMenu

---

## 2. Cronograma F3 (en curso)

**F2.5 — Datos de demostración (decisión de usuario, implementado):**
- El tour **nunca crea datos**; al primer arranque guía al usuario hacia su primer llenado real.
- Al finalizar, si el ÚNICO cliente es la empresa de demostración (`demo-tour`), la burbuja final pregunta
  «¿Borrar la empresa de demostración?» con `data-testid="tour-purga-demo"`.
- **Salvaguarda (fuera de discusión):** la acción solo se transmite al tour si `esUnicaEmpresaDemo(empresas)`
  (`lib/tour.ts`): con cualquier cliente real presente, la purga no existe ni se ofrece.
- Vía de escritura: `useEmpresas.hydrate` (orquestador), porque `eliminarEmpresa` prohíbe por diseño (C-8)
  borrar el último cliente. Las claves por cliente de la demo quedan como archivo histórico (igual que en
  la eliminación normal de clientes). El sembrado automático de datos demo queda DESCARTADO.

**F3 — UX avanzado (completado tras revisión visual del usuario):**
- **Foco visual donde corresponde (capturas del usuario):** los pasos del encabezado ahora se anclan con
  `data-testid` reales — `app-header` (header completo), `app-modo` (selector Básico/Fiscal),
  `header-clientes`, `header-sync` y `sync-modal` (raíz de la bóveda). Antes el `targetText`
  «Contabilidad M4 Pro» no matcheaba (el `textContent` real es «Contabilidad M4Pro») y el paso quedaba
  sin foco.
- **Objetivo fuera de pantalla (p. ej. el pie):** tanto el overlay como la burbuja traen el objetivo a la
  vista con `scrollIntoView` SOLO al cambiar de paso (nunca en cada evento de scroll, para no secuestrar
  el desplazamiento del usuario), y la burbuja se posiciona en `useLayoutEffect` después del scroll.
- **Placements con flip**: implementado — `posicionTarjeta` (TourCoachMark) recorta la tarjeta al viewport
  y alterna lados («top»↔«bottom», «left»↔«right») cuando el lado preferido no cabe; sin objetivo queda
  centrada.
- **Pasos de captura reales (F3 parte 1)**: agregados los `data-testid` del formulario y de los modales de
  impresión; los pasos `form-*` ya se anclan y ya no se omiten siempre:
  - `poliza-form` (raíz del modal de captura), `poliza-form-campo-concepto`, `poliza-form-partida-{idx}`
    (en ambos modos de captura), `poliza-form-hoja` (select Formato/Tipo), `poliza-form-adjuntar-cheque`,
    `poliza-form-guardar`.
  - `poliza-print-modal` (raíz del modal de impresión individual), `diario-print-sheet` (raíz del modal
    de impresión del diario).
- **Reevaluación de `saltarSi` al avanzar**: el motor re-filtra los pasos en cada cambio de paso
  (`pasoIdx` en dependencias), así el usuario que abre la captura a mitad del recorrido ve los pasos
  `form-*` aparecer; con índice fuera de rango, vuelve al inicio.
- **Reapertura siempre desde el paso 1**: al encenderse la visibilidad (botón «Tour» del encabezado o
  primer arranque), el motor resetea el paso, limpia la auto-navegación ya registrada y garantiza el
  estado en `contasis_tour_state`; nunca retoma la posición de un cierre anterior.
- **«Finalizar» ≠ «Saltar»**: el botón Finalizar (y la purga de demo) cierran con la vía de completado
  (`completed: true`, estado `contasis_tour_state` garantizado, sin marcar `contasis_tour_skipped`),
  de modo que el recorrido completo no re-dispara la apertura automática en la siguiente sesión.
- **Honestidad de los pasos (F3)**: el paso «Cheque físico» ya no habla de un toggle «Es cheque» que no
  existe; ahora apunta al select `poliza-form-hoja` con el texto real.
- **Bóveda EN VIVO durante el tour**: el paso `respaldo` abre automáticamente el modal de sincronización
  (acción `accion: 'abrir-boveda'`; App transmite `onAbrirBoveda`/`onCerrarBoveda`). Al salir del paso —o
  al cerrarse el tour— la bóveda se cierra SOLO si la abrió el tour (si el usuario ya la tenía abierta,
  se respeta). El foco se ancla a la TARJETA del diálogo (`[data-testid="sync-card"]`), no al telón
  `fixed inset-0`, para que el ancla sea la caja real visible. Su z-index (145) queda debajo del overlay
  del tour (200) y de la burbuja (201), así el usuario ve frase de papel y QR mientras se explican.
- **La burbuja jamás tapa su ancla**: `posicionTarjeta` rechaza cualquier candidato (crudo o recortado)
  que invada el rectángulo del objetivo — antes, un objetivo pegado al borde («Nueva Póliza», «Libro
  Diario», «Excel») terminaba con la burbuja recortada ENCIMA del botón; ahora el motor gira al lado
  alterno (top↔bottom, left↔right) y solo cae al centro si ningún lado cabe sin cubrir.
- **Cierre de demo**: implementado en la burbuja final (caja `tour-purga-demo`), siempre con la salvaguarda de `esUnicaEmpresaDemo`.

---

## 3. Estado actual

### Cobertura del tour (revisión con lente de contador migrante de COI/CONTPAQi)

Con base en esa revisión se agregaron los pasos que faltaban y se alineó la terminología:

| Paso nuevo/ajustado | Qué cubre | Ancla real |
|---|---|---|
| `polizas-importar` (nuevo) | Plantilla + Importar Excel + Asignar pendientes: migración desde COI/CONTPAQi | `[data-testid="poliza-plantilla"]` |
| `form-fiscal` (nuevo, requiereFiscal) | «Leer XML» del CFDI en la partida: UUID, RFC, cotejo de importes, RFC de tercero → DIOT | texto «Leer XML» |
| `respaldo` (nuevo) | Respaldo JSON con todos los clientes (pie), vigilante semanal, bóveda Escritorio+teléfono con frase en papel y QR | texto «Respaldo» (AppFooter) |
| `empresas` (reescrito) | «Cliente» = «empresa» de otros sistemas; un archivo contable por cliente; honesto: el tour NO crea la demo | texto «Clientes» (header) |
| `balance` (ajustado) | Activo/Pasivo/Capital Contable, código SAT y comparación con balance anterior | texto «Balance» (sidebar) |
| `tema-sync` (ajustado) | Tema claro/oscuro; el punto de la bóveda vive en el encabezado | centrado |
| Purga de demo (ajuste) | «empresa de demostración» → «cliente de demostración» (término que usa la UI) | — |

**Pendiente documentado (roadmap, no tour):** no existe la función de saldos iniciales / póliza de apertura
para migrar el balance del cierre anterior; el tour no la puede prometer.

| Fase | Estado | Pruebas |
|------|--------|---------|
| **F1 — Setup** | ✅ Verde | 405 pruebas (38 archivos) |
| **F2 — data-testid** | ✅ Verde | +7 tests (TourOverlay.test.tsx) |
| **F2.5 — Datos de demo** | ✅ Purga con salvaguarda | +6 tests (lib/tour + TourProvider) |
| **F3 — UX avanzado** | ✅ Flip + pasos de captura reales | +7 tests (tourSteps, TourCoachMark) |
| **F4 — Gate** | ⏳ Pendiente |  |

**Files touched:** `PolizaView.tsx`, `PolizaCard.tsx`, `PolizaPrintModal.tsx`, `DiarioPrintModal.tsx`, `JournalView.tsx`, `Sidebar.tsx`, `AppHeader.tsx`, `App.tsx`, `tour/*`

---

## 4. Riesgos y mitigaciones

- **R1 — Sobrescribir datos reales:** imposible por `hayDatosReales`.
- **R2 — Targets inexistentes:** sidebar usa el texto "Pólizas" como fallback; los steps del formulario usan `saltarSi` para omitirse cuando el modal no está abierto (el tour mostrará un mensaje guía).
- **R3 — Formulario no abierto:** se propone navegación automática de F3 para abrir el formulario cuando el step corresponda.
- **R4 — Inventar features:** todo lo no existente en v1 se mantiene como propuesta.

---

## 5. Archivos modificados (no commit)

- `src/components/layout/AppHeader.tsx` (+test)
- `src/App.tsx`
- `src/lib/tour.ts` (nuevo)
- `src/types/tour.ts` (nuevo)
- `src/components/tour/*` (nuevos)
- `src/components/polizas/PolizaView.tsx`
- `src/components/polizas/PolizaCard.tsx`
- `src/components/polizas/PolizaPrintModal.tsx`
- `src/components/polizas/DiarioPrintModal.tsx`
- `src/components/polizas/JournalView.tsx`
- `src/components/layout/Sidebar.tsx`

**No** se alteran catálogos SAT ni binarios del anexo.