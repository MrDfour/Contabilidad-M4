import { app, BrowserWindow, Menu, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure logger for auto-updater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Auto-updater event listeners
autoUpdater.on('update-available', (info) => {
  log.info('Actualización disponible:', info);
  dialog.showMessageBox({
    type: 'info',
    title: 'Actualización disponible',
    message: `Se encontró la versión ${info.version}. Descargando en segundo plano...`,
    buttons: ['Aceptar'],
  });
});

autoUpdater.on('update-downloaded', async (info) => {
  log.info('Actualización descargada:', info);

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Actualización lista',
    message: `Se descargó la versión ${info.version}. ¿Desea reiniciar la aplicación para aplicar la actualización?`,
    buttons: ['Sí, reiniciar ahora', 'Más tarde'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    autoUpdater.quitAndInstall();
  }
});

autoUpdater.on('error', (err) => {
  log.error('Error en el actualizador:', err);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Contabilidad M4 Pro',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Remove the application menu (File, Edit, View, Window, etc.)
  Menu.setApplicationMenu(null);

  win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.webContents.once('did-finish-load', () => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.error('Error al verificar actualizaciones:', err);
    });
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
