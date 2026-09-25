import { Howl, Howler } from 'howler'

const platformNames = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
}

const platform = platformNames[window.deskforge?.platform] ?? 'tu escritorio'
document.querySelector('footer').textContent =
  `La ventana se oculta al cerrarla. Podés volver desde el ícono de la bandeja en ${platform}.`

const draftKey = 'deskforge:e2:note'
const noteContent = document.querySelector('#note-content')
const noteName = document.querySelector('#note-name')
const noteStatus = document.querySelector('#note-status')

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey) ?? '{}')
    return typeof draft.content === 'string' ? draft.content : ''
  } catch {
    return ''
  }
}

function saveDraft() {
  try {
    localStorage.setItem(draftKey, JSON.stringify({ content: noteContent.value }))
    noteStatus.textContent = 'Autoguardado localmente'
  } catch {
    noteStatus.textContent = 'No se pudo guardar el borrador local'
  }
}

noteContent.value = loadDraft()
if (noteContent.value) noteStatus.textContent = 'Borrador local recuperado'

noteContent.addEventListener('input', saveDraft)

async function createNote() {
  if (noteContent.value.length && !window.confirm('¿Crear una nota nueva? Se reemplazará el borrador local actual.')) return
  await window.deskforge.newNote()
  noteContent.value = ''
  noteName.textContent = 'Borrador local'
  saveDraft()
  noteContent.focus()
}

async function openNote() {
  if (noteContent.value.length && !window.confirm('¿Abrir otro archivo? Se reemplazará el borrador local actual.')) return
  noteStatus.textContent = 'Seleccioná un archivo para abrir'
  try {
    const result = await window.deskforge.openNote()
    if (result.canceled) {
      noteStatus.textContent = 'Apertura cancelada'
      return
    }
    noteContent.value = result.content
    noteName.textContent = result.fileName
    saveDraft()
  } catch {
    noteStatus.textContent = 'No se pudo abrir el archivo'
  }
}

async function saveNote() {
  noteStatus.textContent = 'Guardando archivo…'
  try {
    const result = await window.deskforge.saveNote(noteContent.value)
    if (result.canceled) {
      noteStatus.textContent = 'Guardado cancelado; el borrador local sigue guardado'
      return
    }
    noteName.textContent = result.fileName
    noteStatus.textContent = `Guardado en ${result.fileName}`
  } catch {
    noteStatus.textContent = 'No se pudo guardar el archivo'
  }
}

document.querySelector('#new-note').addEventListener('click', createNote)
document.querySelector('#open-note').addEventListener('click', openNote)
document.querySelector('#save-note').addEventListener('click', saveNote)

window.deskforge.onFileCommand((command) => {
  if (command === 'new') createNote()
  if (command === 'open') openNote()
  if (command === 'save') saveNote()
})

const POMODORO_TIMES = { focus: 25 * 60 * 1000, break: 5 * 60 * 1000 }
const pomodoroTime = document.querySelector('#pomodoro-time')
const pomodoroPhase = document.querySelector('#pomodoro-phase')
const pomodoroProgress = document.querySelector('#pomodoro-progress')
const pomodoroProgressFill = document.querySelector('#pomodoro-progress-fill')
const pomodoroStatus = document.querySelector('#pomodoro-status')
const pomodoroToggle = document.querySelector('#pomodoro-toggle')
let activePhase = 'focus'
let remainingTime = POMODORO_TIMES[activePhase]
let deadline = null
let timerInterval = null

function updatePomodoroDisplay() {
  const secondsLeft = Math.ceil(remainingTime / 1000)
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const seconds = String(secondsLeft % 60).padStart(2, '0')
  const progress = Math.min(100, Math.max(0, (1 - remainingTime / POMODORO_TIMES[activePhase]) * 100))

  pomodoroTime.textContent = `${minutes}:${seconds}`
  pomodoroTime.setAttribute('aria-label', `${minutes} minutos y ${seconds} segundos restantes`)
  pomodoroPhase.textContent = activePhase === 'focus' ? 'Enfoque' : 'Descanso'
  pomodoroProgress.setAttribute('aria-valuenow', String(Math.round(progress)))
  pomodoroProgressFill.style.width = `${progress}%`
}

function startPomodoro() {
  if (timerInterval !== null) return

  deadline = Date.now() + remainingTime
  timerInterval = window.setInterval(() => {
    remainingTime = Math.max(0, deadline - Date.now())
    updatePomodoroDisplay()
    if (remainingTime === 0) finishPomodoroPhase()
  }, 250)

  pomodoroToggle.textContent = 'Pausar'
  pomodoroStatus.textContent = activePhase === 'focus' ? 'Bloque de enfoque en curso.' : 'Bloque de descanso en curso.'
}

