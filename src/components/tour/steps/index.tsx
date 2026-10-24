/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TourStepDef } from '../../../types/tour';

/**
 * Definición ordenada de los pasos del recorrido guiado.
 *
 * Cada paso se ancla a un elemento real del DOM:
 * - `target`: selector CSS (preferimos `data-testid`).
 * - `targetText`: respaldo por `aria-label` o texto visible.
 * Si nada resuelve, la burbuja se centra con un mensaje guía.
 *
 * Nota: los pasos marcados con `requiereFiscal` o `saltarSi` se omiten
 * dinámicamente según el modo y el estado actual de la app.
 */
export const TOUR_STEPS: TourStepDef[] = [
  {
    id: 'bienvenida',
    titulo: 'Te damos la bienvenida a Contabilidad M4 Pro',
    cuerpo: 'Este recorrido te muestra todas las funciones de la app. Avanza con los botones de la tarjeta y puedes salirte en cualquier momento con la X o la tecla Escape.',
    placement: 'center',
  },
  {
    id: 'header',
    titulo: 'Encabezado',
    cuerpo: 'Aquí ves el cliente activo (haz clic en su nombre para gestionar tus clientes), el cambio entre modo Básico y Fiscal, el tema de la interfaz y el estado de la bóveda de sincronización.',
    target: '[data-testid="app-header"]',
    placement: 'bottom',
  },
  {
    id: 'toggle-modo',
    titulo: 'Modo Básico y modo Fiscal',
    cuerpo: 'Este selector cambia las funciones disponibles. En modo Fiscal se activan Activos Fijos y la Contabilidad Electrónica del SAT, y las vistas muestran los códigos fiscales.',
    target: '[data-testid="app-modo"]',
    placement: 'bottom',
  },
  {
    id: 'sidebar',
    titulo: 'Navegación',
    cuerpo: 'Las pestañas del lado izquierdo cambian de módulo: Pólizas, Diario, Cuentas T, Balance, Resultados y Catálogo. En modo Fiscal se agregan Activos Fijos y SAT XML.',
    targetText: 'Pólizas',
    placement: 'left',
  },
  {
    id: 'polizas-lista',
    titulo: 'Pólizas contables',
    cuerpo: 'Aquí está tu lista de pólizas. Puedes filtrar por tipo (Todas, Ingresos, Egresos, Diario, Cheques) y buscar por folio o concepto. Las pólizas de cheque muestran su miniatura y, si hay imágenes sin asignar, se avisa con el banner de huérfanos.',
    targetText: 'Pólizas Contables',
    placement: 'bottom',
  },
  {
    id: 'polizas-importar',
    titulo: 'Tu Excel anterior entra aquí',
    cuerpo: '¿Vienes de COI, CONTPAQi u otro sistema? Descarga la «Plantilla» con el formato de carga, llena tu Excel y tráelo con «Importar Excel»: así migras catálogo y pólizas sin capturarlas otra vez. Los folios que falten o choquen se completan después con «Asignar pendientes», antes de exportar cualquier archivo del SAT.',
    target: '[data-testid="poliza-plantilla"]',
    placement: 'bottom',
  },
  {
    id: 'nueva-poliza',
    titulo: 'Nueva póliza',
    cuerpo: 'La captura se hace en hoja de papel; desde el menú FORMATO eliges el estilo. El botón «Nueva Póliza» abre la captura. La última hoja usada se recuerda para tus próximas capturas.',
    targetText: 'Nueva Póliza',
    placement: 'right',
  },
  {
    id: 'form-concepto',
    titulo: 'Datos generales de la póliza',
    cuerpo: 'Arriba van el concepto general, la fecha y el número de póliza (folio). El folio pertenece a tu serie contable y es independiente del número del cheque bancario.',
    target: '[data-testid="poliza-form-campo-concepto"]',
    placement: 'bottom',
    saltarSi: () => !document.querySelector('[data-testid="poliza-form"]'),
  },
  {
    id: 'form-partidas',
    titulo: 'Partidas (partida doble)',
    cuerpo: 'Selecciona una cuenta del catálogo (escribe para filtrar) y captura el importe en el Debe o en el Haber. El Debe y el Haber deben cuadrar; la hoja te lo muestra con su validación visual.',
    target: '[data-testid="poliza-form-partida-0"]',
    placement: 'right',
    saltarSi: () => !document.querySelector('[data-testid="poliza-form"]'),
  },
  {
    id: 'form-cheque',
    titulo: 'Cheque físico',
    cuerpo: 'Cambia el formato a «Póliza de Cheque» y aparecerán los campos del cheque: número del banco, banco y beneficiario. El número del cheque es el folio del banco, distinto del folio contable de la hoja.',
    target: '[data-testid="poliza-form-hoja"]',
    placement: 'right',
    saltarSi: () => !document.querySelector('[data-testid="poliza-form"]'),
  },
  {
    id: 'form-adjunto',
    titulo: 'Adjuntar imagen del cheque',
    cuerpo: 'Puedes adjuntar la foto o el escaneo del cheque. La imagen se comprime y el archivo se guarda solo en este equipo; la póliza guarda únicamente su referencia. Para verla en grande, ábrela desde la vista previa (se cierra al hacer clic afuera o con Escape).',
    target: '[data-testid="poliza-form-adjuntar-cheque"]',
    placement: 'right',
    saltarSi: () => !document.querySelector('[data-testid="poliza-form"]'),
  },
  {
    id: 'form-guardar',
    titulo: 'Guardar la póliza',
    cuerpo: 'Al guardar se valida la partida doble y se registra la póliza. Si es un cheque con imagen, la póliza guarda la referencia y el archivo queda en este equipo con huella digital (sha256) para evitar duplicados.',
    target: '[data-testid="poliza-form-guardar"]',
    placement: 'right',
    saltarSi: () => !document.querySelector('[data-testid="poliza-form"]'),
  },
  {
    id: 'form-fiscal',
    titulo: 'Facturas XML en la partida (fiscal)',
    cuerpo: 'En cada partida puedes pulsar «Leer XML» y elegir el XML del CFDI: la app extrae el UUID y el RFC; si la partida estaba en ceros, llena el importe con el total del XML, y si ya tenía monto y no cuadra, te avisa y decides cuál usar. El RFC de tercero que captures es el que alimenta el DIOT y los XML del SAT.',
    targetText: 'Leer XML',
    placement: 'right',
    requiereFiscal: true,
    saltarSi: () => !document.querySelector('[data-testid="poliza-form"]'),
  },
  {
    id: 'poliza-card',
    titulo: 'Miniatura e imágenes anexas',
    cuerpo: 'La tarjeta de un cheque muestra su miniatura. Las imágenes anexas viven solo en el equipo que las subió; en otros equipos verás la nota «solo en su equipo». Las imágenes sin póliza aparecen en el banner de huérfanos y se eliminan si no se asignan.',
    target: '[data-testid="poliza-card"]',
    placement: 'right',
  },
  {
    id: 'imprimir-individual',
    titulo: 'Impresión individual',
    cuerpo: 'El botón de imprimir de la tarjeta abre el formato papel de esa póliza. La zona del cheque se imprime en blanco para el calcado, y con la casilla «Con imagen del cheque» puedes imprimir la imagen anexa dentro de esa zona. Esta preferencia también se usa en el Diario.',
    targetText: 'Imprimir póliza',
    placement: 'center',
    saltarSi: () => !document.querySelector('[data-testid="poliza-print-modal"]'),
  },
  {
    id: 'journal',
    titulo: 'Libro Diario',
    cuerpo: 'Aquí se consolidan todas tus pólizas en orden cronológico; este módulo es de solo lectura y la captura se hace en Pólizas. Puedes exportar a Excel o PDF y usar «Imprimir Pólizas», que ofrece tres formatos: hoja por póliza, póliza diaria y libro continuo.',
    targetText: 'Libro Diario',
    placement: 'top',
    navegarA: 'journal',
  },
  {
    id: 'journal-print',
    titulo: 'Impresión del diario',
    cuerpo: 'En el formato «Hoja por póliza» cada cheque imprime su propia hoja. El interruptor «Incluir cheques» (activado) y la casilla «Con imagen del cheque» (desactivada) controlan qué aparece en la impresión.',
    targetText: 'Imprimir Pólizas',
    placement: 'top',
    saltarSi: () => !document.querySelector('[data-testid="diario-print-sheet"]'),
  },
  {
    id: 'journal-export',
    titulo: 'Exportar a Excel y PDF',
    cuerpo: 'Exporta el movimiento cronológico del período con id, fecha, folio, cuenta e importes del Debe y el Haber. Es ideal para cotejos y revisiones.',
    targetText: 'Excel',
    placement: 'top',
    navegarA: 'journal',
  },
  {
    id: 't-accounts',
    titulo: 'Cuentas T',
    cuerpo: 'Elige una cuenta y revisa todo su movimiento acumulado del período.',
    targetText: 'Cuentas T',
    placement: 'right',
    navegarA: 't-accounts',
  },
  {
    id: 'balance',
    titulo: 'Balance general',
    cuerpo: 'Activo, Pasivo y Capital Contable con su clasificación (circulante / no circulante). En modo Fiscal añade el código SAT por cuenta, y puedes comparar contra un balance anterior para detectar errores de captura.',
    targetText: 'Balance',
    placement: 'right',
    navegarA: 'balance',
  },
  {
    id: 'profit-loss',
    titulo: 'Estado de resultados',
    cuerpo: 'Ventas menos gastos: la utilidad del período, lista para exportar a Excel.',
    targetText: 'Resultados',
    placement: 'right',
    navegarA: 'profit-loss',
  },
  {
    id: 'catalogo',
    titulo: 'Catálogo de cuentas',
    cuerpo: 'Crea, edita y borra cuentas con su jerarquía y código SAT. También puedes importar catálogos oficiales desde CSV.',
    targetText: 'Catálogo',
    placement: 'right',
    navegarA: 'catalog',
  },
  {
    id: 'activos-fijos',
    titulo: 'Activos fijos (modo Fiscal)',
    cuerpo: 'Registra tus activos, asigna su vida útil y la app calcula la depreciación lineal y la deducción fiscal del artículo 31 de la LISR.',
    targetText: 'Activos',
    placement: 'right',
    requiereFiscal: true,
    navegarA: 'assets',
  },
  {
    id: 'electronica',
    titulo: 'Contabilidad electrónica (SAT)',
    cuerpo: 'Genera los paquetes XML y TXT del SAT por período y valida la información antes de enviarla.',
    targetText: 'SAT XML',
    placement: 'right',
    requiereFiscal: true,
    navegarA: 'electronic',
  },
  {
    id: 'empresas',
    titulo: 'Un archivo contable por cliente',
    cuerpo: 'Aquí «cliente» equivale a la «empresa» de tus otros sistemas: cada uno es un archivo contable completo, con su propio catálogo, pólizas y reportes. En el selector del encabezado puedes crear otro cliente, cambiar entre ellos o eliminar uno (siempre debe existir al menos uno). Si capturaste datos solo para probar el recorrido, la tarjeta final te ofrecerá borrar ese cliente de demostración.',
    target: '[data-testid="header-clientes"]',
    placement: 'bottom',
  },
  {
    id: 'respaldo',
    titulo: 'Bóveda y respaldo: tu archivo, a salvo',
    cuerpo: 'La bóveda que se abrió une la computadora con tu teléfono: el lado «Escritorio» crea la bóveda y muestra una frase de respaldo (consérvala en papel) y un QR que el teléfono escanea para mantener la copia al día. Además, con el botón «Respaldo» (abajo) descargas un archivo con TODOS tus clientes para restaurarlo en otra computadora; la app te avisa si llevas más de una semana sin respaldo.',
    target: '[data-testid="sync-card"]',
    placement: 'right',
    accion: 'abrir-boveda',
  },
  {
    id: 'tema-sync',
    titulo: 'Tema y señales de la bóveda',
    cuerpo: 'Elige el tema claro u oscuro a tu gusto; la app funciona igual en los dos. El punto de la bóveda —al día, pendiente, en conflicto o con error— vive dentro del botón «Sync» del encabezado.',
    target: '[data-testid="header-sync"]',
    placement: 'bottom',
  },
  {
    id: 'final',
    titulo: '¡Listo, ya lo conoces!',
    cuerpo: 'Ya recorriste Contabilidad M4 Pro. Cuando quieras repetirlo, pulsa el botón «Tour» del encabezado.',
    placement: 'center',
  },
];
