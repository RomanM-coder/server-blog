import jwt from 'jsonwebtoken'
import config from 'config'
import { Request, Response, NextFunction, RequestHandler } from 'express'
import asyncWrapper from '../middleware/asyncWrapper'

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

      const decoded = jwt.verify(token, config.get('jwtSecret'))        
      req.user = decoded
      next()
    }
  } catch (e) {
    res.status(401).json({ message: 'Нет авторизации.' })
  }
})

export default authMiddleware