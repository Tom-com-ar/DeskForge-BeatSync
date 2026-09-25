const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const { app, BrowserWindow, Menu, Tray, nativeImage, dialog, ipcMain, Notification, shell, safeStorage, globalShortcut } = require('electron')
const loudness = require('loudness')

const DEV_SERVER_URL = 'http://127.0.0.1:5174'
const SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:53682/callback'
let mainWindow
let tray
let isQuitting = false
let currentNotePath = null
let spotifyAuthServer = null
let spotifyAuthState = null
let spotifyCodeVerifier = null
let spotifyAuthClientId = null
let spotifyAuthResolve = null
let spotifyAuthReject = null
let spotifyAuthTimeout = null
let spotifySession = null
let pendingGlobalCommands = []
const globalShortcuts = { playback: false, pomodoro: false }

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('before-quit', () => { isQuitting = true })

  app.whenReady().then(() => {
    registerNoteHandlers()
    registerSystemVolumeHandlers()
    registerSpotifyHandlers()
    registerGlobalShortcuts()
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

  app.on('will-quit', () => globalShortcut.unregisterAll())
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
  mainWindow.webContents.on('did-finish-load', () => {
    for (const command of pendingGlobalCommands) {
      mainWindow.webContents.send('app:global-command', command)
    }
    pendingGlobalCommands = []
  })
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

function registerSystemVolumeHandlers() {
  ipcMain.handle('audio:system-volume:get', async () => {
    try {
      const [volume, muted] = await Promise.all([loudness.getVolume(), loudness.getMuted()])
      return { available: true, volume: muted ? 0 : volume }
    } catch {
      return { available: false }
    }
  })

  ipcMain.handle('audio:system-volume:set', async (_event, requestedVolume) => {
    const volume = Math.round(Number(requestedVolume))
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
      throw new RangeError('El volumen debe estar entre 0 y 100.')
    }

    try {
      await loudness.setVolume(volume)
      await loudness.setMuted(volume === 0)
      return { available: true, volume }
    } catch {
      return { available: false }
    }
  })
}

function sendGlobalCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    pendingGlobalCommands.push(command)
    return
  }

  mainWindow.webContents.send('app:global-command', command)
}

function registerGlobalShortcuts() {
  globalShortcuts.playback = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    sendGlobalCommand('playback-toggle')
  })
  globalShortcuts.pomodoro = globalShortcut.register('CommandOrControl+Shift+P', () => {
    sendGlobalCommand('pomodoro-toggle')
  })
  ipcMain.handle('shortcuts:status', () => ({ ...globalShortcuts }))
}

function spotifySessionPath() {
  return path.join(app.getPath('userData'), 'spotify-session.dat')
}

async function saveSpotifySession(session) {
  spotifySession = session
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(session))
    await fs.writeFile(spotifySessionPath(), encrypted)
  }
}

async function loadSpotifySession() {
  if (spotifySession) return spotifySession
  if (!safeStorage.isEncryptionAvailable()) return null

  try {
    const encrypted = await fs.readFile(spotifySessionPath())
    spotifySession = JSON.parse(safeStorage.decryptString(encrypted))
    return spotifySession
  } catch {
    return null
  }
}

function finishSpotifyLogin(error, result) {
  if (spotifyAuthTimeout) clearTimeout(spotifyAuthTimeout)
  spotifyAuthTimeout = null
  const resolve = spotifyAuthResolve
  const reject = spotifyAuthReject
  spotifyAuthResolve = null
  spotifyAuthReject = null
  spotifyAuthState = null
  spotifyCodeVerifier = null
  spotifyAuthClientId = null

  const server = spotifyAuthServer
  spotifyAuthServer = null
  if (server?.listening) server.close()

  if (error) reject?.(error)
  else resolve?.(result)
}

