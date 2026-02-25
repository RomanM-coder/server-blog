import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'
import asyncWrapper from '../middleware/asyncWrapper'

// Расширяем стандартный JwtPayload
interface CustomJwtPayload extends jwt.JwtPayload {
  userId: string
  email: string
  role: string
}

interface CustomRequest extends Request {
  user: CustomJwtPayload // Добавляем свойство user
}

const authMiddleware = asyncWrapper(
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS') {
      next()
      return
    }
    try {
      const token = req.headers.authorization?.split(' ')[1]

      if (!token) {
        res.status(401).json({ message: 'Нет авторизации.' })
      } else {
        const JWT_SECRET = process.env.JWT_SECRET
        if (!JWT_SECRET) {
          throw new Error(
            'JWT_SECRET is not defined in the environment variables.',
          )
        }
        const decoded = jwt.verify(token, JWT_SECRET) as CustomJwtPayload
        req.user = decoded
        next()
      }
    } catch (e) {
      res.status(401).json({ message: 'Нет авторизации.' })
    }
  },
)

export default authMiddleware
