import jwt from 'jsonwebtoken'
// import config from 'config'
import { Request, Response, NextFunction, RequestHandler } from 'express'
import asyncWrapper from '../middleware/asyncWrapper'
import dotenv from "dotenv"
dotenv.config() // Загрузка переменных окружения

interface CustomRequest extends Request {
  user: string | jwt.JwtPayload // Добавляем свойство user
}

const authMiddleware = asyncWrapper(async (
  req: CustomRequest, res: Response, next: NextFunction
) => {

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
        throw new Error("JWT_SECRET is not defined in the environment variables.");
      }
      const decoded = jwt.verify(token, JWT_SECRET)        
      req.user = decoded
      next()
    }
  } catch (e) {
    res.status(401).json({ message: 'Нет авторизации.' })
  }
})

export default authMiddleware