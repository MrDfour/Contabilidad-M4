# Plan Cheques — Póliza de Cheques y Rework del Modal de Captura

> **✅ COMPLETADO (2026-10-23) — las 5 fases ejecutadas; registro en §10.**
> Códigos de decisión en este plan: `CH-x`. Queda UN análisis previo (§8:
> compresión adaptativa + experimento de legibilidad) antes de codificar.
> Convención del repo: al ejecutar, cada fase actualiza `ARCHITECTURE.md` y deja
> `npm run lint && npm run test` en verde en el mismo commit.
> Insumo: pedido del contador (2026-10-21) + formato físico real "PÓLIZA DE
> CHEQUE" (papel pre-impreso tipo TPASA 1013, con zona superior para calcar el
> cheque con papel carbón).

## 1. Objetivo

Reformar el modal de captura para que la captura **en papel sea la primera
opción** y se resuelva con **un solo menú desplegable** de las cuatro pólizas
reales del flujo mexicano:

| Hoja | Tipo en código | Comportamiento |
|------|----------------|----------------|
| Póliza de Ingresos | `ingreso` | Como hoy (hoja papel clásica) |
| Póliza de Egresos | `egreso` | Como hoy (hoja papel clásica) |
| Póliza de Diario | `diario` | Como hoy (hoja papel clásica) |
| **Póliza de Cheque** | `cheque` (NUEVO) | Igual a la clásica **+ zona superior en blanco** para calcar el cheque con papel carbón al imprimir **+ datos del cheque + anexo con la imagen del cheque** |

Además: decisión de arquitectura para el **anexo de imagen del cheque** sin
agotar la cuota de Cloudflare KV (bóveda E2EE, uno de los límites duros del
proyecto; mecánica viva en `ARCHITECTURE.md` §6).

### No-alcance (explícito)

- Conciliación bancaria / saldo por cuenta bancaria (se anota en BACKLOG).
- Impresión de la imagen del cheque dentro de la hoja (la zona de calca va
  EN BLANCO: la imagen es archivo de referencia, no parte del impreso físico).
- Migraciones de datos viejos (no hay: los tipos existentes no cambian, no se
  agrega ninguna clave de dominio nueva).
- Cambios al flujo de importación Excel y a capturas programáticas (no tocan tipos).

## 2. Decisiones

### Congeladas (dominio contable)

| ID | Decisión | Por qué |
|----|----------|---------|
| CH-1 | **`TipoPoliza` gana un 4º valor: `'cheque'`** (`types.ts`). La póliza de cheque es una póliza plena: partidas, folio y validación de partida doble idénticos a los demás. | "Póliza de cheque" es un documento distinto (forma física y datos propios), no un subcaso que viva dentro de egresos. La lógica de partidas NO cambia. |
| CH-2 | **Para SAT (Anexo 24) la póliza de cheque SE EXPORTA como egresos**: `TIPO_POLIZA_SAT.cheque = '2'` (el Anexo 24 solo define tipo 1=ingresos, 2=egresos, 3=diario; no existe "cheque"). | El catálogo SAT es cerrado; mapear es lo correcto fiscalmente y evita XML inválido. |
| CH-3 | **Folio propio por tipo: `CHE-0001`** (consecutivo por tipo y por cliente, igual que ING/EGR/DIA), **Y campo aparte `cheque.numero` para el folio bancario del cheque** — decisión del usuario: la póliza tiene su folio contable Y el cheque su folio físico del banco, son cosas distintas y deben convivir. Extender `formatPolizaFolio`/`nextPolizaFolio` con el prefijo `CHE`. | El diseño de folios ya es por tipo, extenderlo es barato y mantiene `unionBovedas` (colisiones F-2) consistente. |
| CH-4 | **Los metadatos del cheque viven en `Poliza.cheque?`:** `{ numero?, banco?, beneficiario?, anexos? }` (campos opcionales, texto libre; `numero` = folio bancario del cheque, no el folio de la póliza). | No inventar un registro bancario: solo lo que la hoja necesita encabezar. La conciliación real es no-alcance. |
| CH-5 | **La zona "calcar cheque" va SIEMPRE en blanco en el impreso**: la hoja imprimible de cheque reserva ~35–40% superior sin contenido; ahí cae el calcado con papel carbón sobre el formato pre-impreso. La imagen anexa NUNCA se imprime ahí. | Así funciona el papel real: ese espacio es del carbón. La imagen digital es archivo/referencia. |
| CH-6 | **El anexo es 1 imagen por póliza de cheque** (fase 1), modelado como *referencia* en la póliza + *archivo aparte* en storage (sección 5): `Poliza.cheque.anexos = [{ id, sha256, bytes, mime, capturadoEn }]` — NUNCA un data-URL inline en `Poliza[]`. | Un data-URL inline revienta los 3 límites a la vez: localStorage web (~5 MB por clave), el blob de la bóveda (cap duro KV de 25 MiB) y cada push de sync re-subiría el snapshot completo. Ver §5/§6. |
| CH-7 | **La captura 'clasica' NO se retira** en esta fase; queda como opción del mismo control (ver CH-8). El modo papel pasa a ser el **default del modal** (persistido en la ya existente `contasis_modo_captura`, que pasa a guardar `'papel'` por defecto). | El pedido es "papel primero", no "elimina la clásica"; la clásica sigue siendo útil en pantallas chicas (el grid papel cambia a stack vertical). |

