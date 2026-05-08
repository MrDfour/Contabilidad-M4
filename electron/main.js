import { app, BrowserWindow, Menu, dialog, shell, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const fs = require('fs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure logger for auto-updater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;

// Keep a reference to the main window to forward IPC events
let mainWindow = null;

// Auto-updater event listeners
autoUpdater.on('update-available', (info) => {
  log.info('Actualización disponible:', info);

  const changelogUrl = `https://github.com/mrdfour/contabilidad-m4/releases/tag/v${info.version}`;

  const showUpdateDialog = async () => {
    let keepShowing = true;
    while (keepShowing) {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'Actualización disponible',
        message: `Nueva versión disponible: ${info.version}`,
        detail: '¿Desea descargar e instalar la actualización ahora?',
        buttons: ['Actualizar', 'Ver cambios', 'Omitir por ahora'],
        defaultId: 0,
        cancelId: 2,
      });

      if (response === 0) {
        // Inform the user that the download is starting before it happens
        dialog.showMessageBox({
          type: 'info',
          title: 'Descargando actualización',
          message: 'Descarga iniciada',
          detail:
            'La actualización se está descargando en segundo plano. Se le notificará cuando esté lista para instalar.',
          buttons: ['Aceptar'],
        });

        autoUpdater.downloadUpdate().catch((err) => {
          // The 'error' event handles the user-facing dialog; log here to
          // avoid an unhandled promise rejection in case the event doesn't fire.
          log.error('downloadUpdate() promise rejected:', err);
        });
        keepShowing = false;
      } else if (response === 1) {
        shell.openExternal(changelogUrl);
        // keep showing so the user can still choose to update or skip
      } else {
        // Omitir por ahora: ignore until next startup
        keepShowing = false;
      }
    }
  };

  showUpdateDialog();
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

autoUpdater.on('download-progress', (progressObj) => {
  log.info('Progreso de descarga:', progressObj);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-progress', progressObj);
  }
});

autoUpdater.on('error', (err) => {
  log.error('Error en el actualizador:', err);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Contabilidad M4 Pro',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Remove the application menu (File, Edit, View, Window, etc.)
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    autoUpdater.checkForUpdates().catch((err) => {
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

ipcMain.handle('save-data', async (event, key, data) => {
  const filePath = path.join(app.getPath('userData'), `${key}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
});

ipcMain.handle('load-data', async (event, key) => {
  const filePath = path.join(app.getPath('userData'), `${key}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return null;
});
