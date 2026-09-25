const path = require('node:path')
const fs = require('node:fs/promises')
const { app, BrowserWindow, Menu, Tray, nativeImage, dialog, ipcMain, Notification } = require('electron')

const DEV_SERVER_URL = 'http://127.0.0.1:5174'
let mainWindow
let tray
let isQuitting = false
let currentNotePath = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('before-quit', () => { isQuitting = true })

  app.whenReady().then(() => {
    registerNoteHandlers()
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: 'Archivo',
        submenu: [
          { label: 'Nuevo', accelerator: 'CmdOrCtrl+N', click: () => sendNoteCommand('new') },
          { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: () => sendNoteCommand('open') },
          { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: () => sendNoteCommand('save') },
          { type: 'separator' },
          { label: 'Mostrar DeskForge', click: showWindow },
          { type: 'separator' },
          { label: 'Salir', role: 'quit' },
        ],
      },
    ]))

    const iconPath = path.join(__dirname, '..', 'assets', 'tray.png')
    const icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) throw new Error(`No se pudo cargar ${iconPath}`)

    tray = new Tray(icon.resize({ width: 16, height: 16 }))
    tray.setToolTip('DeskForge + BeatSync')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir DeskForge', click: showWindow },
      { type: 'separator' },
      { label: 'Salir', role: 'quit' },
    ]))
    tray.on('click', showWindow)

    createWindow()
    app.on('activate', showWindow)
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'DeskForge + BeatSync',
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    resizable: true,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
    currentNotePath = null
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else {
    mainWindow.loadURL(DEV_SERVER_URL)
  }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }

  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function registerNoteHandlers() {
  ipcMain.handle('pomodoro:notify', (_event, phase) => {
    if (phase !== 'focus' && phase !== 'break') return { shown: false }

    const title = phase === 'focus' ? 'Enfoque terminado' : 'Descanso terminado'
    const body = phase === 'focus'
      ? 'Terminaste un bloque de 25 minutos. Empezó tu descanso de 5 minutos.'
      : 'Terminó el descanso. Empezó un nuevo bloque de enfoque de 25 minutos.'

    if (process.platform === 'win32' && tray && !tray.isDestroyed()) {
      tray.displayBalloon({ title, content: body, iconType: 'info' })
      return { shown: true }
    }

    if (!Notification.isSupported()) return { shown: false }
    new Notification({ title, body }).show()
    return { shown: true }
  })

  ipcMain.handle('notes:new', () => {
    currentNotePath = null
    return { ok: true }
  })

  ipcMain.handle('notes:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Abrir nota',
      properties: ['openFile'],
      filters: [{ name: 'Archivos de texto', extensions: ['txt', 'md'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    const filePath = result.filePaths[0]
    const content = await fs.readFile(filePath, 'utf8')
    currentNotePath = filePath
    return { canceled: false, content, fileName: path.basename(filePath) }
  })

  ipcMain.handle('notes:save', async (_event, content) => {
    if (typeof content !== 'string') throw new TypeError('El contenido de la nota debe ser texto.')

    if (!currentNotePath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar nota',
        defaultPath: 'nota.txt',
        filters: [{ name: 'Archivos de texto', extensions: ['txt', 'md'] }],
      })
      if (result.canceled || !result.filePath) return { canceled: true }
      currentNotePath = result.filePath
    }

    await fs.writeFile(currentNotePath, content, 'utf8')
    return { canceled: false, fileName: path.basename(currentNotePath) }
  })
}

function sendNoteCommand(command) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('notes:command', command)
  }
}
