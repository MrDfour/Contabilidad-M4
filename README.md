# Contabilidad M4 Pro

Sistema de gestión contable profesional para empresas y estudiantes de contabilidad. Permite registrar asientos en el **Libro Diario**, generar **Cuentas T** automáticamente, obtener el **Balance General** y el **Estado de Resultados** (método analítico), todo con exportación a Excel y PDF.

> Versión actual: **v0.2.0** · Autor: Fernando Martinez · Licencia: Apache-2.0

---

## Índice

1. [Capturas de pantalla](#capturas-de-pantalla)
2. [Instalación desde el paquete publicado](#instalación-desde-el-paquete-publicado)
3. [Funcionalidades](#funcionalidades)
   - [Libro Diario](#1-libro-diario)
   - [Cuentas T](#2-cuentas-t)
   - [Balance General](#3-balance-general)
   - [Estado de Resultados](#4-estado-de-resultados)
   - [Catálogo de Cuentas](#5-catálogo-de-cuentas)
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

### 1. Libro Diario

El Libro Diario es el módulo central de la aplicación. Aquí se registran todos los movimientos contables de la empresa.

#### Múltiples diarios
- Puedes crear **varios libros de diario** independientes (útil para distintos períodos o empresas).
- Cada diario tiene un nombre editable. Por defecto se crea uno llamado "Diario Inicial".
- Los diarios se muestran como pestañas horizontales; puedes cambiar el activo con un clic.
- Para renombrar un diario, haz clic en el ícono de lápiz junto al nombre.
- Para eliminar un diario (solo si hay más de uno), haz clic en el ícono de papelera.

#### Nuevo asiento contable
1. Haz clic en **"Nuevo Asiento"** (botón azul, esquina superior derecha del módulo).
2. Completa los campos:
   - **Fecha del Asiento** – fecha del movimiento.
   - **Concepto / Glosa** – descripción breve de la operación.
   - **Movimientos** – cada fila representa una cuenta con su tipo (Debe/Haber) y monto.
3. Agrega tantos movimientos como sea necesario con el botón **"+ Movimiento"**.
4. La partida doble se valida en tiempo real: el total del Debe debe ser igual al total del Haber. El botón "Guardar" se habilita solo cuando el asiento está cuadrado.
5. Haz clic en **"Guardar Asiento"** para registrarlo.

#### Editar un asiento
- Haz clic en el ícono de lápiz (✏️) del asiento que deseas modificar.
- El formulario se precarga con los datos actuales; realiza los cambios y guarda.

#### Eliminar un asiento
- Haz clic en el ícono de papelera (🗑️); aparecerá una ventana de confirmación antes de eliminar.

#### Reordenar asientos
- Usa los botones de flecha (▲ / ▼) disponibles en escritorio para cambiar el orden de los asientos dentro del diario.

#### Importar asientos desde Excel
1. Descarga primero la **Plantilla** (botón verde "Plantilla") para conocer el formato requerido.
2. Rellena el archivo con tus asientos. Las columnas son:

   | Columna       | Descripción                                              |
   |---------------|----------------------------------------------------------|
   | `ASIENTO_ID`  | Número de asiento (agrupa las filas del mismo asiento)   |
   | `FECHA`       | Fecha en formato `YYYY-MM-DD`                            |
   | `GLOSA`       | Concepto / descripción del asiento                       |
   | `CUENTA`      | Nombre exacto de la cuenta (según el catálogo integrado) |
   | `DEBE`        | Monto en el Debe (0 si no aplica)                        |
   | `HABER`       | Monto en el Haber (0 si no aplica)                       |

3. Haz clic en **"Importar"** y selecciona tu archivo `.xlsx`.
4. La aplicación agrupa las filas por `ASIENTO_ID`, valida que las cuentas existan en el catálogo y agrega los asientos al diario activo.
5. Si alguna cuenta no se reconoce, aparecerá un mensaje indicando qué nombres no coincidieron.

#### Exportar el Libro Diario
- **Excel** → genera un archivo `.xlsx` con todos los movimientos del diario activo (columnas: ID, Fecha, Glosa, Cuenta, Código, Debe, Haber).
- **PDF** → genera un PDF con cabecera de empresa, tabla de movimientos y pie de página con sección de firmas.

---

### 2. Cuentas T

Las Cuentas T se calculan automáticamente a partir de los asientos registrados en el diario activo; no requieren entrada manual.

- Cada cuenta usada en al menos un asiento se muestra como una "T" clásica con:
  - **Columna izquierda (Debe):** movimientos con número de referencia de asiento.
  - **Columna derecha (Haber):** movimientos con número de referencia de asiento.
  - **Fila de totales:** suma del Debe y suma del Haber.
  - **Saldo:** el saldo normal de la cuenta (deudor o acreedor) resaltado.
- **Exportar a Excel** → genera un archivo `.xlsx` con las cuentas T dibujadas en formato tabular (4 cuentas por fila), incluyendo totales y saldo final.
- **Exportar a PDF** → genera un PDF con todas las cuentas T en formato visual.

---

### 3. Balance General

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

### 4. Estado de Resultados

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

> El **Inventario Final** debe ingresarse manualmente en el campo correspondiente; su valor se guarda automáticamente por diario.

Exportación:
- **PDF** → Estado de resultados completo con encabezado, desglose y firmas.
- **Excel** → Tabla con todos los conceptos y montos.

---

### 5. Catálogo de Cuentas

La aplicación incluye un catálogo preconfigurado de cuentas contables en español, organizado por tipo:

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

> Al importar asientos desde Excel, los nombres de cuenta deben coincidir exactamente con los de esta tabla (mayúsculas/minúsculas se ignoran, pero los tildes sí importan).

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
│   ├── App.tsx          # Componente principal y toda la lógica de la UI
│   ├── types.ts         # Tipos TypeScript y catálogo de cuentas inicial
│   ├── main.tsx         # Punto de entrada de React
│   ├── index.css        # Estilos globales
│   └── lib/
│       └── utils.ts     # Utilidades: exportación a Excel/PDF, lectura de Excel
├── index.html           # Plantilla HTML
├── vite.config.ts       # Configuración de Vite
├── tsconfig.json        # Configuración de TypeScript
└── package.json         # Dependencias y scripts
```

### Persistencia de datos

Los datos (diarios, asientos e inventario final) se almacenan en el **localStorage** del navegador/Electron bajo las claves:

- `contasis_journals` – array de diarios con sus asientos.
- `contasis_final_inventories` – mapa de `{ journalId: inventarioFinal }`.

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
| ExcelJS                  | Generación de archivos Excel con estilos         |
| jsPDF + jspdf-autotable  | Generación de documentos PDF                     |
| html2canvas-pro          | Captura de elementos HTML para PDF               |
| Motion (Framer Motion)   | Animaciones de UI                                |
| Lucide React             | Iconografía                                      |

---

© 2026 Contabilidad M4. Sistema de Gestión Contable.
