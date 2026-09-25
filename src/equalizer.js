import { Howler } from 'howler'

const storageKey = 'deskforge:e11:equalizer'
const controls = [
  { id: 'eq-bass', outputId: 'eq-bass-value', key: 'bass' },
  { id: 'eq-mid', outputId: 'eq-mid-value', key: 'mid' },
  { id: 'eq-treble', outputId: 'eq-treble-value', key: 'treble' },
]

export function createEqualizer() {
  const gains = readGains()
  let filters = null
  let connectedOutput = null
  let masterConnected = false

  function updateControls() {
    for (const { id, outputId, key } of controls) {
      document.querySelector('#' + id).value = String(gains[key])
      document.querySelector('#' + outputId).textContent = gains[key] + ' dB'
    }
  }

  function applyGains() {
    if (!filters) return
    filters.bass.gain.value = gains.bass
    filters.mid.gain.value = gains.mid
    filters.treble.gain.value = gains.treble
  }

  function ensureFilters(outputNode) {
    if (!Howler.ctx || !Howler.masterGain) throw new Error('El audio no está listo para el ecualizador.')

    if (!filters) {
      filters = {
        bass: Howler.ctx.createBiquadFilter(),
        mid: Howler.ctx.createBiquadFilter(),
        treble: Howler.ctx.createBiquadFilter(),
      }
      filters.bass.type = 'lowshelf'
      filters.bass.frequency.value = 200
      filters.mid.type = 'peaking'
      filters.mid.frequency.value = 1000
      filters.mid.Q.value = 1
      filters.treble.type = 'highshelf'
      filters.treble.frequency.value = 5000
      filters.bass.connect(filters.mid)
      filters.mid.connect(filters.treble)
      applyGains()
    }

    if (connectedOutput !== outputNode) {
      filters.treble.disconnect()
      filters.treble.connect(outputNode)
      connectedOutput = outputNode
    }
  }

  function connectMasterGainTo(outputNode) {
    ensureFilters(outputNode)
    if (!masterConnected) {
      Howler.masterGain.disconnect()
      Howler.masterGain.connect(filters.bass)
      masterConnected = true
    }
  }

  function connectAudioSource(sourceNode, outputNode) {
    ensureFilters(outputNode)
    sourceNode.connect(filters.bass)
  }

  updateControls()
  for (const { id, key } of controls) {
    document.querySelector('#' + id).addEventListener('input', (event) => {
      gains[key] = clampGain(event.currentTarget.value)
      applyGains()
      updateControls()
      localStorage.setItem(storageKey, JSON.stringify(gains))
    })
  }

  return { connectMasterGainTo, connectAudioSource }
}

function readGains() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    return { bass: clampGain(stored.bass), mid: clampGain(stored.mid), treble: clampGain(stored.treble) }
  } catch {
    return { bass: 0, mid: 0, treble: 0 }
  }
}

function clampGain(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(-12, Math.min(12, Math.round(number))) : 0
}
