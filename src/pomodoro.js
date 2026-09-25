
export function initPomodoro() {
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
  window.deskforge.onGlobalShortcutCommand((command) => {
    if (command === 'pomodoro-toggle') pomodoroToggle.click()
  })
}
