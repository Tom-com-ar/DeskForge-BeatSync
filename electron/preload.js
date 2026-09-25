const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deskforge', Object.freeze({
  appName: 'DeskForge + BeatSync',
  platform: process.platform,
  spotifyRedirectUri: 'http://127.0.0.1:53682/callback',
  newNote: () => ipcRenderer.invoke('notes:new'),
  openNote: () => ipcRenderer.invoke('notes:open'),
  saveNote: (content) => ipcRenderer.invoke('notes:save', content),
  notifyPomodoro: (phase) => ipcRenderer.invoke('pomodoro:notify', phase),
  getSystemVolume: () => ipcRenderer.invoke('audio:system-volume:get'),
  setSystemVolume: (volume) => ipcRenderer.invoke('audio:system-volume:set', volume),
  spotifyLogin: (clientId) => ipcRenderer.invoke('spotify:login', clientId),
  spotifyStatus: () => ipcRenderer.invoke('spotify:status'),
  spotifySearch: (query) => ipcRenderer.invoke('spotify:search', query),
  spotifyLogout: () => ipcRenderer.invoke('spotify:logout'),
  openSpotifyTrack: (trackId) => ipcRenderer.invoke('spotify:open-track', trackId),
  globalShortcutStatus: () => ipcRenderer.invoke('shortcuts:status'),
  onGlobalShortcutCommand: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, command) => {
      if (command === 'playback-toggle' || command === 'pomodoro-toggle') callback(command)
    }
    ipcRenderer.on('app:global-command', listener)
    return () => ipcRenderer.removeListener('app:global-command', listener)
  },
  onFileCommand: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('notes:command', listener)
    return () => ipcRenderer.removeListener('notes:command', listener)
  },
}))
