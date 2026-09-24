const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('deskforge', Object.freeze({
  appName: 'DeskForge + BeatSync',
  platform: process.platform,
}))