### Decididas con el usuario (2026-10-21)

| ID | Decisión | Fuente |
|----|-----------|--------|
| CH-7 | La captura 'clasica' NO se retira; queda como opción del mismo control. El modo papel es el **default del modal** (persistido en `contasis_modo_captura`, default `'papel'`). | Pedido original. |
| CH-8 | **UX**: se reemplaza el par "CAPTURA [Clásica \| Papel]" por un control único al frente: `FORMATO ▾` con **Ingresos / Egresos / Diario / Cheque** (cada uno = hoja papel) + entrada secundaria discreta "usar captura clásica (campos)". En modo clásico, el dropdown TIPO DE PÓLIZA gana el valor "Cheque". **El modal recuerda la última hoja usada** (`contasis_hoja_papel`) — decidido: "sí, para agilizar múltiples entradas similares". | Respuesta #2 del usuario. |
| CH-9 | **Compresión al capturar** (para imágenes es **WebP**; WebM es video): re-encode local con canvas → WebP, objetivo ≤ ~150 KB; fallback JPEG si no hay encoder WebP. **Decidido: si tras la escalera sigue > 300 KB se guarda CAPADO — nunca se rechaza el anexo por tamaño.** + CH-13 abajo. | Respuesta #3 del usuario. |
| CH-10 | **Deduplicación por SHA-256**: si el hash del binario nuevo ya existe en el cliente, se reutiliza el archivo. El `id` del anexo ES el hash. | Consenso del plan. |
| CH-11 | **Anexos NO viajan en la bóveda (fase 1)**: imagen 100% local; en la póliza viajan solo los metadatos. Placeholder "Anexo disponible solo en el equipo original" en el otro equipo. | Respuesta implícita del usuario (sin objeción); en firme. |
| CH-12 | **Respaldos v3: metadatos sí, imágenes no** + nota en la UI del respaldo. | Idem. |
| CH-13 | **Escalera de recompresión agresiva ANTES del capado**: la resolución del original es materia prima — si es alta (p. ej. foto de 12 MP), se acepta bajar más px/calidad que en un escaneo pequeño. La escalera queda en §8 (análisis previo, con experimento de legibilidad obligatorio antes de codificar). | Respuesta #3 del usuario: "guardar capado, pero analizar recompresión más agresiva". |
| CH-14 | **Ciclo de vida del anexo huérfano: PURGA a los 5 días; AVISO al día 4** con acciones sobre el banner: [Guardar en mi dispositivo] / [Descartar ya] / [Ver]. La purga del boot borra solo anexos con edad ≥ 5 días y 0 referencias. | Respuesta #4 del usuario ("4. Anexos huérfanos…"). |
| CH-15 | **Pie de la hoja cheque: "SUMAS IGUALES"** (decidido, uniformidad con las otras 3 hojas); en el código se deja comentario explícito: la leyenda queda PENDIENTE de futuros cambios según la práctica contable real del contador. | Respuesta #5 del usuario ("4. Sumas iguales…"). |
| CH-16 | **`Poliza.cheque.anexos` se modela como LISTA desde el día 1** (fase 1 la UI limita a 1 elemento). | Respuesta #6 del usuario. |

## 3. Modelo de datos

```
types.ts
  export type TipoPoliza = 'ingreso' | 'egreso' | 'diario' | 'cheque';   // CH-1

  export interface ChequeAnexo {            // CH-6 — REFERENCIA, no el binario
    id: string;          // sha256(binario) — dedupe CH-10
    sha256: string;
    bytes: number;
    mime: 'image/webp' | 'image/jpeg';
    capturadoEn: string; // ISO — materia prima de la fusión por hora de captura
  }

  export interface ChequeDatos {            // CH-4
    numero?: string;     // folio BANCARIO del cheque (otro que el folio contable CHE-, CH-3)
    banco?: string;
    beneficiario?: string;
    anexos?: ChequeAnexo[];
  }

  interface Poliza { ...; cheque?: ChequeDatos }  // invariante: solo se puebla/visualiza si tipo === 'cheque'
```

Piezas del código a extender con el tipo nuevo (todas ya son generales por
tipo — la mayoría solo necesita el prefijo `CHE` en su mapa, se lista para
revisión, no para reinventar):

| Archivo | Qué toca |
|---------|----------|
| `lib/accounting.ts` | `formatPolizaFolio` (`CHE-…`), `nextPolizaFolio`, cobija de tipos en `asignarFoliosPendientes` (F-6). |
| `lib/satExport.ts` | `TIPO_POLIZA_SAT` (CH-2); NINGÚN campo nuevo al XML (el cheque entra como egreso real). |
| `lib/unionBovedas.ts` | F-2/F-6 ya agrupan por `tipo` — verificar con tests que un tipo nuevo corre sin cambios de lógica (quizá solo mapas de prefijos). Incluir `Poliza.cheque` en el contenido estable del snapshot (huella K-11). |
| `components/polizas/PolizaFilter.tsx` | chip "Cheques". |
| `components/polizas/PolizaCard.tsx` | distintivo visual + folio `CHE-…` (+ botón "Ver anexo" si existe). |
| `components/polizas/PolizaSheet.tsx` | ya soporta `tituloOverride`/folio anterior; la variante de cheque se agrega en Fase 3. |

