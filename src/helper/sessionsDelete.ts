// helper/sessionDelete.ts
import mongoose from 'mongoose'

export async function deleteUserSessions(userId: string): Promise<number> {
  try {
    if (!mongoose.connection.db) {
      console.warn('⚠️ MongoDB не подключена, пропускаем удаление сессий')
      return 0
    }

    const collection = mongoose.connection.db.collection('sessions')
    const result = await collection.deleteMany({
      session: { $regex: `"userId":"${userId}"` },
    })

    console.log(`✅ Удалено ${result.deletedCount} сессий`)
    return result.deletedCount || 0
  } catch (error) {
    console.error('❌ Ошибка при удалении сессий:', error)
    return 0
  }
}
