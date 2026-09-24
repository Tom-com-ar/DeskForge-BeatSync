const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deskforge', Object.freeze({
  appName: 'DeskForge + BeatSync',
  platform: process.platform,
  newNote: () => ipcRenderer.invoke('notes:new'),
  openNote: () => ipcRenderer.invoke('notes:open'),
  saveNote: (content) => ipcRenderer.invoke('notes:save', content),
  onFileCommand: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('notes:command', listener)
    return () => ipcRenderer.removeListener('notes:command', listener)
  },
}))