## 4. Rework del modal de captura (`polizas/PolizaForm.tsx`)

### 4.1 Estado actual

El modal tiene: toggle CAPTURA (`ModoCaptura = 'clasica' | 'papel'`, en
`contasis_modo_captura`) + dropdown TIPO (`TipoPoliza`, congelado al editar D-8)
+ grid de partidas.

### 4.2 Forma destino (CH-8)

```
┌ Nueva Póliza Contable ────────────────────────────────────────────┐
│  FORMATO ▾ [ Póliza de Cheque ]     ·  Ingresos / Egresos / Diario│
│          + enlace secundario: "usar captura clásica (campos)"     │
│  ... (hoja papel o formulario clásico según lo elegido)           │
└───────────────────────────────────────────────────────────────────┘
```

- El dropdown FORMATO **es** el tipo (en papel, tipo ⇔ hoja 1:1). Se elimina la
  duplicación de elegir tipo dos veces.
- "Usar captura clásica" conserva el modo actual (columna única + dropdown TIPO
  interior con los 4 valores, incl. cheque). Persistencia: `contasis_modo_captura`
  conserva su contrato (`'clasica' | 'papel'`, default `'papel'`); la hoja
  elegida vive en el `tipo` del draft; la ÚLTIMA hoja usada se recuerda en
  `contasis_hoja_papel` (decidido CH-8, para agilizar entradas en tanda;
  si la clave no existe aún, default: Diario).
- Edición (D-8): el tipo/hoja queda congelado igual que hoy.
- Mobile (<1024 px): la hoja papel cambia a stack vertical (el grid horizontal
  no cabe); la captura de cheque igual, con la zona de anexo arriba. Requisito
  único: la validación de SUMAS IGUALES / ≥2 partidas es idéntica en ambos.

### 4.3 Formulario "Póliza de Cheque" (solo papel)

1. **Datos del cheque (CH-4):** Número de cheque, Banco (texto libre), Beneficiario.
2. **Concepto del pago** (es el campo concepto de siempre — se guarda en
   `Poliza.concepto`; no se duplica modelo).
3. Partidas: idénticas (grid Debe/Haber). Típicamente `110x-Bancos` al **Haber**
   y la cuenta destino al Debe — la app no lo fuerza (la validación de partida
   doble existente lo cubre).
4. **Anexo (CH-6/CH-9/CH-10):** botón "Adjuntar imagen del cheque"
   (file-picker con `accept="image/*"`; en APK/Electron el picker nativo permite
   cámara). Pipeline de captura:
   ```
   archivo → leer resolución del ORIGINAL (materia prima de la escalera, CH-13)
     P1: downscale largo 1600 px → toBlob(WebP, .72)
     P2: si > 150 KB → 1200 px · .60
     P3: si > 150 KB → 1000 px · .45 (+ grayscale automático)

     P4: si aún > 300 KB → búsqueda binaria de calidad (.40→.28) hasta ≤ 300 KB
         (NUNCA se RECHAZA el anexo: se decidió guardarlo CAPADO — CH-9)
     └─ fallback JPEG si no hay encoder WebP

   → sha256 (Web Crypto) → ¿ya existe? → reutiliza el anexo (CH-10)
   → attachmentService.save(...) (ver §5)
   → Poliza.cheque.anexos = [{ id: sha, sha256, bytes, mime, capturadoEn }]
   ```
5. El guardado sigue el flujo estándar (`createPoliza`) salvo que el anexo ya
   se persistió aparte. Si el usuario cancela el modal sin guardar, el anexo
   queda huérfano → **ciclo CH-14**: aviso al día 4 (§4.4), purga a los 5 días
   (la ejecuta el boot; ver §4.4 — NO borrar agresivamente al cancelar: el
   usuario puede reintentar el alta con la misma imagen).

### 4.4 Aviso del día 4 y purga del día 5 (CH-14)

```
día 0 — anexo capturado: { capturadoEn } y referencia en la póliza (o huérfano si se canceló)
día 4 — edad ≥ 4 días y 0 referencias → BANNER en PolizaView (no bloquea captura):
        "N imagen(es) de cheque sin asignar se borrarán mañana"
        [Guardar en mi dispositivo] · [Descartar ya] · [Ver]
día 5 — edad ≥ 5 días y 0 referencias → la purga del boot los elimina
```

- `Guardar en mi dispositivo`: blob → objectURL → `a.download` (web) / file-pick
  o share nativo (APK/Electron). ES el rescate que pidió el usuario antes de
  que se borre.
- `attachmentService.listarHuerfanos(empresaId)`: lista los anexos cuyo sha no
  aparece referenciado por NINGUNA `Poliza.cheque.anexos[]` del cliente.
- Límite honesto a documentar: la app NO tiene notificaciones push locales;
  el banner solo se ve si el usuario abre la app durante el día 4. Si no la
  abre, la purga del día 5 procede igual (ventana de rescate = lo que se use
  la app en esa ventana). Se deja anotado en el banner el caveat "mañana".

### 4.5 Vista del anexo

- `PolizaCard` (tipo cheque): botón "Imagen del cheque" abre lightbox simple
  (`<img>` con zoom nativo). Si el dispositivo no tiene el binario (CH-11):
  placeholder "Anexo solo en el equipo original — la sincronización de imágenes
  no está incluida" (con `bytes`/`capturadoEn` como pista).

