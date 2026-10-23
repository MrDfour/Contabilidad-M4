# Contabilidad M4 Pro

Contabilidad M4 Pro es una app de gestión contable para escritorio y móvil. Su captura principal son las **Pólizas Contables** (ingreso, egreso, diario y cheque, con partida doble validada), a partir de las cuales se generan automáticamente el **Libro Diario** (reporte consolidado), las **Cuentas T**, el **Balance General** y el **Estado de Resultados**. Diseñada para contadores externos, la app admite **varios Clientes**: cada cliente tiene su propio catálogo, activos fijos, inventario, pólizas y RFC para los archivos SAT.

> Versión actual: **v0.8.0** · Autor: Fernando Martinez · Licencia: Apache-2.0

---

## Índice

1. [Capturas de pantalla](#capturas-de-pantalla)
2. [Instalación desde el paquete publicado](#instalación-desde-el-paquete-publicado)
3. [Funcionalidades](#funcionalidades)
   - [Clientes (multi-cliente)](#1-clientes-multi-cliente)
   - [Pólizas Contables](#2-pólizas-contables)
   - [Libro Diario (reporte)](#3-libro-diario-reporte)
   - [Cuentas T](#4-cuentas-t)
   - [Balance General](#5-balance-general)
   - [Estado de Resultados](#6-estado-de-resultados)
   - [Catálogo de Cuentas](#7-catálogo-de-cuentas)
   - [Activos Fijos (Modo Fiscal)](#8-activos-fijos-modo-fiscal)
   - [Contabilidad Electrónica SAT (Modo Fiscal)](#9-contabilidad-electrónica-sat-modo-fiscal)
   - [Bóveda E2EE (Escritorio ↔ Móvil)](#10-sincronización-escritorio--móvil)
   - [Mejoras de productividad](#11-mejoras-de-productividad)
4. [Configuración del entorno local (desde cero)](#configuración-del-entorno-local-desde-cero)
5. [Scripts disponibles](#scripts-disponibles)
6. [Tecnologías utilizadas](#tecnologías-utilizadas)

---

## Instalación desde el paquete publicado

Descarga el instalador correspondiente a tu sistema operativo desde la [página de Releases](https://github.com/MrDfour/Contabilidad-M4/releases/latest):

| Sistema operativo | Archivo a descargar              |
|-------------------|----------------------------------|
| Windows           | `Contabilidad-M4-Pro-Setup-*.exe` (instalador NSIS) |
| macOS             | `Contabilidad-M4-Pro-*.dmg`      |
| Linux             | `Contabilidad-M4-Pro-*.AppImage` |
| Android           | `app-*.apk`                      |

### Windows
1. Descarga el `.exe` y ejecútalo.
2. El asistente te permite elegir el directorio de instalación.
3. Al finalizar, abre la aplicación desde el acceso directo creado en el escritorio o en el menú Inicio.

### macOS
1. Descarga el `.dmg` y ábrelo.
2. Arrastra `Contabilidad M4 Pro` a la carpeta `Aplicaciones`.
3. La primera vez es posible que macOS te pida confirmar la apertura (clic derecho → Abrir).

### Linux
1. Descarga el `.AppImage`.
2. Dale permiso de ejecución: `chmod +x Contabilidad-M4-Pro-*.AppImage`
3. Ejecútalo con doble clic o desde la terminal: `./Contabilidad-M4-Pro-*.AppImage`

### Android
1. Descarga el `.apk` en tu dispositivo.
2. Activa la instalación desde fuentes desconocidas en los ajustes del sistema.
3. Abre el archivo `.apk` e instálalo.

> **Nota:** Los datos se guardan localmente en el dispositivo (localStorage en escritorio/web, almacenamiento interno en Android). No se requiere conexión a internet.

---

## Funcionalidades

### 1. Clientes (multi-cliente)

Los contadores que atienden **varias empresas** alternan entre clientes desde el botón del encabezado (muestra el nombre del cliente activo). Todo lo que ves y capturas en la app pertenece **siempre al cliente activo**:

- Cada cliente tiene su propio **catálogo de cuentas, activos fijos, inventario final, pólizas y RFC**.
- Los **folios de póliza son consecutivos por tipo dentro de cada cliente** (el ING 1 de un cliente no interfiere con el de otro).
- El botón **"Clientes"** abre el gestor donde puedes:
  - **Cambiar de cliente** (botón "Usar"): la contabilidad del otro cliente se carga al instante.
  - **Agregar un cliente** nuevo (arranca con catálogo base readonly).
  - **Editar nombre y RFC** del cliente (el RFC se usa para los XML SAT y la DIOT).
  - **Eliminar un cliente** (con confirmación; siempre debe existir al menos uno).
- Los **respaldos incluyen a todos tus clientes**; al restaurar un respaldo viejo de versión anterior, sus datos se aplican al **cliente activo**.

### 2. Pólizas Contables

Las **Pólizas Contables** son la unidad de captura principal de la aplicación (pestaña por defecto). Cada póliza es un asiento formal con partida doble validada, tipo de póliza SAT y folio consecutivo por tipo dentro del cliente activo.

#### Crear una póliza
1. Haz clic en **"Nueva Póliza"** (esquina superior derecha del módulo).
2. Completa los campos:
   - **Formato** – elige la hoja: Ingreso (1), Egreso (2), Diario (3) o **Cheque** según el Anexo 24 del SAT (el cheque se exporta a SAT como egreso, tipo 2). El folio se asigna automáticamente y es **consecutivo por tipo** (ING 1, 2, 3… / EGR 1, 2, 3… / DIA 1, 2, 3… / CHE 1, 2, 3…). La captura abre en **formato papel** (hoja printable); el enlace "usar captura clásica (campos)" cambia al modo de columnas.
   - **Fecha** y **Concepto** de la operación.
   - **Partidas** – cada fila es un lado del asiento: cuenta, cargo (Debe) o abono (Haber), monto y concepto opcional.
3. La **partida doble se valida en vivo**: el guardado solo se habilita cuando las sumas del Debe y del Haber coinciden ("Sumas iguales") y hay al menos 2 partidas.
4. En **Modo Fiscal** cada partida admite **CFDI**: UUID leído directo de un XML (botón "Leer CFDI") y RFC del tercero, usados por el XML SAT de Pólizas y la DIOT.

#### Póliza de Cheque (con imagen del cheque)

Además del asiento contable, la póliza de cheque lleva sus **datos propios**: Nº de cheque (el folio bancario, distinto del folio contable CHE), Banco y Beneficiario.

- **Imagen del cheque**: puedes adjuntar una foto/escaneo al crear la póliza; la app la comprime automáticamente para que pese poco (objetivo ~150 KB) sin perder legibilidad. La imagen se ve como **miniatura en la tarjeta** (clic la agranda).
- **La imagen vive solo en tu equipo**: no viaja por la sincronización ni en los respaldos (esos llevan sus datos: peso, fecha y huella). En otro dispositivo verás el aviso *"solo en su equipo"* en lugar de la foto.
- **Limpieza automática**: si guardaste una imagen y la póliza no llegó a crearse, la app te avisa durante un día para que la rescates (descargarla a tu dispositivo) o la descartes; al quinto día se borra sola.
- **Impresión**: el botón Imprimir saca la **hoja de póliza de cheque** con espacio en blanco para calcar la imagen a mano, los datos del cheque y una línea de firma de recibido. Opcionalmente, la casilla **"Con imagen del cheque"** (default apagada) imprime la imagen anexa DENTRO de la zona de calcado en lugar del blanco — útil como comprobante de la imagen digital; si el equipo no tiene la imagen, la zona simplemente queda en blanco. La preferencia se comparte entre el diario ("Hoja por póliza") y la impresión individual.

#### Filtrado y búsqueda
- Chips **Todas / Ingresos / Egresos / Diario / Cheques** con conteo por tipo.
- Buscador por folio numérico o concepto.
- Pólizas se listan con su folio formateado (ej. `ING 0005`), desglose de partidas y las sumas del Debe/Haber.

#### Editar y eliminar
- El lápiz de la tarjeta reabre el formulario precargado (el **tipo queda congelado** en edición; el folio se conserva).
- La papelera pide confirmación antes de eliminar.

#### Imprimir formato físico
- Botón "Imprimir" → hoja imprimible según el tipo (póliza de cheque con su hoja propia) con distintivo del tipo, desglose de partidas, sumas iguales y renglones de firma **Elaboró / Revisó / Autorizó**.

#### Importar desde Excel
1. Descarga la **Plantilla** para conocer el formato. Las columnas son:

   | Columna       | Descripción                                              |
   |---------------|----------------------------------------------------------|
   | `ASIENTO_ID`  | Número de asiento (agrupa las filas de la misma póliza)  |
   | `FECHA`       | Fecha en formato `YYYY-MM-DD`                            |
   | `GLOSA`       | Concepto / descripción de la póliza                      |
   | `CUENTA`      | Nombre exacto de la cuenta (según el catálogo integrado) |
   | `DEBE`        | Monto en el Debe (0 si no aplica)                        |
   | `HABER`       | Monto en el Haber (0 si no aplica)                       |

2. Haz clic en **"Importar"** y selecciona tu archivo `.xlsx`.
3. La app agrupa las filas por `ASIENTO_ID` y crea pólizas de tipo **Diario** con folios nuevos; si alguna cuenta no se reconoce, aparece un mensaje indicando los nombres que no coincidieron.

---

### 3. Libro Diario (reporte)

El Libro Diario ya no captura movimientos: es un **reporte consolidado de solo lectura** que refleja todas las pólizas ordenadas cronológicamente (fecha + folio).

- Tabla clarina **FECHA / FOLIO / TIPO / CUENTA / CONCEPTO / DEBE / HABER**, con las sumas iguales al final.
- **Toggle "Incluir cheques"**: decide si las pólizas de cheque entran al libro impreso completo (encendido por defecto). Con él apagado, el aviso te dice cuántos cheques se excluyeron.
- Exportación a **Excel** y **PDF** (`Libro_Diario_Consolidado`) con cabecera y firmas.
- Todas las capturas (manual, importación, cierre y depreciación de activos) son automáticas desde Pólizas.

---

### 4. Cuentas T

Las Cuentas T se calculan automáticamente a partir de la **proyección consolidada de las pólizas** (ordenadas fecha + folio); no requieren entrada manual.

- Cada cuenta usada en al menos una póliza se muestra como una "T" clásica con:
  - **Columna izquierda (Debe):** movimientos con número de referencia (posición en la proyección consolidada, 1-index).
  - **Columna derecha (Haber):** movimientos con número de referencia.
  - **Fila de totales:** suma del Debe y suma del Haber.
  - **Saldo:** el saldo normal de la cuenta (deudor o acreedor) resaltado.
- **Exportar a Excel** → genera un archivo `.xlsx` con las cuentas T dibujadas en formato tabular (4 cuentas por fila), incluyendo totales y saldo final.
- **Exportar a PDF** → genera un PDF con todas las cuentas T en formato visual.

---

### 5. Balance General

El Balance General se genera automáticamente a partir de los saldos calculados por las Cuentas T.

Estructura:
- **Activo** – Activo Circulante y Activo No Circulante.
- **Pasivo** – Pasivo a Corto Plazo y Pasivo a Largo Plazo.
- **Capital Contable** – Capital Social, reservas y resultados.

Solo aparecen las cuentas con saldo distinto de cero. Se verifican automáticamente:
- Total Activo = Total Pasivo + Capital.

Exportación:
- **PDF** → Balance presentado en columnas (Activo | Pasivo + Capital), con encabezado y firmas.
- **Excel** → Datos en formato tabular.

---

### 6. Estado de Resultados

Presenta el resultado del ejercicio usando el **Método Analítico** (desglosado).

Secciones calculadas automáticamente:
1. **Ingresos por Ventas**
   - Ventas Totales
   - (−) Devoluciones sobre Ventas
   - (−) Rebajas/Descuentos sobre Ventas
   - = **Ventas Netas**
2. **Costo de lo Vendido**
   - Inventario Inicial
   - (+) Compras + Gastos de Compra = Compras Totales
   - (−) Devoluciones sobre Compras
   - (−) Descuentos sobre Compras
   - = Compras Netas → Suma de Mercancías
   - (−) **Inventario Final** *(valor ingresado manualmente)*
   - = **Costo de lo Vendido**
3. **Utilidad Bruta** = Ventas Netas − Costo de lo Vendido
4. **Gastos Operativos** (Gastos de Venta, Gastos de Administración, Gastos Financieros, Otros Gastos)
5. **Utilidad / Pérdida Neta**

> El **Inventario Final** debe ingresarse manualmente en el campo correspondiente; su valor se guarda automáticamente.

Exportación:
- **PDF** → Estado de resultados completo con encabezado, desglose y firmas.
- **Excel** → Tabla con todos los conceptos y montos.

---

### 7. Catálogo de Cuentas

La aplicación incluye un catálogo preconfigurado de cuentas contables en español, organizado por tipo y con códigos contables listos para trabajar:

| Código  | Cuenta                              | Tipo      |
|---------|-------------------------------------|-----------|
| **Activo Circulante** |||
| 1101    | Caja                                | Activo    |
| 1102    | Bancos                              | Activo    |
| 1103    | Inversiones Temporales              | Activo    |
| 1104    | Almacén / Inventarios               | Activo    |
| 1105    | Clientes                            | Activo    |
| 1106    | Documentos por Cobrar               | Activo    |
| 1107    | Deudores Diversos                   | Activo    |
| 1108    | IVA Acreditable                     | Activo    |
| 1109    | IVA por Acreditar                   | Activo    |
| 1110    | Anticipo a Proveedores              | Activo    |
| **Activo No Circulante** |||
| 1201    | Terrenos                            | Activo    |
| 1202    | Edificios                           | Activo    |
| 1203    | Mobiliario y Equipo de Oficina      | Activo    |
| 1204    | Equipo de Cómputo                   | Activo    |
| 1205    | Equipo de Entrega o Reparto         | Activo    |
| 1206    | Depósitos en Garantía               | Activo    |
| 1207    | Gastos de Instalación               | Activo    |
| 1208    | Gastos de Organización              | Activo    |
| 1209    | Propaganda y Publicidad             | Activo    |
| 1210    | Primas de Seguros                   | Activo    |
| 1211    | Rentas Pagadas por Anticipado       | Activo    |
| 1212    | Intereses Pagados por Anticipado    | Activo    |
| **Pasivo a Corto Plazo** |||
| 2101    | Proveedores                         | Pasivo    |
| 2102    | Documentos por Pagar                | Pasivo    |
| 2103    | Acreedores Diversos                 | Pasivo    |
| 2104    | IVA Trasladado                      | Pasivo    |
| 2105    | IVA por Trasladar                   | Pasivo    |
| 2106    | Impuestos y Cuotas por Pagar        | Pasivo    |
| 2107    | Anticipo de Clientes                | Pasivo    |
| 2108    | Sueldos por Pagar                   | Pasivo    |
| **Pasivo a Largo Plazo** |||
| 2201    | Hipotecas por Pagar / Acreedores Hipotecarios | Pasivo |
| 2202    | Documentos por Pagar a Largo Plazo  | Pasivo    |
| 2203    | Rentas Cobradas por Anticipado      | Pasivo    |
| 2204    | Intereses Cobrados por Anticipado   | Pasivo    |
| **Capital Contable** |||
| 3101    | Capital Social                      | Capital   |
| 3102    | Reserva Legal                       | Capital   |
| 3103    | Utilidad del Ejercicio              | Capital   |
| 3104    | Pérdida del Ejercicio               | Capital   |
| 3105    | Utilidades Acumuladas / Retenidas   | Capital   |
| 3106    | Pérdidas Acumuladas                 | Capital   |
| **Ingresos** |||
| 4101    | Ventas                              | Ingreso   |
| 4102    | Devoluciones sobre Ventas           | Ingreso   |
| 4103    | Descuentos sobre Ventas             | Ingreso   |
| 4104    | Productos Financieros               | Ingreso   |
| 4105    | Otros Productos                     | Ingreso   |
| **Costos y Gastos** |||
| 5101    | Compras                             | Gasto     |
| 5102    | Gastos de Compra                    | Gasto     |
| 5103    | Devoluciones sobre Compras          | Gasto     |
| 5104    | Descuentos sobre Compras            | Gasto     |
| 5105    | Inventario Inicial                  | Gasto     |
| 5106    | Inventario Final                    | Gasto     |
| 5107    | Costo de Ventas                     | Gasto     |
| 5108    | Gastos de Venta                     | Gasto     |
| 5109    | Gastos de Administración            | Gasto     |
| 5110    | Gastos Financieros                  | Gasto     |
| 5111    | Otros Gastos                        | Gasto     |

> Al importar asientos desde Excel, los nombres de cuenta deben coincidir con los del catálogo (mayúsculas/minúsculas se ignoran, pero conviene mantener tildes y nombres tal como aparecen para evitar rechazos).

---

### 8. Activos Fijos (Modo Fiscal)

Cuando activas el **Modo Fiscal**, aparece el módulo de Activos Fijos para llevar mejor el control de inversiones:

- Registro de activos con **nombre, fecha de adquisición, MOI y tasa fiscal anual**.
- Marcado de activos **en operación** o **dados de baja**.
- Ejecución de **depreciación mensual** con generación automática de una **póliza de Diario** (cargo a gasto y abono a depreciación acumulada).
- Cálculo fiscal de **deducción de inversiones actualizada por INPC** para apoyo en análisis fiscal.

---

### 9. Contabilidad Electrónica SAT (Modo Fiscal)

El módulo de **Contabilidad Electrónica** facilita entregables fiscales del Anexo 24:

- Generación de **Catálogo SAT (CT.xml)**, **Balanza (BN.xml)** y **Pólizas del Periodo (PL.xml)**.
- **RFC por cliente:** el campo del RFC se precarga con el RFC del cliente activo y, tras exportar, queda guardado en el cliente para las siguientes entregas.
- El XML de Pólizas se construye directamente desde tus pólizas del periodo: **folio real en `NumUnIdenPol`**, tipo SAT (1/2/3), concepto por partida y soporte de CompNal por CFDI.
- Generación de **DIOT (.txt)** con base en movimientos de IVA acreditable por RFC.
- Validación básica de formato de RFC y nomenclatura de archivos para descarga.

---

### 10. Sincronización Escritorio ↔ Móvil (bóveda E2EE)

La app sincroniza datos entre dispositivos con una **bóveda personal end-to-end** sobre relay propio en Cloudflare (plan ejecutado en v0.9.0, retirado del repo; detalle vivo en `ARCHITECTURE.md` §6):

- **Relay propio en Cloudflare Workers + KV** (sin costo en el plan gratuito) con WebSocket en vivo y degradación a sondeo.
- **Cifrado extremo a extremo (AES-GCM 256)**: el relay solo ve blobs ilegibles; las claves nacen en tu dispositivo.
- **Alistamiento**: el escritorio crea la bóveda y comparte la credencial con la app móvil mediante **QR** (data GET) o **frase mnemónica determinista de 6 palabras** (la frase genera la misma bóveda en cualquier dispositivo; guárdala EN PAPEL).
- **Auto-sync completo multi-cliente**: la bóveda transporta un respaldo v3 de TODAS las empresas; restaurar remoto reusa exactamente el camino de "Restaurar respaldo". **Las imágenes de cheques NO viajan** (el respaldo/bóveda lleva sus metadatos: peso, fecha y huella; la foto vive solo en el equipo original).
- **Debounce de publicación (1.5 s) + coalescing (120 s)** para respetar la cuota gratuita de KV; "Publicar ahora" fuerza el envío.
- **Regla de conflicto** ("manos sucias"): si solo un lado cambió, se aplica automáticamente; si ambos cambiaron, eliges **Conservar datos locales** o **Sobrescribir con datos remotos**; la versión ganadora queda vigente para todos los dispositivos.
- **Historial** (máximo 5 estados) con TTL de 30 días, consultable desde el modal como metadatos de versión, fecha y dispositivo.
- Indicador de estado en el encabezado (gris / verde / naranja / rojo).

**Despliegue del relay** (una sola vez): ver [worker/README.md](worker/README.md).

---

### 11. Mejoras de productividad

- **Verificador de actualizaciones** para avisar cuando hay una versión más reciente.
- **Feedback integrado** desde la app para reportar sugerencias o errores.
- Persistencia adaptada por plataforma:
  - Escritorio (Electron) mediante almacenamiento local del sistema.
  - Android (Capacitor) mediante filesystem interno.
  - Navegador/Web mediante localStorage.

---

## Configuración del entorno local (desde cero)

### Requisitos previos

| Herramienta | Versión mínima recomendada |
|-------------|---------------------------|
| [Node.js](https://nodejs.org/) | v18 o superior |
| npm         | v9 o superior (incluido con Node.js) |

Verifica tu instalación:

```bash
node -v
npm -v
```

### 1. Clonar el repositorio

```bash
git clone https://github.com/MrDfour/Contabilidad-M4.git
cd Contabilidad-M4
```

### 2. Instalar dependencias

```bash
npm install
```

Esto descargará todas las dependencias definidas en `package.json`, incluyendo React, Vite, Tailwind CSS, Electron, ExcelJS, jsPDF y Capacitor.

### 3. Ejecutar en modo desarrollo (navegador)

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador. La aplicación se recargará automáticamente al guardar cambios en el código.

### 4. Compilar para producción (web estática)

```bash
npm run build
```

Los archivos compilados se generan en la carpeta `dist/`. Puedes servirlos con cualquier servidor web estático.

Para previsualizar la build localmente:

```bash
npm run preview
```

### 5. Compilar la aplicación de escritorio (Electron)

```bash
npm run electron:build
```

Esto primero ejecuta `vite build` y luego `electron-builder`, generando los instaladores en la carpeta `release/`:

- Windows → `release/Contabilidad M4 Pro Setup *.exe`
- macOS → `release/Contabilidad M4 Pro-*.dmg`
- Linux → `release/Contabilidad M4 Pro-*.AppImage`

> Para compilar para un sistema operativo específico desde línea de comandos consulta la [documentación de electron-builder](https://www.electron.build/cli).

### 6. (Opcional) Verificar tipos TypeScript

```bash
npm run lint
```

Ejecuta `tsc --noEmit` para detectar errores de tipos sin generar archivos.

### Estructura del proyecto

```
Contabilidad-M4/
├── electron/
│   └── main.js          # Punto de entrada de Electron
├── src/
│   ├── App.tsx          # Orquestador principal (hooks de dominio + navegación + modales)
│   ├── types.ts         # Tipos TypeScript y catálogo de cuentas inicial
│   ├── components/      # Vistas: polizas/, account/, layout/, modales/ y reportes
│   ├── hooks/           # Dominios de estado (usePolizas, useCatalog, useBackup...)
│   ├── lib/             # Cálculo contable, formatos, migraciones, exportaciones SAT/Excel/PDF
│   ├── services/        # Persistencia (storageService) y sincronización (syncService)
│   ├── main.tsx         # Punto de entrada de React
│   └── index.css        # Estilos globales
├── vite.config.ts       # Configuración de Vite
├── tsconfig.json        # Configuración de TypeScript
└── package.json         # Dependencias y scripts
```

> Documento de arquitectura interna: ver `ARCHITECTURE.md` (mapa completo para desarrollo).

### Persistencia de datos

Los datos se almacenan localmente. Con multi-cliente, los datos de cada cliente viven en claves con **sufijo** (`contasis_<dominio>_<empresaId>`):

- `contasis_empresas` – lista de clientes y cuál está activo.
- `contasis_polizas_<id>` – pólizas del cliente (la clave sin sufijo quedó como histórico tras la migración).
- `contasis_accounts_<id>` – catálogo de cuentas del cliente (base readonly + propias).
- `contasis_final_inventories_<id>` – mapa `{ general: inventarioFinal }` del cliente.
- `contasis_fixed_assets_<id>` – activos fijos del cliente.
- `contasis_anexos_<id>` – registro de metadatos de las imágenes de cheques (peso, fecha y huella; **la imagen en sí** vive aparte en el almacenamiento local del dispositivo: IndexedDB en web, archivos internos en Android/Escritorio).
- `contasis_journals` – histórico de diarios legacy (si venías de una versión anterior; solo lectura, no se elimina desde la app).
- Claves sin sufijo (`contasis_polizas`, `contasis_accounts`, etc.) – archivo histórico de tu contabilidad previa a clientes; la migración las copió al primer cliente y no se vuelven a usar.

Para limpiar todos los datos, abre las herramientas de desarrollo (F12) → Application → Local Storage → elimina las claves mencionadas.

---

## Scripts disponibles

| Comando                  | Descripción                                                  |
|--------------------------|--------------------------------------------------------------|
| `npm run dev`            | Inicia el servidor de desarrollo en `localhost:3000`         |
| `npm run build`          | Compila la aplicación web para producción (`dist/`)          |
| `npm run preview`        | Previsualiza la build de producción localmente               |
| `npm run clean`          | Elimina la carpeta `dist/`                                   |
| `npm run lint`           | Verifica tipos TypeScript sin generar archivos               |
| `npm run test`           | Ejecuta la red de pruebas (Vitest, una pasada)               |
| `npm run test:watch`     | Modo vigilante de pruebas (se re-ejecutan al guardar)        |
| `npm run electron:build` | Compila la app de escritorio Electron para distribución      |

---

## Tecnologías utilizadas

| Librería / Herramienta   | Uso principal                                    |
|--------------------------|--------------------------------------------------|
| React 19                 | Interfaz de usuario                              |
| TypeScript               | Tipado estático                                  |
| Vite                     | Bundler y servidor de desarrollo                 |
| Tailwind CSS v4          | Estilos utilitarios                              |
| Electron                 | Aplicación de escritorio multiplataforma         |
| Capacitor                | Empaquetado para Android                         |
| QRCode.react + @capacitor-mlkit | Emparejamiento y escaneo de QR (bóveda) |
| Web Crypto (AES-GCM)     | Cifrado E2EE de la bóveda                        |
| Cloudflare Workers + KV  | Relay de sincronización (worker/)                |
| Capacitor MLKit Barcode  | Escaneo de QR en móvil                           |
| ExcelJS                  | Generación de archivos Excel con estilos         |
| jsPDF + jspdf-autotable  | Generación de documentos PDF                     |
| html2canvas-pro          | Captura de elementos HTML para PDF               |
| Motion (Framer Motion)   | Animaciones de UI                                |
| Lucide React             | Iconografía                                      |

---

© 2026 Contabilidad M4. Sistema de Gestión Contable.
