
export function initSpotify() {
  const spotifyClientIdKey = 'deskforge:e8:spotify-client-id'
  const spotifyClientId = document.querySelector('#spotify-client-id')
  const spotifyConnect = document.querySelector('#spotify-connect')
  const spotifyDisconnect = document.querySelector('#spotify-disconnect')
  const spotifySearchForm = document.querySelector('#spotify-search-form')
  const spotifyQuery = document.querySelector('#spotify-query')
  const spotifySearchButton = document.querySelector('#spotify-search-button')
  const spotifyResults = document.querySelector('#spotify-results')
  const spotifyStatus = document.querySelector('#spotify-status')
  const spotifyRedirectUri = document.querySelector('#spotify-redirect-uri')
  let spotifyConnected = false

  spotifyClientId.value = localStorage.getItem(spotifyClientIdKey) ?? ''
  spotifyRedirectUri.textContent = window.deskforge?.spotifyRedirectUri ?? 'http://127.0.0.1:53682/callback'

  function updateSpotifyConnection(connected) {
    spotifyConnected = connected
    spotifyConnect.hidden = connected
    spotifyDisconnect.hidden = !connected
    spotifyQuery.disabled = !connected
    spotifySearchButton.disabled = !connected
    spotifyClientId.disabled = connected
    if (connected) spotifyStatus.textContent = 'Spotify conectado. Buscá una canción o artista.'
  }

  async function refreshSpotifyConnection() {
    try {
      const result = await window.deskforge.spotifyStatus()
      updateSpotifyConnection(Boolean(result.connected))
    } catch {
      updateSpotifyConnection(false)
    }
  }

  spotifyClientId.addEventListener('input', () => {
    localStorage.setItem(spotifyClientIdKey, spotifyClientId.value.trim())
  })

  spotifyConnect.addEventListener('click', async () => {
    const clientId = spotifyClientId.value.trim()
    if (!clientId) {
      spotifyStatus.textContent = 'Pegá el Client ID de tu app de Spotify Developer.'
      spotifyClientId.focus()
      return
    }

    localStorage.setItem(spotifyClientIdKey, clientId)
    spotifyConnect.disabled = true
    spotifyConnect.textContent = 'Esperando Spotify…'
    spotifyStatus.textContent = 'Se va a abrir el navegador para autorizar la conexión.'
    try {
      await window.deskforge.spotifyLogin(clientId)
      updateSpotifyConnection(true)
    } catch (error) {
      spotifyStatus.textContent = error.message || 'No se pudo conectar Spotify.'
    } finally {
      spotifyConnect.disabled = false
      spotifyConnect.textContent = 'Conectar'
    }
  })

  spotifyDisconnect.addEventListener('click', async () => {
    await window.deskforge.spotifyLogout()
    updateSpotifyConnection(false)
    spotifyStatus.textContent = 'Spotify desconectado.'
    spotifyResults.replaceChildren()
  })

  spotifySearchForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const query = spotifyQuery.value.trim()
    if (!query || !spotifyConnected) return

    spotifySearchButton.disabled = true
    spotifySearchButton.textContent = 'Buscando…'
    spotifyStatus.textContent = 'Buscando en el catálogo de Spotify…'
    spotifyResults.replaceChildren()
    try {
      const results = await window.deskforge.spotifySearch(query)
      if (results.length === 0) {
        spotifyStatus.textContent = 'No encontré canciones con esa búsqueda.'
        return
      }

      for (const track of results) {
        const item = document.createElement('article')
        item.className = 'spotify-result'
        item.setAttribute('role', 'listitem')
        const details = document.createElement('div')
        details.className = 'spotify-result-details'
        const name = document.createElement('strong')
        name.textContent = track.name
        const artists = document.createElement('span')
        artists.textContent = track.artists.join(', ')
        const album = document.createElement('small')
        album.textContent = track.album
        details.append(name, artists, album)
        const open = document.createElement('button')
        open.type = 'button'
        open.className = 'button button-secondary'
        open.textContent = 'Abrir'
        open.setAttribute('aria-label', `Abrir ${track.name} en Spotify`)
        open.addEventListener('click', () => window.deskforge.openSpotifyTrack(track.id))
        item.append(details, open)
        spotifyResults.append(item)
      }
      spotifyStatus.textContent = `${results.length} canciones encontradas.`
    } catch (error) {
      spotifyStatus.textContent = error.message || 'No se pudo buscar en Spotify.'
    } finally {
      spotifySearchButton.disabled = !spotifyConnected
      spotifySearchButton.textContent = 'Buscar'
    }
  })

  void refreshSpotifyConnection()
}
