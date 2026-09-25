import { initNotes } from './notes.js'
import { initPomodoro } from './pomodoro.js'
import { initPlayer } from './player.js'
import { initPlaylists } from './playlists.js'
import { initSpotify } from './spotify.js'
import { initTheme } from './theme.js'

const platformNames = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
}
const platform = platformNames[window.deskforge?.platform] ?? 'tu escritorio'
document.querySelector('footer').textContent =
  `La ventana se oculta al cerrarla. Podés volver desde el ícono de la bandeja en ${platform}.`

initTheme()
initNotes()
initPomodoro()
const player = initPlayer()
initPlaylists(player)
initSpotify()
