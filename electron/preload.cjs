'use strict';

// Preload script runs in a privileged context before the renderer process.
// Expose only what the renderer needs via contextBridge; keep Node APIs out of
// the renderer for security.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
});
