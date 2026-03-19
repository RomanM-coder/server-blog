// helper/sessionDeleteLog.ts
import mongoose from 'mongoose'

export async function deleteUserSessions(userId: string): Promise<number> {
  try {
    // 1. Проверка соединения
    if (!mongoose.connection.db) {
      console.warn('⚠️ MongoDB не подключена, пропускаем удаление сессий')
      return 0
    }

    // 2. Проверяем, существует ли коллекция sessions
    const collections = await mongoose.connection.db.listCollections().toArray()
    const hasSessions = collections.some((c) => c.name === 'sessions')

    if (!hasSessions) {
      console.log(
        '📌 Коллекция sessions не найдена — это нормально для первого запуска',
      )
      return 0
    }

    // 3. Пробуем найти документы для этого userId
    const collection = mongoose.connection.db.collection('sessions')
    const beforeCount = await collection.countDocuments({
      session: { $regex: `"userId":"${userId}"` },
    })

    console.log(`🔍 Найдено сессий для userId ${userId}: ${beforeCount}`)

    if (beforeCount === 0) {
      return 0
    }

    // 4. Удаляем
    const result = await collection.deleteMany({
      session: { $regex: `"userId":"${userId}"` },
    })

    console.log(`✅ Удалено ${result.deletedCount} сессий`)
    return result.deletedCount || 0
  } catch (error) {
    // ❗ НЕ ПРОБРАСЫВАЕМ, а детально логируем
    console.error('❌ Ошибка при удалении сессий:', error)

    if (error instanceof Error) {
      console.error('=== ДЕТАЛИ ОШИБКИ ===')
      console.error('Имя:', error.name)
      console.error('Сообщение:', error.message)
      console.error('Стек:', error.stack)

      // Специфичные для MongoDB ошибки
      if (error.name === 'MongoError' || error.name === 'MongoServerError') {
        const mongoError = error as any
        console.error('Код ошибки MongoDB:', mongoError.code)
        console.error('Код доп.:', mongoError.codeName)
      }
    }

    // Возвращаем 0, но НЕ ломаем основной процесс
    return 0
  }
}