function sendSpotifyCallbackPage(response, message) {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Spotify | DeskForge</title><body style="font:16px Segoe UI,Arial,sans-serif;background:#0f172a;color:#fff;padding:48px"><h1>DeskForge + BeatSync</h1><p>${message}</p><p>Podés volver a la aplicación.</p></body></html>`)
}

async function handleSpotifyCallback(request, response) {
  const callback = new URL(request.url, SPOTIFY_REDIRECT_URI)
  if (callback.pathname !== '/callback') {
    response.writeHead(404)
    response.end('No encontrado')
    return
  }

  if (!spotifyAuthState || callback.searchParams.get('state') !== spotifyAuthState) {
    sendSpotifyCallbackPage(response, 'No se pudo verificar el inicio de sesión.')
    finishSpotifyLogin(new Error('La respuesta de Spotify no pasó la verificación de seguridad.'))
    return
  }

  const oauthError = callback.searchParams.get('error')
  if (oauthError) {
    sendSpotifyCallbackPage(response, 'No se autorizó el acceso a Spotify.')
    finishSpotifyLogin(new Error('Se canceló la autorización de Spotify.'))
    return
  }

  const code = callback.searchParams.get('code')
  if (!code || !spotifyCodeVerifier || !spotifyAuthClientId) {
    sendSpotifyCallbackPage(response, 'Spotify no devolvió el código de autorización.')
    finishSpotifyLogin(new Error('Spotify no devolvió un código de autorización.'))
    return
  }

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        client_id: spotifyAuthClientId,
        code_verifier: spotifyCodeVerifier,
      }),
    })
    const tokenBody = await tokenResponse.json()
    if (!tokenResponse.ok || !tokenBody.access_token) {
      throw new Error(tokenBody.error_description || 'Spotify no aceptó el código de autorización.')
    }

    await saveSpotifySession({
      clientId: spotifyAuthClientId,
      accessToken: tokenBody.access_token,
      refreshToken: tokenBody.refresh_token || null,
      expiresAt: Date.now() + Number(tokenBody.expires_in || 3600) * 1000,
    })
    sendSpotifyCallbackPage(response, 'Spotify quedó conectado.')
    finishSpotifyLogin(null, { connected: true })
  } catch (error) {
    sendSpotifyCallbackPage(response, 'No se pudo completar la conexión con Spotify.')
    finishSpotifyLogin(new Error(error.message || 'Falló la conexión con Spotify.'))
  }
}

async function startSpotifyLogin(clientId) {
  const cleanClientId = typeof clientId === 'string' ? clientId.trim() : ''
  if (!cleanClientId || cleanClientId.length > 120) {
    throw new Error('Pegá el Client ID de tu app de Spotify.')
  }

  if (spotifyAuthResolve) finishSpotifyLogin(new Error('Se inició una nueva conexión de Spotify.'))
  spotifyAuthClientId = cleanClientId
  spotifyAuthState = crypto.randomBytes(24).toString('hex')
  spotifyCodeVerifier = crypto.randomBytes(48).toString('base64url')
  const codeChallenge = crypto.createHash('sha256').update(spotifyCodeVerifier).digest('base64url')

  const server = http.createServer((request, response) => {
    void handleSpotifyCallback(request, response)
  })
  spotifyAuthServer = server
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(53682, '127.0.0.1', resolve)
    })
  } catch {
    spotifyAuthServer = null
    spotifyAuthState = null
    spotifyCodeVerifier = null
    spotifyAuthClientId = null
    throw new Error('No se pudo abrir el retorno local de Spotify. Cerrá otra instancia e intentá de nuevo.')
  }

  const authUrl = new URL('https://accounts.spotify.com/authorize')
  authUrl.search = new URLSearchParams({
    client_id: cleanClientId,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state: spotifyAuthState,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  }).toString()

  const loginResult = new Promise((resolve, reject) => {
    spotifyAuthResolve = resolve
    spotifyAuthReject = reject
    spotifyAuthTimeout = setTimeout(() => {
      finishSpotifyLogin(new Error('Se venció el tiempo para autorizar Spotify.'))
    }, 3 * 60 * 1000)
  })

  try {
    await shell.openExternal(authUrl.toString())
  } catch {
    finishSpotifyLogin(new Error('No se pudo abrir el navegador para conectar Spotify.'))
  }

  return loginResult
}

async function refreshSpotifySession(session) {
  if (!session.refreshToken) {
    throw new Error('La sesión de Spotify venció. Volvé a conectar tu cuenta.')
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: session.clientId,
    }),
  })
  const body = await response.json()
  if (!response.ok || !body.access_token) {
    throw new Error('La sesión de Spotify venció. Volvé a conectar tu cuenta.')
  }

  const renewed = {
    ...session,
    accessToken: body.access_token,
    refreshToken: body.refresh_token || session.refreshToken,
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000,
  }
  await saveSpotifySession(renewed)
  return renewed
}

async function spotifyAccessToken() {
  let session = await loadSpotifySession()
  if (!session?.accessToken) throw new Error('Conectá tu cuenta de Spotify para buscar canciones.')
  if (session.expiresAt <= Date.now() + 30_000) session = await refreshSpotifySession(session)
  return session.accessToken
}

async function searchSpotify(query) {
  const cleanQuery = typeof query === 'string' ? query.trim().slice(0, 120) : ''
  if (!cleanQuery) return []

  const accessToken = await spotifyAccessToken()
  const searchUrl = new URL('https://api.spotify.com/v1/search')
  searchUrl.search = new URLSearchParams({ q: cleanQuery, type: 'track', limit: '10', market: 'AR' }).toString()
  const response = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
  const body = await response.json()
  if (!response.ok) {
    const message = body?.error?.message
    if (response.status === 401) throw new Error('La sesión de Spotify venció. Volvé a conectar tu cuenta.')
    throw new Error(message || `Spotify respondió con el error ${response.status}.`)
  }

  return (body.tracks?.items || []).map((track) => ({
    id: track.id,
    name: track.name,
    artists: (track.artists || []).map((artist) => artist.name),
    album: track.album?.name || '',
    durationMs: track.duration_ms || 0,
  }))
}

function registerSpotifyHandlers() {
  ipcMain.handle('spotify:login', (_event, clientId) => startSpotifyLogin(clientId))
  ipcMain.handle('spotify:status', async () => ({ connected: Boolean(await loadSpotifySession()) }))
  ipcMain.handle('spotify:search', (_event, query) => searchSpotify(query))
  ipcMain.handle('spotify:logout', async () => {
    spotifySession = null
    try {
      await fs.unlink(spotifySessionPath())
    } catch {
      // There is no saved token to remove.
    }
    return { connected: false }
  })
  ipcMain.handle('spotify:open-track', async (_event, trackId) => {
    if (typeof trackId !== 'string' || !/^[A-Za-z0-9]+$/.test(trackId)) return { opened: false }
    await shell.openExternal(`https://open.spotify.com/track/${trackId}`)
    return { opened: true }
  })
}
