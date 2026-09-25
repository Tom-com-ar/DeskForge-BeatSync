export function initPlaylists({ audioTracks, playTrack }) {
  const playlistsStorageKey = 'deskforge:e7:playlists'
  const activePlaylistStorageKey = 'deskforge:e7:active-playlist'
  const playlistNameInput = document.querySelector('#playlist-name')
  const playlistList = document.querySelector('#playlist-list')
  const activePlaylistSection = document.querySelector('#active-playlist')
  const activePlaylistName = document.querySelector('#active-playlist-name')
  const playlistTracks = document.querySelector('#playlist-tracks')
  const playlistStatus = document.querySelector('#playlist-status')
  let playlists = loadPlaylists()
  let activePlaylistId = localStorage.getItem(activePlaylistStorageKey)

  function loadPlaylists() {
    try {
      const value = JSON.parse(localStorage.getItem(playlistsStorageKey) ?? '[]')
      return Array.isArray(value)
        ? value.filter((playlist) => playlist && typeof playlist.id === 'string' && typeof playlist.name === 'string' && Array.isArray(playlist.tracks))
        : []
    } catch {
      return []
    }
  }

  function activePlaylist() {
    return playlists.find((playlist) => playlist.id === activePlaylistId) ?? null
  }

  function savePlaylists(message = 'Cambios guardados en este equipo.') {
    try {
      localStorage.setItem(playlistsStorageKey, JSON.stringify(playlists))
      if (activePlaylistId) localStorage.setItem(activePlaylistStorageKey, activePlaylistId)
      else localStorage.removeItem(activePlaylistStorageKey)
      playlistStatus.textContent = message
    } catch {
      playlistStatus.textContent = 'No se pudieron guardar las playlists en este equipo.'
    }
  }

  function findLocalTrack(playlistTrack) {
    const exactIndex = audioTracks.findIndex((track) => track.relativePath === playlistTrack.path)
    if (exactIndex >= 0) return exactIndex
    const matchingIndexes = audioTracks
      .map((track, index) => track.name === playlistTrack.name ? index : -1)
      .filter((index) => index >= 0)
    return matchingIndexes.length === 1 ? matchingIndexes[0] : -1
  }

  function addTrackToPlaylist(playlist, playlistTrack) {
    if (!playlist || !playlistTrack?.path || !playlistTrack?.name) return
    if (playlist.tracks.some((track) => track.path === playlistTrack.path)) {
      playlistStatus.textContent = 'Esa canción ya está en la playlist.'
      return
    }
    playlist.tracks.push({ path: playlistTrack.path, name: playlistTrack.name })
    savePlaylists(`Se agregó “${playlistTrack.name}” a ${playlist.name}.`)
    renderPlaylists()
  }

  function reorderPlaylists(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return
    const sourceIndex = playlists.findIndex((playlist) => playlist.id === sourceId)
    const targetIndex = playlists.findIndex((playlist) => playlist.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const [playlist] = playlists.splice(sourceIndex, 1)
    playlists.splice(targetIndex, 0, playlist)
    savePlaylists('Orden de playlists guardado.')
    renderPlaylists()
  }

  function handlePlaylistDrop(event, playlist) {
    event.preventDefault()
    const libraryTrack = event.dataTransfer.getData('application/x-deskforge-library-track')
    if (libraryTrack) {
      try {
        addTrackToPlaylist(playlist, JSON.parse(libraryTrack))
      } catch {
        playlistStatus.textContent = 'No se pudo agregar esa canción.'
      }
      return
    }

    const playlistSong = event.dataTransfer.getData('application/x-deskforge-playlist-song')
    if (playlistSong) {
      try {
        const dragged = JSON.parse(playlistSong)
        const sourcePlaylist = playlists.find((item) => item.id === dragged.playlistId)
        const sourceTrack = sourcePlaylist?.tracks[dragged.index]
        if (sourceTrack && sourcePlaylist.id !== playlist.id) addTrackToPlaylist(playlist, sourceTrack)
      } catch {
        playlistStatus.textContent = 'No se pudo mover esa canción.'
      }
      return
    }

    const draggedPlaylistId = event.dataTransfer.getData('application/x-deskforge-playlist')
    if (draggedPlaylistId) reorderPlaylists(draggedPlaylistId, playlist.id)
  }

  function renderPlaylistTracks() {
    const playlist = activePlaylist()
    activePlaylistSection.hidden = !playlist
    if (!playlist) return
    activePlaylistName.textContent = playlist.name
    playlistTracks.replaceChildren()

    if (playlist.tracks.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'empty-playlist'
      empty.textContent = 'Arrastrá canciones de la biblioteca para agregarlas.'
      playlistTracks.append(empty)
      return
    }

    playlist.tracks.forEach((track, index) => {
      const row = document.createElement('div')
      row.className = 'playlist-track'
      row.setAttribute('role', 'listitem')
      row.draggable = true

      const playButton = document.createElement('button')
      playButton.type = 'button'
      playButton.className = 'playlist-track-play'
      playButton.textContent = track.name
      playButton.title = track.path
      playButton.addEventListener('click', () => {
        const trackIndex = findLocalTrack(track)
        if (trackIndex < 0) {
          playlistStatus.textContent = 'Elegí de nuevo la carpeta de música para encontrar esta canción.'
          return
        }
        playTrack(trackIndex)
      })

      const removeButton = document.createElement('button')
      removeButton.type = 'button'
      removeButton.className = 'playlist-track-remove'
      removeButton.setAttribute('aria-label', `Quitar ${track.name}`)
      removeButton.textContent = 'Quitar'
      removeButton.addEventListener('click', () => {
        playlist.tracks.splice(index, 1)
        savePlaylists('Canción quitada de la playlist.')
        renderPlaylists()
      })

      row.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('application/x-deskforge-playlist-song', JSON.stringify({
          playlistId: playlist.id,
          index,
        }))
      })
      row.addEventListener('dragover', (event) => {
        if (event.dataTransfer.types.includes('application/x-deskforge-playlist-song')) event.preventDefault()
      })
      row.addEventListener('drop', (event) => {
        event.preventDefault()
        if (event.dataTransfer.getData('application/x-deskforge-library-track')) {
          handlePlaylistDrop(event, playlist)
          return
        }
        try {
          const dragged = JSON.parse(event.dataTransfer.getData('application/x-deskforge-playlist-song'))
          if (dragged.playlistId !== playlist.id || dragged.index === index) return
          const [movedTrack] = playlist.tracks.splice(dragged.index, 1)
          playlist.tracks.splice(index, 0, movedTrack)
          savePlaylists('Orden de canciones guardado.')
          renderPlaylists()
        } catch {
          playlistStatus.textContent = 'No se pudo cambiar el orden de las canciones.'
        }
      })

      row.append(playButton, removeButton)
      playlistTracks.append(row)
    })

  }

  playlistTracks.addEventListener('dragover', (event) => {
    if (event.dataTransfer.types.includes('application/x-deskforge-library-track')) event.preventDefault()
  })
  playlistTracks.addEventListener('drop', (event) => {
    const playlist = activePlaylist()
    if (playlist) handlePlaylistDrop(event, playlist)
  })

  function renderPlaylists() {
    if (!activePlaylist()) activePlaylistId = playlists[0]?.id ?? null
    playlistList.replaceChildren()
    if (playlists.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'empty-playlist'
      empty.textContent = 'Todavía no creaste playlists.'
      playlistList.append(empty)
    }

    playlists.forEach((playlist) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'playlist-entry'
      button.setAttribute('role', 'listitem')
      button.setAttribute('aria-current', String(playlist.id === activePlaylistId))
      button.draggable = true

      const name = document.createElement('span')
      name.className = 'playlist-entry-name'
      name.textContent = playlist.name
      const count = document.createElement('span')
      count.className = 'playlist-entry-count'
      count.textContent = `${playlist.tracks.length} ${playlist.tracks.length === 1 ? 'canción' : 'canciones'}`
      button.append(name, count)
      button.addEventListener('click', () => {
        activePlaylistId = playlist.id
        savePlaylists('Playlist seleccionada.')
        renderPlaylists()
      })
      button.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('application/x-deskforge-playlist', playlist.id)
      })
      button.addEventListener('dragover', (event) => {
        if (event.dataTransfer.types.length) event.preventDefault()
      })
      button.addEventListener('drop', (event) => handlePlaylistDrop(event, playlist))
      playlistList.append(button)
    })

    renderPlaylistTracks()
  }

  document.querySelector('#create-playlist').addEventListener('click', () => {
    const name = playlistNameInput.value.trim()
    if (!name) {
      playlistStatus.textContent = 'Escribí un nombre para la playlist.'
      playlistNameInput.focus()
      return
    }
    const playlist = { id: crypto.randomUUID(), name, tracks: [] }
    playlists.push(playlist)
    activePlaylistId = playlist.id
    playlistNameInput.value = ''
    savePlaylists('Playlist creada.')
    renderPlaylists()
  })

  playlistNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') document.querySelector('#create-playlist').click()
  })

  document.querySelector('#rename-playlist').addEventListener('click', () => {
    const playlist = activePlaylist()
    if (!playlist) return
    const name = window.prompt('Nombre de la playlist:', playlist.name)?.trim()
    if (!name) return
    playlist.name = name.slice(0, 50)
    savePlaylists('Nombre de playlist actualizado.')
    renderPlaylists()
  })

  document.querySelector('#delete-playlist').addEventListener('click', () => {
    const playlist = activePlaylist()
    if (!playlist || !window.confirm(`¿Eliminar la playlist “${playlist.name}”?`)) return
    playlists = playlists.filter((item) => item.id !== playlist.id)
    activePlaylistId = playlists[0]?.id ?? null
    savePlaylists('Playlist eliminada.')
    renderPlaylists()
  })

  renderPlaylists()
}
