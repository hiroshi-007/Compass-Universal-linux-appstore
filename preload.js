const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getPackageManagers: () => ipcRenderer.invoke('get-package-managers'),
  search: (query) => ipcRenderer.invoke('search-apps', query),
  install: (pkg) => ipcRenderer.invoke('install-app', pkg),
  getInstalled: () => ipcRenderer.invoke('get-installed-apps'),
  uninstall: (pkg, purge) => ipcRenderer.invoke('uninstall-app', pkg, purge),
  getAppMeta: (pkg) => ipcRenderer.invoke('get-app-meta', pkg),
  getActiveInstalls: () => ipcRenderer.invoke('get-active-installs'),
  launchApp: (pkg) => ipcRenderer.invoke('launch-app', pkg),
  onInstallProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('install-progress', listener);
    return () => ipcRenderer.removeListener('install-progress', listener);
  },
  onMaximizedChange: (callback) => {
    const listener = (event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximized', listener);
    return () => ipcRenderer.removeListener('window-maximized', listener);
  },
  onSearchPartial: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('search-partial', listener);
    return () => ipcRenderer.removeListener('search-partial', listener);
  },
  onCacheStatus: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('cache-status', listener);
    return () => ipcRenderer.removeListener('cache-status', listener);
  },
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close')
});
