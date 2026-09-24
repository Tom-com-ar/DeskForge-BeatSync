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
