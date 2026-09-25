const storageKey = 'deskforge:e12:theme'

export function initTheme() {
  const root = document.documentElement
  const toggle = document.querySelector('#theme-toggle')
  const systemTheme = window.matchMedia('(prefers-color-scheme: light)')

  function applyTheme(theme) {
    root.dataset.theme = theme
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    const nextLabel = nextTheme === 'dark' ? 'oscuro' : 'claro'
    toggle.textContent = theme === 'dark' ? '☀ Tema claro' : '☾ Tema oscuro'
    toggle.setAttribute('aria-label', 'Cambiar a tema ' + nextLabel)
    toggle.title = 'Cambiar a tema ' + nextLabel
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0f172a' : '#f3f6fa'
  }

  const savedTheme = localStorage.getItem(storageKey)
  applyTheme(savedTheme === 'light' || savedTheme === 'dark'
    ? savedTheme
    : systemTheme.matches ? 'light' : 'dark')

  systemTheme.addEventListener('change', (event) => {
    if (!localStorage.getItem(storageKey)) applyTheme(event.matches ? 'light' : 'dark')
  })

  toggle.addEventListener('click', () => {
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(storageKey, nextTheme)
    applyTheme(nextTheme)
  })
}
