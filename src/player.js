import { Howl, Howler } from 'howler'
import { createEqualizer } from './equalizer.js'
import { createVisualizer } from './visualizer.js'

export function initPlayer() {
  const audioFolder = document.querySelector('#audio-folder')
  const trackTitle = document.querySelector('#track-title')
  const trackPosition = document.querySelector('#track-position')
  const playerStatus = document.querySelector('#player-status')
  const nativeAudioFallback = document.querySelector('#native-audio-fallback')
  const playToggle = document.querySelector('#play-toggle')
  const previousTrack = document.querySelector('#previous-track')
  const nextTrack = document.querySelector('#next-track')
  const playbackProgress = document.querySelector('#playback-progress')
  const playbackCurrent = document.querySelector('#playback-current')
  const playbackDuration = document.querySelector('#playback-duration')
  const shuffleToggle = document.querySelector('#shuffle-toggle')
  const repeatToggle = document.querySelector('#repeat-toggle')
  const volumeLevel = document.querySelector('#volume-level')
  const trackList = document.querySelector('#track-list')
  const libraryFolder = document.querySelector('#library-folder')
  const libraryCount = document.querySelector('#library-count')
  const libraryStatus = document.querySelector('#library-status')
  const visualizerStatus = document.querySelector('#visualizer-status')
  const volumeLabel = document.querySelector('#volume-label')
  const volumeValue = document.querySelector('#volume-value')
  const audioTracks = []
  const equalizer = createEqualizer()
  let currentTrackIndex = -1
  let shuffleEnabled = false
  let repeatMode = 'off'
  let systemVolumeAvailable = false
  let volumeChangeTimer = null
  let volumeWriteQueue = Promise.resolve()
  let lastVolumeInteraction = 0

  const visualizer = createVisualizer({
    audioElement: nativeAudioFallback,
    getCurrentTrack: currentTrack,
    updatePlaybackProgress,
    visualizerStatus,
    equalizer,
  })

  Howler.volume(Number(volumeLevel.value) / 100)

  function applyAppVolume(value) {
    const volume = Math.max(0, Math.min(100, Number(value))) / 100
    Howler.volume(volume)
    nativeAudioFallback.volume = volume
  }

  function displayVolume(value) {
    const volume = Math.max(0, Math.min(100, Math.round(Number(value))))
    volumeLevel.value = String(volume)
    volumeValue.textContent = `${volume}%`
  }

  async function writeSystemVolume(value) {
    volumeWriteQueue = volumeWriteQueue
      .catch(() => {})
      .then(() => window.deskforge.setSystemVolume(value))

    try {
      const result = await volumeWriteQueue
      if (!result.available) throw new Error('El volumen del sistema no está disponible.')
    } catch {
      systemVolumeAvailable = false
      volumeLabel.textContent = 'Volumen de DeskForge'
      volumeLevel.setAttribute('aria-label', 'Volumen de DeskForge')
      applyAppVolume(value)
    }
  }

  async function initializeVolumeControl() {
    try {
      const result = await window.deskforge.getSystemVolume()
      if (!result.available) throw new Error('No se pudo leer el volumen del sistema.')

      systemVolumeAvailable = true
      volumeLabel.textContent = 'Volumen del sistema'
      volumeLevel.setAttribute('aria-label', 'Volumen del sistema')
      displayVolume(result.volume)
      Howler.volume(1)
      nativeAudioFallback.volume = 1
    } catch {
      systemVolumeAvailable = false
      volumeLabel.textContent = 'Volumen de DeskForge'
      volumeLevel.setAttribute('aria-label', 'Volumen de DeskForge')
      displayVolume(volumeLevel.value)
      applyAppVolume(volumeLevel.value)
    } finally {
      volumeLevel.disabled = false
    }
  }

  async function syncVolumeFromSystem() {
    if (!systemVolumeAvailable || document.hidden || Date.now() - lastVolumeInteraction < 1200) return

    try {
      const result = await window.deskforge.getSystemVolume()
      if (result.available && Number(result.volume) !== Number(volumeLevel.value)) {
        displayVolume(result.volume)
      }
    } catch {
      // A temporary system-volume read failure should not interrupt playback.
    }
  }

  void initializeVolumeControl()
  window.setInterval(syncVolumeFromSystem, 1800)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void syncVolumeFromSystem()
  })

  function formatAudioTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  function currentTrack() {
    return audioTracks[currentTrackIndex] ?? null
  }

  function updatePlayerControls() {
    const hasTracks = audioTracks.length > 0
    const sound = currentTrack()?.sound
    const duration = sound?.duration()
    const isPlaying = currentTrack()?.nativeFallback ? !nativeAudioFallback.paused : sound?.playing()
    playToggle.disabled = !hasTracks
    previousTrack.disabled = !hasTracks
    nextTrack.disabled = !hasTracks
    shuffleToggle.disabled = audioTracks.length < 2
    repeatToggle.disabled = !hasTracks
    playbackProgress.disabled = !hasTracks || !Number.isFinite(duration) || duration <= 0
    trackPosition.textContent = hasTracks ? `${currentTrackIndex + 1} de ${audioTracks.length}` : '0 de 0'
    playToggle.textContent = isPlaying ? 'Pausar' : 'Reproducir'
  }

  function updatePlaybackProgress() {
    const track = currentTrack()
    const sound = track?.sound
    const duration = track?.nativeFallback ? nativeAudioFallback.duration : sound?.duration()
    const currentTime = track?.nativeFallback ? nativeAudioFallback.currentTime : sound?.seek()
    playbackCurrent.textContent = formatAudioTime(currentTime)
    playbackDuration.textContent = formatAudioTime(duration)
    playbackProgress.value = Number.isFinite(duration) && duration > 0
      ? String((currentTime / duration) * 100)
      : '0'
    playbackProgress.disabled = audioTracks.length === 0 || !Number.isFinite(duration) || duration <= 0
  }

  function ensureTrackSound(track) {
    if (track.sound) return track.sound
    if (!track.url) track.url = URL.createObjectURL(track.file)

    track.sound = new Howl({
      src: [track.url],
      format: [track.extension],
      preload: true,
      html5: false,
      onload: () => {
        if (currentTrack() === track) {
          updatePlaybackProgress()
          updatePlayerControls()
        }
      },
      onplay: () => {
        if (currentTrack() !== track) return
        playerStatus.textContent = `Reproduciendo: ${track.name}`
        visualizerStatus.textContent = `Sonido en vivo: ${track.name}`
        updatePlayerControls()
      },
      onpause: () => {
        if (currentTrack() !== track) return
        playerStatus.textContent = 'Reproducción pausada.'
        visualizerStatus.textContent = 'Visualización pausada.'
        updatePlayerControls()
      },
      onend: () => {
        if (currentTrack() === track) finishTrack()
      },
      onloaderror: (_id, error) => {
        startNativeFallback(track, error)
      },
      onplayerror: (_id, error) => {
        startNativeFallback(track, error)
      },
    })
    return track.sound
  }

  function startNativeFallback(track) {
    if (currentTrack() !== track || track.nativeFallback) return
    track.nativeFallback = true
    playerStatus.textContent = `Abriendo con el audio del sistema: ${track.name}`
    nativeAudioFallback.pause()
    nativeAudioFallback.src = track.url
    nativeAudioFallback.volume = systemVolumeAvailable ? 1 : Number(volumeLevel.value) / 100
    nativeAudioFallback.load()

    try {
      visualizer.connectAudioElement()
    } catch {
      visualizerStatus.textContent = 'La canción puede sonar; no se pudo conectar el visualizador.'
    }

    nativeAudioFallback.play().catch(() => {
      playerStatus.textContent = 'No se pudo reproducir el archivo. Probá con otro MP3, OGG o WAV.'
      updatePlayerControls()
    })
  }

  function renderTrackList() {
    trackList.replaceChildren()
    if (audioTracks.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'empty-library'
      empty.textContent = 'Tus canciones aparecerán acá.'
      trackList.append(empty)
      return
    }

    audioTracks.forEach((track, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'track-item'
      button.setAttribute('role', 'listitem')
      button.setAttribute('aria-current', String(index === currentTrackIndex))
      button.draggable = true
      button.title = track.relativePath

      const name = document.createElement('span')
      name.className = 'track-item-name'
      name.textContent = track.name
      const format = document.createElement('span')
      format.className = 'track-item-format'
      format.textContent = track.extension.toUpperCase()
      button.append(name, format)
      button.addEventListener('click', () => playTrack(index))
      button.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'copy'
        event.dataTransfer.setData('application/x-deskforge-library-track', JSON.stringify({
          path: track.relativePath,
          name: track.name,
        }))
      })
      trackList.append(button)
    })
  }

  function releaseTracks() {
    nativeAudioFallback.pause()
    nativeAudioFallback.removeAttribute('src')
    nativeAudioFallback.load()
    for (const track of audioTracks) {
      if (track.sound) track.sound.unload()
      if (track.url) URL.revokeObjectURL(track.url)
    }
    audioTracks.length = 0
    currentTrackIndex = -1
  }

  function loadAudioFolder(files) {
    const supportedFiles = [...files]
      .filter((file) => /\.(mp3|ogg|wav)$/i.test(file.name))
      .sort((first, second) => first.name.localeCompare(second.name, 'es', { numeric: true, sensitivity: 'base' }))

    releaseTracks()
    if (supportedFiles.length === 0) {
      libraryFolder.textContent = 'Ninguna carpeta seleccionada'
      libraryCount.textContent = '0 canciones'
      libraryStatus.textContent = 'No encontré archivos MP3, OGG o WAV en esa carpeta.'
      trackTitle.textContent = 'Sin canciones cargadas'
      playerStatus.textContent = 'Elegí una carpeta que tenga archivos de audio compatibles.'
      visualizerStatus.textContent = 'Reproducí una canción para ver el audio.'
      renderTrackList()
      updatePlayerControls()
      updatePlaybackProgress()
      return
    }

    for (const file of supportedFiles) {
      const relativePath = file.webkitRelativePath || file.name
      audioTracks.push({
        file,
        name: file.name,
        relativePath,
        extension: file.name.split('.').pop().toLowerCase(),
        url: null,
        sound: null,
        nativeFallback: false,
      })
    }

    const folderName = (supportedFiles[0].webkitRelativePath || '').split('/')[0]
    currentTrackIndex = 0
    libraryFolder.textContent = folderName || 'Carpeta seleccionada'
    libraryCount.textContent = `${audioTracks.length} ${audioTracks.length === 1 ? 'canción' : 'canciones'}`
    libraryStatus.textContent = 'La primera canción quedó seleccionada. Tocá Reproducir para empezar.'
    playerStatus.textContent = `Lista para reproducir: ${audioTracks[0].name}`
    visualizerStatus.textContent = 'Reproducí una canción para ver el audio.'
    trackTitle.textContent = audioTracks[0].name
    renderTrackList()
    updatePlayerControls()
    updatePlaybackProgress()
  }

  function playTrack(index) {
    if (index < 0 || index >= audioTracks.length) return
    if (currentTrack()?.sound) currentTrack().sound.stop()
    if (currentTrack()?.nativeFallback) nativeAudioFallback.pause()

    currentTrackIndex = index
    const track = currentTrack()
    trackTitle.textContent = track.name
    playbackCurrent.textContent = '00:00'
    playbackDuration.textContent = '00:00'
    playbackProgress.value = '0'
    playerStatus.textContent = `Cargando: ${track.name}`
    renderTrackList()
    updatePlayerControls()

    try {
      const sound = ensureTrackSound(track)
      visualizer.connect()
      sound.play()
    } catch {
      playerStatus.textContent = 'No se pudo iniciar la reproducción.'
      visualizerStatus.textContent = 'No se pudo conectar el audio al visualizador.'
    }
  }

  function pickRandomTrack() {
    if (audioTracks.length < 2) return currentTrackIndex
    const choices = audioTracks.map((_track, index) => index).filter((index) => index !== currentTrackIndex)
    return choices[Math.floor(Math.random() * choices.length)]
  }

  function moveToNextTrack() {
    if (audioTracks.length === 0) return
    if (shuffleEnabled) {
      playTrack(pickRandomTrack())
    } else if (currentTrackIndex < audioTracks.length - 1) {
      playTrack(currentTrackIndex + 1)
    } else if (repeatMode === 'all') {
      playTrack(0)
    }
  }

  function moveToPreviousTrack() {
    if (audioTracks.length === 0) return
    const track = currentTrack()
    const currentTime = track?.nativeFallback ? nativeAudioFallback.currentTime : track?.sound?.seek()
    if (Number(currentTime) > 3) {
      if (track.nativeFallback) nativeAudioFallback.currentTime = 0
      else track.sound.seek(0)
      return
    }

    if (shuffleEnabled) {
      playTrack(pickRandomTrack())
    } else if (currentTrackIndex > 0) {
      playTrack(currentTrackIndex - 1)
    } else if (repeatMode === 'all') {
      playTrack(audioTracks.length - 1)
    } else {
      playTrack(currentTrackIndex)
    }
  }

  function finishTrack() {
    if (repeatMode === 'one') {
      const track = currentTrack()
      if (track?.nativeFallback) {
        nativeAudioFallback.currentTime = 0
        nativeAudioFallback.play().catch(() => {
          playerStatus.textContent = 'No se pudo repetir esta canción.'
        })
      } else if (track?.sound) {
        track.sound.seek(0)
        track.sound.play()
      }
    } else if (currentTrackIndex < audioTracks.length - 1 || repeatMode === 'all' || shuffleEnabled) {
      moveToNextTrack()
    } else {
      playerStatus.textContent = 'Llegaste al final de la biblioteca.'
      visualizerStatus.textContent = 'Reproducí otra canción para ver el audio.'
      updatePlayerControls()
    }
  }

  document.querySelector('#choose-folder').addEventListener('click', () => audioFolder.click())
  audioFolder.addEventListener('change', () => {
    loadAudioFolder(audioFolder.files)
    audioFolder.value = ''
  })

  playToggle.addEventListener('click', () => {
    const track = currentTrack()
    if (!track) return
    if (track.nativeFallback) {
      if (nativeAudioFallback.paused) {
        nativeAudioFallback.play().catch(() => {
          playerStatus.textContent = 'No se pudo reanudar esta canción.'
        })
      } else {
        nativeAudioFallback.pause()
      }
      return
    }

    const sound = ensureTrackSound(track)
    if (sound.playing()) {
      sound.pause()
    } else {
      visualizer.connect()
      sound.play()
    }
  })

  const pomodoroShortcutHint = document.querySelector('#pomodoro-shortcut')
  const playerShortcutHint = document.querySelector('#player-shortcut')
  const shortcutModifier = window.deskforge.platform === 'darwin' ? '⌘' : 'Ctrl'
  pomodoroShortcutHint.textContent = `Atajo global: ${shortcutModifier}+Shift+P`
  playerShortcutHint.textContent = `Atajo global: ${shortcutModifier}+Shift+Space`

  window.deskforge.onGlobalShortcutCommand((command) => {
    if (command === 'playback-toggle') playToggle.click()
  })

  void window.deskforge.globalShortcutStatus().then((status) => {
    if (!status.pomodoro) {
      pomodoroShortcutHint.textContent = `Atajo no disponible: ${shortcutModifier}+Shift+P está ocupado.`
      pomodoroShortcutHint.classList.add('is-unavailable')
    }
    if (!status.playback) {
      playerShortcutHint.textContent = `Atajo no disponible: ${shortcutModifier}+Shift+Space está ocupado.`
      playerShortcutHint.classList.add('is-unavailable')
    }
  }).catch(() => {
    pomodoroShortcutHint.textContent = 'No se pudo comprobar el atajo global.'
    playerShortcutHint.textContent = 'No se pudo comprobar el atajo global.'
  })

  previousTrack.addEventListener('click', moveToPreviousTrack)
  nextTrack.addEventListener('click', moveToNextTrack)

  playbackProgress.addEventListener('input', () => {
    const track = currentTrack()
    if (track?.nativeFallback && Number.isFinite(nativeAudioFallback.duration)) {
      nativeAudioFallback.currentTime = nativeAudioFallback.duration * Number(playbackProgress.value) / 100
      updatePlaybackProgress()
      return
    }

    const sound = track?.sound
    const duration = sound?.duration()
    if (Number.isFinite(duration) && duration > 0) {
      sound.seek(duration * Number(playbackProgress.value) / 100)
      updatePlaybackProgress()
    }
  })
  volumeLevel.addEventListener('input', () => {
    const volume = Math.round(Number(volumeLevel.value))
    displayVolume(volume)
    lastVolumeInteraction = Date.now()
    if (systemVolumeAvailable) {
      if (volumeChangeTimer !== null) window.clearTimeout(volumeChangeTimer)
      volumeChangeTimer = window.setTimeout(() => {
        volumeChangeTimer = null
        void writeSystemVolume(volume)
      }, 100)
    } else {
      applyAppVolume(volume)
    }
  })

  volumeLevel.addEventListener('change', () => {
    if (!systemVolumeAvailable) return
    if (volumeChangeTimer !== null) window.clearTimeout(volumeChangeTimer)
    volumeChangeTimer = null
    void writeSystemVolume(Math.round(Number(volumeLevel.value)))
  })

  nativeAudioFallback.addEventListener('play', () => {
    if (!currentTrack()?.nativeFallback) return
    playerStatus.textContent = `Reproduciendo: ${currentTrack().name}`
    visualizerStatus.textContent = `Sonido en vivo: ${currentTrack().name}`
    updatePlayerControls()
  })
  nativeAudioFallback.addEventListener('pause', () => {
    if (!currentTrack()?.nativeFallback) return
    playerStatus.textContent = 'Reproducción pausada.'
    visualizerStatus.textContent = 'Visualización pausada.'
    updatePlayerControls()
  })
  nativeAudioFallback.addEventListener('timeupdate', updatePlaybackProgress)
  nativeAudioFallback.addEventListener('loadedmetadata', () => {
    updatePlaybackProgress()
    updatePlayerControls()
  })
  nativeAudioFallback.addEventListener('ended', finishTrack)
  nativeAudioFallback.addEventListener('error', () => {
    if (currentTrack()?.nativeFallback) {
      playerStatus.textContent = 'El formato de esta canción no se pudo abrir en este equipo.'
      updatePlayerControls()
    }
  })

  shuffleToggle.addEventListener('click', () => {
    shuffleEnabled = !shuffleEnabled
    shuffleToggle.textContent = `Mezclar: ${shuffleEnabled ? 'sí' : 'no'}`
    shuffleToggle.setAttribute('aria-pressed', String(shuffleEnabled))
  })

  repeatToggle.addEventListener('click', () => {
    repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off'
    const repeatLabels = { off: 'no', all: 'lista', one: 'canción' }
    repeatToggle.textContent = `Repetir: ${repeatLabels[repeatMode]}`
    repeatToggle.setAttribute('aria-pressed', String(repeatMode !== 'off'))
  })
  window.addEventListener('beforeunload', () => {
    if (volumeChangeTimer !== null) window.clearTimeout(volumeChangeTimer)
    releaseTracks()
  })

  return { audioTracks, playTrack }
}
