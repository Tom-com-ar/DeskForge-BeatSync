# DeskForge + BeatSync

Suite de escritorio para productividad y música, construida con Electron y Vite.

## Punto E1

- Ventana principal redimensionable con menú nativo.
- Bandeja del sistema para volver a abrir la ventana o salir.
- La ventana se oculta al cerrarla para que la aplicación siga disponible en la bandeja.
- `contextIsolation` activado y `nodeIntegration` desactivado.

## Desarrollo

```bash
npm run dev
```

La aplicación se cierra desde **Archivo → Salir** o desde el menú contextual de la bandeja.