## 5. Dónde vive la imagen (persistencia multiplataforma)

Nueva pieza owner (anti-R1): **`services/attachmentService.ts`** — única pieza
que escribe anexos; los componentes nunca tocan storage directo.

| Plataforma | Backend del anexo | Clave/archivo |
|------------|--------------------|----------------|
| Web/PWA | **IndexedDB** (DB `contasis_anexos`, store `anexos`) | localStorage web ≈ 5 MB en TOTAL por origen; IndexedDB maneja cientos de MB sin esforzarse. Key: `<empresaId>_<sha>`. |
| Capacitor/Android | Plugin `Filesystem`, `Directory.Data` (igual que `storageService`), archivo aparte | `anexo_<empresaId>_<sha>.<ext>` en disco. |
| Electron | IPC nuevo `saveAttachment/loadAttachment/deleteAttachment` en `electron/main.js` | Archivos en una subcarpeta `attachments/` del userData. |

Reglas:
- El binario vive 100% local al dispositivo (CH-11).
- Escritura/lectura/borrado por (empresaId, sha) son las únicas operaciones;
  el `polizaId` NO entra en la clave (un archivo, dedupe CH-10, sirve a
  cualquier póliza que lo referencie).
- Borrado en cascada al eliminar la póliza (`deletePoliza`) cuando su anexo
  pierde la última referencia.
- Relación con `usePolizas` (anti-R1): `usePolizas` NO sabe de binarios; los
  metadatos viajan en `Poliza.cheque` por el camino normal de pólizas (folio,
  sync, merge, SAT).

## 6. Cuota KV / bóveda: por qué NO en el snapshot (aritmética real)

Contexto (bóveda E2EE v0.9.0): la bóveda es **1 blob AES-GCM con el snapshot v3
completo de TODAS las empresas**; cada push re-subiría el blob entero. KV free
tier: 1 000 writes/día (push + hasta 5 puts de historial — la CUOTA sobra),
cap duro de **25 MiB POR VALUE**, historial de 5 versiones con TTL 30 días.

| Escenario | Impacto si el anexo va inline dentro de `Poliza[]` |
|-----------|------------------------------------------------------|
| 1 cheque/semana (~200 KB comprimido) | ≈ 800 KB/mes de binario (+33% base64 en JSON) → el cap de 25 MiB tarda años, PERO el problema empieza antes: cada push re-subiría un blob que crece linealmente (más latencia y más bytes por versión de historial, que solo guardan 5). |
| 15 cheques/día (contador en actividad, varios clientes) | ≈ 330 × 200 KB ≈ **66 MB/mes** → el cap de 25 MiB se revienta en MENOS DE 1 MES. Inviable. |
| Fusión de bóveda (F-x) en conflicto | El merge tendría que comparar binarios entre dos equipos → imposible sin descargar todas las imágenes al conflicto. |

Conclusión (CH-11): el costo estructural del blob-único hace inviable meter
imágenes en la bóveda SIN re-trabajar el sync (fragmentación + R2). Fase 1:

- Metadatos SÍ viajan (hash + bytes + fecha): permiten constatar "hubo anexo,
  pesa tanto, fue tal día".
- Imágenes NO viajan: placeholder en el otro equipo (la app ya sabe lidiar con
  contenido ausente por diseño — reservado, restauración parcial, C-5).
- **Camino futuro (fuera de este plan): anexos en R2 del mismo worker** (KV para
  coordinación, R2 para binarios; R2 no cobra "operations" por put en su precio
  base) detrás del mismo `vaultId`/E2EE. El worker ya tiene auth/rutas; queda
 como item de BACKLOG, no dentro de esta fase.

Presupuesto local (fase 1): 150 KB × ~20 cheques/mes ≈ **3 MB/mes** en
IndexedDB — sin susto en ninguna plataforma; el dedupe CH-10 aplana el caso
recurrente de recapturar la misma hoja.

> Aclaración honesta: si el usuario REQUIERE tener las imágenes del cheque en la
> nube y sincronizadas entre equipos, la fase 1 no basta: hay que presupuestar
> la integración R2 (nueva pieza en `worker/` + migrar el motor de sync). Se
> deja señalado para decidir con datos reales de uso (¿cuántos cheques/mes?).

## 7. Preguntas abiertas — RESUELTAS por el usuario (registro 2026-10-21)

| # | Pregunta original | Respuesta del usuario → decisión |
|---|--------------------|-----------------------------------|
| 1 | ¿Folio propio `CHE-0001` o comparte folio con egresos? | **Folio propio** y, además, **campo aparte para el número de cheque** (los cheques llevan su propio folio bancario). → CH-3 + CH-4 (`cheque.numero`). |
| 2 | ¿Recuerda la última hoja usada? | **Sí** — "para agilizar múltiples entradas similares". → CH-8 / `contasis_hoja_papel`. |
| 3 | ¿Rechazar o capar si pasa de 300 KB? | **Guardar capado**, pero **analizar recompresión más agresiva** — si el original es de alta resolución, tal vez aguante más compresión. → CH-9 (capado como último recurso) + CH-13 y análisis §8 (obligatorio antes de codificar). |
| 4 | ¿Cuándo se purgan los huérfanos? | **Purga a los 5 días; notificación al día 4** para darle al usuario la oportunidad de guardarlos en su dispositivo. → CH-14 (§4.5). |
| 5 | ¿Pie de hoja "SUMA" o "SUMAS IGUALES"? | **SUMAS IGUALES**, con comentario en código: queda pendiente de futuros cambios según la práctica contable real. → CH-15. |
| 6 | ¿1 anexo o lista `anexos[]`? | **Lista desde el día 1** (para posible reuso futuro). → CH-16. |

