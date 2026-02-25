import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// interface CustomRequest extends Request {
//   user?: any
// }

// Расширяем стандартный JwtPayload
interface CustomJwtPayload extends jwt.JwtPayload {
  userId: string
  email: string
  role: string
}

interface CustomRequest extends Request {
  user: CustomJwtPayload // Добавляем свойство user
}

export const validateTokenMiddleware = async (
  // req: CustomRequest,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.method === 'OPTIONS') {
    next()
    return
  }

  try {
    const token = req.headers.authorization?.split(' ')[1]

    if (token) {
      const JWT_SECRET = process.env.JWT_SECRET
      if (!JWT_SECRET) {
        console.error('JWT_SECRET is not defined')
        // Не прерываем выполнение - продолжаем без пользователя
        req.user = {} as CustomJwtPayload
        next()
        return
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET) as CustomJwtPayload
        req.user = decoded
      } catch (jwtError) {
        // ✅ Просто используем как Error
        const error = jwtError as Error
        // Токен невалидный - просто продолжаем без пользователя
        console.log('JWT verification failed:', error.message)
        // НЕ возвращаем ошибку 401!
        // Устанавливаем "пустой" user чтобы удовлетворить тип
        req.user = {} as CustomJwtPayload
      }
    } else {
      // Нет токена - устанавливаем "пустой" user
      req.user = {} as CustomJwtPayload
    }
    // Продолжаем в любом случае
    next()
  } catch (error) {
    console.error('Unexpected error in validateTokenMiddleware:', error)
    req.user = {} as CustomJwtPayload
    // Продолжаем даже при неожиданных ошибках
    next()
  }
}
