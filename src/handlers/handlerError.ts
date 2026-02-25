import { Response } from 'express'

function getStatusCode(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as any

    if (errorObj.statusCode) return errorObj.statusCode
    if (errorObj.name === 'ValidationError') return 400
    if (errorObj.name === 'UnauthorizedError') return 401
    if (errorObj.name === 'ForbiddenError') return 403
    if (errorObj.name === 'NotFoundError') return 404
  }

  return 500 // По умолчанию
}

function getClientMessage(error: unknown, isDevelopment: boolean): string {
  // В production - общие сообщения
  if (!isDevelopment) {
    if (error instanceof Error) {
      if (error.name === 'ValidationError') return 'Validation failed'
      if (error.name === 'MongoError') return 'Database error'
    }
    return 'Internal server error'
  }

  // В development - детализированные сообщения
  if (error instanceof Error) {
    return `Error: ${error.message}`
  }

  return 'Unknown error occurred'
}

export function handlerError(
  error: unknown,
  res: Response,
  additionalInfo?: Record<string, any>,
): void {
  // ✅ Детальное логирование для разработки
  if (error instanceof Error) {
    console.error('Server error details:', {
      message: error instanceof Error ? error.message : 'No error message',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      type: error instanceof Error ? error.constructor.name : typeof error,
    })
  } else {
    console.error('Unknown error: ', error)
  }

  if (additionalInfo) {
    console.error('Additional context:', additionalInfo)
  }
  console.error('=================================')

  // В зависимости от среды можем показывать разную информацию
  const isDevelopment = process.env.NODE_ENV === 'development'

  // Формируем безопасный ответ
  const statusCode = getStatusCode(error)
  const clientMessage = getClientMessage(error, isDevelopment)

  // ✅ Безопасный ответ для клиента (без утечки деталей)
  res.status(statusCode).json({
    success: false,
    message: clientMessage,
    ...(isDevelopment && { errorId: Date.now().toString(36) }),
  })
}
