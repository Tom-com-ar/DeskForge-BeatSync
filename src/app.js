const platformNames = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
}

const platform = platformNames[window.deskforge?.platform] ?? 'tu escritorio'
document.querySelector('footer').textContent =
  `La ventana se oculta al cerrarla. Podés volver desde el ícono de la bandeja en ${platform}.`
