//script that runs before the web page (renderer process) loads, 
// serving as a secure bridge between the main process (which has full Node.js and OS access) and the renderer process (which is isolated for security). 
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('versions', {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
})

contextBridge.exposeInMainWorld('electronAPI', {
    listMusic: () => ipcRenderer.invoke('music:list'),
    close:    () => ipcRenderer.send('closeApp'),
    minimize: () => ipcRenderer.send('minimizeApp'),
    maximize: () => ipcRenderer.send('maximizeApp'),

});