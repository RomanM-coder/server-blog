// После импортов, но до запуска сервера
import fs from 'fs'
import path from 'path'

// Очистка временных файлов
export const cleanupTempFiles = (): void => {
  const tempDir = '/var/www/blog/server/temp/uploads'

  // Проверяем существование папки
  if (!fs.existsSync(tempDir as fs.PathLike)) {
    fs.mkdirSync(tempDir, { recursive: true })
    return
  }

  fs.readdir(tempDir, (err, files) => {
    if (err) {
      console.error('Ошибка чтения temp директории:', err.message)
      return
    }

    const now = Date.now()
    let deletedCount = 0

    files.forEach((file) => {
      const filePath = path.join(tempDir, file)
      fs.stat(filePath, (err, stats) => {
        if (err) return

        // Удаляем файлы старше 1 часа 30 минут(5400000 с)
        if (now - stats.mtimeMs > 5400000) {
          fs.unlink(filePath, (unlinkErr) => {
            if (!unlinkErr) deletedCount++
          })
        }
      })
    })

    if (deletedCount > 0) {
      console.log(`Очистка temp: удалено ${deletedCount} файлов`)
    }
  })
}
