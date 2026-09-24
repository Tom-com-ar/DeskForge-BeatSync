const path = require('node:path')
const { app, BrowserWindow, Menu, Tray, nativeImage } = require('electron')

const DEV_SERVER_URL = 'http://127.0.0.1:5174'
let mainWindow
let tray
let isQuitting = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('before-quit', () => { isQuitting = true })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: 'Archivo',
        submenu: [
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
    backgroundColor: '#101319',
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
  mainWindow.on('closed', () => { mainWindow = null })
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