## 8. Análisis previo a la implementación (bloqueante para las Fases 2 y 4)

El usuario pidió NO empezar hasta analizar la recompresión agresiva (CH-13).
Este es el análisis y el experimento acordado:

### 8.1 Principio: la resolución del original es materia prima

La escalera no debe ser fija: un original de 12 MP (foto de cámara) aguanta
mucho más downscale que un escaneo de 900 px de ancho. La escalera adáptiva
propuesta:

```
resolución del original (largo del lado menor de la imagen fuente):
   ≥ 2500 px (foto de cámara típica) → escalera A: agresiva
   <  2500 px (escaneo ya pequeño)   → escalera B: conservadora (protege legibilidad)
```

| Escalera A (origen ≥ 2500 px) | Escalera B (origen < 2500 px) |
|--------------------------------|--------------------------------|
| P1: 1600 px · WebP .72 | P1: original · WebP .72 (sin downscale si ya ≤ 1600) |
| P2: si > 150 KB → 1200 px · .60 | P2: si > 150 KB → −20% calidad (.55) SIN bajar px |
| P3: si > 150 KB → 900 px · .45 + grayscale | P3: si > 150 KB → grayscale (sin bajar px) |
| P4: si > 300 KB → búsqueda binaria .40→.28 | P4: si > 300 KB → búsqueda binaria .50→.30 |
| Resultado: SIEMPRE se guarda algo ≤ 300 KB (capado, CH-9). NADA se rechaza. | idem |

Límite de seguridad en la escalera B: jamás bajar de ~700 px de largo ni
calidad < .30 — el objetivo es que se puedan leer el monto en número, el número
de cheque y las fechas (es lo que manda una auditoría/cotejo real).

### 8.2 Experimento de legibilidad (gate antes de codificar la pipeline)

1. Capturar 5 fotos REALES de cheques de distintos bancos/tamaños y resoluciones
   (con las mismas herramientas que use el contador) + 2 escaneos chicos.
2. Correr la escalera A y la B sobre cada muestra; guardar el resultado.
3. Checklist de legibilidad por cada proceso (4 puntos):
   - ¿Se lee el MONTO en números Y en letra? (lo más importante)
   - ¿Se lee el número de cheque?
   - ¿Se leen el banco y la fecha?
   - ¿Las firmas/manuscritos siguen distinguibles?
4. Gate: si P3/P4 de la escalera A pierde legibilidad en ≥ 1 de las 5 muestras,
   la escalera A se endurece (mantener 1000 px mínimos) o el objetivo pasa de
   150 KB a 200 KB (presupuesto local lo permite: eran 3 MB/mes).
5. El resultado del experimento se ANOTA en el registro de ejecución (§10) y
   congelar los parámetros finales de la escalera ANTES de la Fase 4.

### 8.3 Cobertura de WebP por plataforma (riesgo conocido, medible)

- `canvas.toBlob('image/webp')`: Chrome/Edge/Electron/WebView Android → OK.
- Safari legacy (<17) → NO: fallback JPEG (pesa ~30% más; el objetivo por
  plataforma se ajusta: 150 KB webp ⇔ ~200 KB jpeg, mismo contenido visual).
- El `mime` queda en el metadato del anexo (ya está en el modelo, CH-6).

## 9. Fases de implementación

### Fase 1 — Tipos + helpers puros (sin UI)
- [x] `types.ts`: `TipoPoliza` + `ChequeDatos`/`ChequeAnexo`; `Poliza.cheque?` incluido en el contenido estable de pólizas (huella de sync K-11).
- [x] `lib/accounting.ts`: `formatPolizaFolio`/`nextPolizaFolio`/`asignarFoliosPendientes` con `CHE`.
- [x] `lib/satExport.ts`: `TIPO_POLIZA_SAT` (cheque→'2') + test de XML PL con póliza de cheque.
- [x] `lib/unionBovedas.test.ts`: caso tipo `cheque` (folios, colisiones F-2, contenido estable).
- [x] `lib/accounting.test.ts`: folios CHE por cliente + "PENDIENTE" con folio 0.

### Fase 2 — Modal rework (UI)
- [x] `PolizaForm.tsx`: control FORMATO ▾ (ingresos/egresos/diario/cheque) + entrada clásica; default papel; tipo congelado al editar; grid mobile apilado; `contasis_hoja_papel`.
- [x] Formulario cheque: datos del cheque + UI de anexo (picker → pipeline WebP CH-9) — sin la persistencia real todavía (por props/callback).
- [x] `PolizaFilter`/`PolizaCard`: chip + distintivo CHE + folio.
- [x] `PolizaForm.test.tsx`: modos, tipo congelado, validación en hoja cheque (≥2 partidas, sumas).
- [x] `AsignarFoliosPendientesModal`: sin cambios esperados, test de folio CHE pendiente.

