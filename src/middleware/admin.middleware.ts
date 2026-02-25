import { Request, Response, NextFunction } from 'express'
import asyncWrapper from '../middleware/asyncWrapper'
import dotenv from 'dotenv'
dotenv.config()

// interface CustomRequest extends Request {
//   user: string | jwt.JwtPayload // Добавляем свойство user
// }

const adminMiddleware = asyncWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS') {
      next()
      return
    }
    try {
      // const role = req.headers['x-user-role'] as string

      // if (!role) {
      //   res.status(401).json({ message: 'Нет роли пользователя.' })
      //   return
      // }

      if (req.user.role !== 'admin') {
        res
          .status(403)
          .json({ message: 'Доступ запрещен. Требуется роль администратора.' })
        return
      }

      next()
    } catch (e) {
      res.status(401).json({ message: 'Ошибка проверки роли.' })
    }
  },
)

export default adminMiddleware