function pausePomodoro() {
  if (timerInterval === null) return

  remainingTime = Math.max(0, deadline - Date.now())
  window.clearInterval(timerInterval)
  timerInterval = null
  deadline = null
  pomodoroToggle.textContent = 'Continuar'
  pomodoroStatus.textContent = activePhase === 'focus' ? 'Enfoque pausado.' : 'Descanso pausado.'
  updatePomodoroDisplay()
}

function finishPomodoroPhase() {
  if (timerInterval === null) return

  window.clearInterval(timerInterval)
  timerInterval = null
  deadline = null
  const finishedPhase = activePhase
  activePhase = finishedPhase === 'focus' ? 'break' : 'focus'
  remainingTime = POMODORO_TIMES[activePhase]
  updatePomodoroDisplay()
  void window.deskforge.notifyPomodoro(finishedPhase).catch(() => {
    pomodoroStatus.textContent = 'El siguiente bloque empezó, pero no se pudo mostrar el aviso nativo.'
  })
  startPomodoro()
}

function resetPomodoro() {
  if (timerInterval !== null) window.clearInterval(timerInterval)
  timerInterval = null
  deadline = null
  activePhase = 'focus'
  remainingTime = POMODORO_TIMES.focus
  pomodoroToggle.textContent = 'Iniciar'
  pomodoroStatus.textContent = 'Listo para iniciar un bloque de enfoque.'
  updatePomodoroDisplay()
}

pomodoroToggle.addEventListener('click', () => {
  if (timerInterval === null) startPomodoro()
  else pausePomodoro()
})
document.querySelector('#pomodoro-reset').addEventListener('click', resetPomodoro)
updatePomodoroDisplay()

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
const visualizerCanvas = document.querySelector('#audio-visualizer')
const visualizerStatus = document.querySelector('#visualizer-status')
const barsMode = document.querySelector('#bars-mode')
const radialMode = document.querySelector('#radial-mode')
const audioTracks = []
let currentTrackIndex = -1
let shuffleEnabled = false
let repeatMode = 'off'
let visualizerMode = 'bars'
let analyser = null
let frequencyData = null
let waveformData = null
let fallbackAudioSource = null
let visualizerFrame = null
let lastProgressUpdate = 0
let canvasWidth = 0
let canvasHeight = 0
let canvasScale = 1

Howler.volume(Number(volumeLevel.value) / 100)

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

function connectVisualizer() {
  if (!Howler.usingWebAudio || !Howler.ctx || !Howler.masterGain) {
    visualizerStatus.textContent = 'El visualizador no está disponible en este equipo.'
    return false
  }

  if (!analyser) {
    analyser = Howler.ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.82
    frequencyData = new Uint8Array(analyser.frequencyBinCount)
    waveformData = new Uint8Array(analyser.fftSize)
    Howler.masterGain.disconnect()
    Howler.masterGain.connect(analyser)
    analyser.connect(Howler.ctx.destination)
  }

  if (Howler.ctx.state === 'suspended') void Howler.ctx.resume()
  return true
}

function startNativeFallback(track) {
  if (currentTrack() !== track || track.nativeFallback) return
  track.nativeFallback = true
  playerStatus.textContent = `Abriendo con el audio del sistema: ${track.name}`
  nativeAudioFallback.pause()
  nativeAudioFallback.src = track.url
  nativeAudioFallback.volume = Number(volumeLevel.value) / 100
  nativeAudioFallback.load()

  try {
    if (connectVisualizer() && !fallbackAudioSource) {
      fallbackAudioSource = Howler.ctx.createMediaElementSource(nativeAudioFallback)
      fallbackAudioSource.connect(analyser)
    }
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
    button.title = track.relativePath

    const name = document.createElement('span')
    name.className = 'track-item-name'
    name.textContent = track.name
    const format = document.createElement('span')
    format.className = 'track-item-format'
    format.textContent = track.extension.toUpperCase()
    button.append(name, format)
    button.addEventListener('click', () => playTrack(index))
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
  libraryFolder.textContent = folderName || 'Carpeta seleccionada'
  libraryCount.textContent = `${audioTracks.length} ${audioTracks.length === 1 ? 'canción' : 'canciones'}`
  libraryStatus.textContent = 'Seleccioná una canción de la lista para reproducirla.'
  playerStatus.textContent = 'Elegí una canción de la biblioteca.'
  visualizerStatus.textContent = 'Reproducí una canción para ver el audio.'
  trackTitle.textContent = 'Elegí una canción'
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
    connectVisualizer()
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
    connectVisualizer()
    sound.play()
  }
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
  const volume = Number(volumeLevel.value) / 100
  Howler.volume(volume)
  nativeAudioFallback.volume = volume
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

function resizeVisualizer() {
  const bounds = visualizerCanvas.getBoundingClientRect()
  canvasScale = Math.max(1, window.devicePixelRatio || 1)
  canvasWidth = Math.max(1, bounds.width)
  canvasHeight = Math.max(1, bounds.height)
  visualizerCanvas.width = Math.round(canvasWidth * canvasScale)
  visualizerCanvas.height = Math.round(canvasHeight * canvasScale)
  visualizerCanvas.getContext('2d').setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
}

function drawBars(context, width, height, accent, success) {
  const values = frequencyData
  const barCount = 44
  const gap = 4
  const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount)
  const sampleStep = values ? Math.max(1, Math.floor(values.length / barCount)) : 1

  for (let index = 0; index < barCount; index += 1) {
    const raw = values
      ? values[index * sampleStep] / 255
      : 0.035 + (Math.sin(Date.now() / 450 + index * 0.48) + 1) * 0.018
    const barHeight = Math.max(3, raw * height * 0.82)
    const x = index * (barWidth + gap)
    const y = height - barHeight
    context.fillStyle = index % 6 === 0 ? success : accent
    context.globalAlpha = 0.52 + raw * 0.48
    context.beginPath()
    context.roundRect(x, y, barWidth, barHeight, Math.min(5, barWidth / 2))
    context.fill()
  }
  context.globalAlpha = 1
}

