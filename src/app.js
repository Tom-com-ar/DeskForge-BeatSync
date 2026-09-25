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