### Fase 3 — Hoja de cheque impresa
- [x] `PolizaSheet.tsx` (o `HojaCheque`): título "PÓLIZA DE CHEQUE", zona superior en blanco (CH-5), cuadro "CONCEPTO DEL PAGO" + "FIRMA (CHEQUE) RECIBIDO", datos del cheque (`numero`/banco/beneficiario) + Nº de póliza; renglones por parámetro (ya existe).
- [x] Pie "SUMAS IGUALES" (CH-15) **con comentario en código**: la leyenda queda PENDIENTE de futuros cambios según la práctica contable real del contador.
- [x] `PolizaPrintModal.tsx`: ruta de impresión para cheques.
- [x] `DiarioPrintModal.tsx`: los cheques entran al diario por fecha (los 3 formatos); en "hoja por póliza" el cheque imprime su hoja propia.
- [x] Tests/print smoke (JSDOM: presencia de zonas/título; los tests del diario ya cubren la integración de formatos).

### Fase 4 — attachmentService + backends (deployment tras el gate de §8.2)
- [x] `services/attachmentService.ts`: save/load/delete por (empresaId, sha) + dedupe CH-10.
- [x] Escalera de compresión adaptativa (CH-13) con los parámetros CONGELADOS por el experimento §8.2; capado como último recurso (CH-9, nunca rechaza).
- [x] `listarHuerfanos(empresaId)` + banner día 4 con [Guardar en mi dispositivo]/[Descartar]/[Ver] + purga día 5 en el boot (CH-14, §4.5).
- [x] Backends: IndexedDB (web) / Filesystem (Android) / IPC `attachments/` (Electron).
- [x] `deletePoliza` borra en cascada el anexo si pierde la última referencia; `useBackup` CH-12 (metadatos sí, imágenes no) + nota en UI de respaldo.
- [x] Tests del servicio (IndexedDB mock de jsdom o backend in-memory), dedupe, escalera (fixtures de imágenes del experimento), aviso/purga y cascada.

### Fase 5 — Gates + documentación
- [x] `npm run lint && npm run test` verde; escaneo anti-CJK.
- [x] `ARCHITECTURE.md` (attachmentService, claves del anexo, flujo del anexo, hoja de cheque) + `README.md` si la UI afecta al usuario final.
- [x] Registro de ejecución de este plan (§10).

## 10. Registro de ejecución