function drawRadial(context, width, height, accent, success) {
  const centerX = width / 2
  const centerY = height / 2
  const baseRadius = Math.min(width, height) * 0.22
  const maxAmplitude = Math.min(width, height) * 0.17
  const count = 180

  context.beginPath()
  for (let index = 0; index <= count; index += 1) {
    const sampleIndex = Math.floor(index / count * ((waveformData?.length ?? count) - 1))
    const raw = waveformData
      ? (waveformData[sampleIndex] - 128) / 128
      : Math.sin(Date.now() / 400 + index * 0.15) * 0.025
    const radius = baseRadius + raw * maxAmplitude
    const angle = index / count * Math.PI * 2 - Math.PI / 2
    const x = centerX + Math.cos(angle) * radius
    const y = centerY + Math.sin(angle) * radius
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
  context.strokeStyle = accent
  context.lineWidth = 2.5
  context.shadowColor = accent
  context.shadowBlur = 12
  context.stroke()
  context.shadowBlur = 0
  context.beginPath()
  context.arc(centerX, centerY, baseRadius * 0.58, 0, Math.PI * 2)
  context.fillStyle = success
  context.globalAlpha = 0.14
  context.fill()
  context.globalAlpha = 1
}

function animateVisualizer(timestamp = 0) {
  const context = visualizerCanvas.getContext('2d')
  if (canvasWidth === 0 || canvasHeight === 0) resizeVisualizer()
  context.clearRect(0, 0, canvasWidth, canvasHeight)

  const styles = getComputedStyle(document.documentElement)
  const accent = styles.getPropertyValue('--acento').trim() || '#ea671a'
  const success = styles.getPropertyValue('--exito').trim() || '#6ddba1'
  const activeTrack = currentTrack()
  const isAudioPlaying = activeTrack?.nativeFallback
    ? !nativeAudioFallback.paused
    : activeTrack?.sound?.playing()
  if (analyser && isAudioPlaying) {
    analyser.getByteFrequencyData(frequencyData)
    analyser.getByteTimeDomainData(waveformData)
  }

  if (visualizerMode === 'bars') drawBars(context, canvasWidth, canvasHeight, accent, success)
  else drawRadial(context, canvasWidth, canvasHeight, accent, success)

  if (timestamp - lastProgressUpdate > 100) {
    updatePlaybackProgress()
    lastProgressUpdate = timestamp
  }
  visualizerFrame = window.requestAnimationFrame(animateVisualizer)
}

function setVisualizerMode(mode) {
  visualizerMode = mode
  const barsSelected = mode === 'bars'
  barsMode.classList.toggle('is-selected', barsSelected)
  radialMode.classList.toggle('is-selected', !barsSelected)
  barsMode.setAttribute('aria-pressed', String(barsSelected))
  radialMode.setAttribute('aria-pressed', String(!barsSelected))
}

barsMode.addEventListener('click', () => setVisualizerMode('bars'))
radialMode.addEventListener('click', () => setVisualizerMode('radial'))
window.addEventListener('resize', resizeVisualizer)
if ('ResizeObserver' in window) new ResizeObserver(resizeVisualizer).observe(visualizerCanvas)
resizeVisualizer()
visualizerFrame = window.requestAnimationFrame(animateVisualizer)

window.addEventListener('beforeunload', () => {
  if (visualizerFrame !== null) window.cancelAnimationFrame(visualizerFrame)
  releaseTracks()
})
