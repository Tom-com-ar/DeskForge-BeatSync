import { Howler } from 'howler'

export function createVisualizer({ audioElement, getCurrentTrack, updatePlaybackProgress, visualizerStatus, equalizer }) {
  const visualizerCanvas = document.querySelector('#audio-visualizer')
  const barsMode = document.querySelector('#bars-mode')
  const radialMode = document.querySelector('#radial-mode')
  let analyser = null
  let frequencyData = null
  let waveformData = null
  let fallbackAudioSource = null
  let visualizerFrame = null
  let lastProgressUpdate = 0
  let canvasWidth = 0
  let canvasHeight = 0
  let canvasScale = 1
  let visualizerMode = 'bars'
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
      equalizer.connectMasterGainTo(analyser)
      analyser.connect(Howler.ctx.destination)
    }

    if (Howler.ctx.state === 'suspended') void Howler.ctx.resume()
    return true
  }
  function connectAudioElement() {
    if (!connectVisualizer()) return false
    if (!fallbackAudioSource) {
      fallbackAudioSource = Howler.ctx.createMediaElementSource(audioElement)
      equalizer.connectAudioSource(fallbackAudioSource, analyser)
    }
    return true
  }
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
    const activeTrack = getCurrentTrack()
    const isAudioPlaying = activeTrack?.nativeFallback
      ? !audioElement.paused
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
  })

  return { connect: connectVisualizer, connectAudioElement }
}