| Fase | Estado | Fecha | Notas |
|------|--------|-------|-------|
| — | ⏳ En planeación (v2) | 2026-10-21 | Decisiones del usuario incorporadas (CH-1..CH-16). PENDIENTE: gate del experimento de legibilidad §8.2 antes de Fases 2 y 4; parámetros de la escalera se congelan con su resultado. |
| 1 | ✅ COMPLETADA | 2026-10-23 | `tipo: 'cheque'` + `ChequeDatos`/`ChequeAnexo` en `types.ts` (CH-1/CH-4/CH-6/CH-16); `Poliza.cheque` entra al `contenidoEstable` de `unionBovedas.ts` (F-3/K-11). Prefijo `CHE` en `accounting.ts`/`FusionBovedaModal`; `TIPO_POLIZA_SAT.cheque='2'` (CH-2) y proyección legacy `flattenPolizasToJournalEntries` proyecta cheque→egreso por el mismo criterio. Maps exhaustivos de UI completados para compile-clean (PolizaCard/JournalView/PolizaSheet/AsignarFoliosPendientesModal/PolizaView + chip "Cheques" en `PolizaFilter`). 10 tests nuevos (folios CHE, XML cheque→2, fusión con cheques: entrante con metadatos intactos, colisión→pendiente, metadato `cheque` como EDICIÓN F-3). Gate limpio: lint ✓ · 326 tests ✓ · build ✓ · anti-CJK limpio. |
| — | 🧪 Herramienta del experimento §8.2 LISTA | 2026-10-23 | `herramientas/experimento_escalera.html`: página 100% local (sin build ni red) que corre las escaleras A y B sobre cada muestra, reporta KB por pasada, ofrece el checklist de 4 puntos y genera el reporte Markdown para §10. Falta: que el usuario la abra, cargue sus 5 fotos + 2 escaneos, marque la legibilidad y así se congelan los parámetros para las Fases 2 y 4. |
| — | ✅ EXPERIMENTO §8.2 EJECUTADO — **GATE SUPERADO** | 2026-10-23 | 5 muestras reales (captura/WhatsApp/webp) + 1 imagen generada de control. **TODAS 4/4 legibles en AMBAS escaleras** (confirmado por el usuario de viva voz: "todos los archivos se ven muy bien en ambos tipos de compresión"). Tamaños finales ≤ 97 KB (objetivo 150 KB cómodo). La imagen generada salió 0/4 por diseño (no contiene datos de cheque: control negativo, se excluye). **PARÁMETROS CONGELADOS** tal cual §8.1 sin endurecer: umbral ≥2500 px → escalera A, <2500 → escalera B; objetivo 150 KB; cap 300 KB con guardado CAPADO (nunca rechaza, CH-9); P4 solo como último recurso. Nota honesta: todas las muestras tuvieron lado menor < 2500 px, así que P3 (grises) y P4 (búsqueda binaria) no quedaron ejercitadas por el experimento — quedan como red de seguridad tal como están escritas. **Fases 2 y 4 DESBLOQUEADAS.** |
| 2 | ✅ COMPLETADA | 2026-10-23 | Rework del modal (CH-8): control FORMATO ▾ con las 4 hojas (select único `aria-label="Formato de la póliza"` que ES el tipo) + enlaces alternos "usar captura clásica (campos)" / "usar captura en papel (hoja)"; Última hoja usada persistida en `contasis_hoja_papel` (default Diario). Default del modal = 'papel' en PolizaView (CH-7). Datos del cheque (CH-4: Número/Banco/Beneficiario — `numero` es el folio bancario) visibles SOLO con tipo 'cheque', en ambos modos; al editar se prellenan y se PRESERVAN los `anexos` previos. UI del anexo (CH-6): picker `image/*` + preview local (objectURL revocado al quitar/desmontar); el binario NO se persiste — la Fase 4 lo recibe vía prop `onAnexoPendiente`. Hoja papel reconstruida como **grid responsive** (encabezado de columnas solo desktop, celdas apiladas en móvil) — un solo DOM, sin duplicar aria-labels. PolizaCard: línea "Cheque Nº … · Banco · Beneficiario". D-8 respetado: tipo/hoja congelados al editar. El toggle antiguo CAPTURA [Clásica|Papel] queda RETIRADO. 8 tests nuevos (hoja recordada, persistence, FORMATO↔tipo, cheque en clásica viaja al input, prefill en edición, diario sin cheque) + test CHE-0001 pendiente. Gate limpio: lint ✓ · 334 tests ✓ · build ✓ · anti-CJK limpio. |
| — | 🧭 DECISIÓN DE VISTA (usuario, 2026-10-23) | 2026-10-23 | Reporte del usuario con capturas: en el compilado de pólizas el cheque "no se muestra" y la imagen anexa tampoco. Verificado: el código de Fase 2 SÍ lista cheques (filtro/conteo/PolizaCard) — las capturas corresponden al build instalado anterior (recargar PWA). El anexo de imagen requiere Fase 4 (binario local). Alcance decidido por el usuario: (1) SEGUIR EL ORDEN del plan (Fase 3 → 4): la imagen en tarjeta llega con attachmentService como miniatura COMPACTA (~64 px, clic abre grande); (2) impresión del diario con **toggle "Incluir cheques"** (cada cheque además tiene su impresión individual con imagen cuando exista el anexo). |
| 4 | ✅ COMPLETADA | 2026-10-23 | **`services/attachmentService.ts`** (owner anti-R1 del binario): escalera CONGELADA §8.2 codificada tal cual (A: 1600/.72→1200/.60→900/.45+grises; B: sin downscale escalero → .55 → grises; P4 binaria .40→.28 / .50→.30 de calidad, mismos px; objetivo 150 KB; CAP 300 KB — se guarda CAPADO, NUNCA rechaza; fallback JPEG sin encoder WebP; guard anti-stub con tiempos límite para entornos sin el pipeline real). Registro de metadatos por cliente `contasis_anexos_<empresaId>` (C-2), binario 100% local: **IndexedDB `contasis_anexos`** (web) / `Directory.Data` `anexo_<empresaId>_<sha>.<ext>` (Android) / **IPC `save-attachment`/`load-attachment`/`delete-attachment` en `userData/attachments/`** (Electron, main+preload+tipos globales). Después el flujo: PolizaForm `onAnexoPendiente` → PolizaView procesa al GUARDAR (escalera → sha → metadato → `Poliza.cheque.anexos`); si el alta falla queda HUÉRFANO → ciclo CH-14: purge del día 5 al montar el módulo + banner del día 4 con [Guardar en mi dispositivo]/[Ver]/[Descartar ya] (rescate via `descargarAnexo`: a.download web / Filesystem Cache + Share nativo). PolizaCard: miniatura compacta (~64 px, lightbox) con placeholder **"solo en su equipo"** si este dispositivo no tiene el binario (CH-11). Cascada al eliminar póliza en App (solo si pierde la ÚLTIMA referencia). Nota CH-12 en el pie de respaldo (title): metadatos sí, imágenes no. 20 tests nuevos (16 del servicio + 4 de tarjeta). Gate limpio: lint ✓ · **366 tests** ✓ (31 archivos) · build ✓ · anti-CJK limpio. |
| 3 | ✅ COMPLETADA | 2026-10-23 | `PolizaSheet.tsx`: nueva hoja **`PolizaChequeSheet`** — título sello "Póliza de Cheque", zona de calcado EN BLANCO ~16rem (CH-5, la imagen anexa NUNCA se imprime ahí), datos del cheque + Fecha + Nº de Póliza (CHE- de su serie), tabla de partidas con relleno hasta 10 y pie "SUMAS IGUALES" con **comentario CH-15 en código** (pendiente de la práctica contable real del contador), cuadros "Concepto del pago" + "Firma (cheque) recibido" en blanco para firma a mano. Despachador **`HojaPolizaImprimible`**: cheque→hoja propia, resto→hoja clásica; usado por `PolizaPrintModal` (impresión individual) y el diario (formato "Hoja por póliza"). `DiarioPrintModal`: en los 3 formatos el entrar/salir del cheque lo controla el **toggle "Incluir cheques"** (checkbox persistido en `contasis_diario_cheques`, default ON — no se oculta nada); con OFF el cheque sale del libro COMPLETO (hojas, consolidado diario, libro continuo y sumas) y el panel avisa "N cheque(s) excluido(s)"; período que SOLO tenga cheques excluidos muestra mensaje propio. 12 tests nuevos (hoja cheque: título/zona/datos/sumas/relleno; despacho por tipo; ruta individual; diario: hoja propia incluida, toggle OFF excluye de los 3 formatos con sumas correctas, folio CHE en continuo). Gate limpio: lint ✓ · **346 tests** ✓ (29 archivos) · build ✓ · anti-CJK limpio. |
| 5 | ✅ COMPLETADA — **PLAN CERRADO** | 2026-10-23 | Documentación final: `ARCHITECTURE.md` — `attachmentService.ts` en el árbol de servicios (owner anti-R1), 3 filas nuevas en la tabla de claves (`contasis_anexos_<empresaId>`, binario por backend IndexedDB/`Directory.Data`/`userData/attachments/`, `contasis_diario_cheques`), bullet completo del flujo del anexo (guardar → metadato CH-16 → huérfanos CH-14 → miniatura/lightbox/placeholder CH-11 → cascada → nota SAT CH-2), fila en la tabla "archivo a tocar" y pruebas listadas en §Tests. `README.md` (cara al usuario): póliza de CHEQUE en la intro y en "Crear una póliza" (folio CHE + datos del cheque + imagen con compresión automática), nueva sub-sección "Póliza de Cheque (con imagen del cheque)" — miniatura en tarjeta, imagen SOLO local, aviso de limpieza 5 días, hoja para calcado —, chips con Cheques, toggle "Incluir cheques" del diario, nota de que la bóveda/respaldos NO llevan imágenes (solo metadatos) y clave `contasis_anexos_<id>` en persistencia. Gate final limpio: lint ✓ · **366 tests** ✓ (31 archivos) · build ✓ · anti-CJK limpio (código + los 3 docs). El plan queda COMPLETADO: Fases 1–5 sin pendientes. |
| — | 🐞 FIX post-cierre: "no se ve el cheque anexo" | 2026-10-23 | Reporte del usuario con captura (CHE-0001 sin miniatura ni línea del cheque). Causa raíz: **carrera de estado** — `PolizaForm` avisaba el archivo vía `onAnexoPendiente` (un `useState` de `PolizaView`) e inmediatamente llamaba `onSave` en el MISMO evento; React entrega el estado al render SIGUIENTE, así que `handleSavePoliza` guardaba con `anexoPendiente === null` y el anexo NUNCA se procesaba. Fix: el archivo viaja como **2º argumento SÍNCRONO de `onSave`** (tipado actualizado) y la prop `onAnexoPendiente` se retiró. 4 tests nuevos de regresión: 2 en `PolizaForm` (el archivo LLEGA a onSave / no viaja si se abandona el tipo cheque) y 2 en `PolizaView.test.tsx` NUEVO (metadato entra a `Poliza.cheque.anexos` + binario recuperable por `cargarAnexo`; guardado sin imagen limpio y sin modal de error). Nota para el usuario: la póliza CHE-0001 creada con el bug NO trae anexo — EDITARLA y volver a adjuntar la imagen (la edición PRESERVA anexos y añade el nuevo), tras cargar la build nueva. Gate: lint ✓ · **370 tests** ✓ (32 archivos) · build ✓ · anti-CJK limpio. |
| — | 🐞 FIX post-cierre: lightbox de la miniatura recortado y sin scroll | 2026-10-23 | Segundo reporte con captura: el clic en la miniatura sí abría la imagen grande pero RECORTADA al área de la tarjeta, sin scroll y sin salida usable. Causa raíz: el overlay `position: fixed` del lightbox vivía DENTRO del árbol de la tarjeta, cuyo contenedor `motion` aplica transformes — un `fixed` dentro de un ancestro transformado se ancla al ancestro, no al viewport, y hereda sus límites/`overflow`. Fix: nuevo componente **`polizas/VisorImagen.tsx`** que se renderiza vía **PORTAL a `document.body`** (a nivel de página el `fixed` ES el viewport completo): overlay `z-[160]` con SOLO la imagen centrada fit `max-h-[90vh]`; se cierra con clic en CUALQUIER parte (la imagen o fuera de ella) o tecla **Escape**; mientras está abierto bloquea el scroll del fondo y lo restaura al cerrar. Usado por la miniatura de `PolizaCard` y por el [Ver] del banner de huérfanos en `PolizaView`. Test nuevo en `PolizaCard.test.tsx` (el diálogo es un portal del body, Escape cierra, el scroll del fondo se restaura). Gate: lint ✓ · **371 tests** ✓ (32 archivos) · build ✓ · anti-CJK limpio. |
| — | 🗒️ PENDIENTE FUERA DEL PLAN (práctica contable) | 2026-10-23 | El comentario CH-15 (régimen de las partidas en el pie "SUMAS IGUALES" de la hoja de cheque) queda tal como está codificado hasta que el contador confirme la práctica real impresa; cambiar solo el texto en `PolizaChequeSheet`. Recordatorio del usuario: verificar en vivo con la PWA recargada (build viejo daba capturas engañosas): miniatura del anexo en tarjeta, banner de huérfanos y toggle del diario. |
