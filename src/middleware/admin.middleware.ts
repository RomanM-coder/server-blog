import config from 'config'
import { Request, Response, NextFunction, RequestHandler } from 'express'
import asyncWrapper from '../middleware/asyncWrapper'

// interface CustomRequest extends Request {
//   user: string | jwt.JwtPayload // Добавляем свойство user
// }

const adminMiddleware = asyncWrapper(async (
  req: Request, res: Response, next: NextFunction
) => {

  if (req.method === 'OPTIONS') {
    next()
    return
  }
  try {
    const role = req.headers.authorization?.split(' ')[2]

    if (!role) {
      res.status(401).json({ message: 'Нет роли пользователя.' })
    } else {

      if (role !== 'admin') {
        res.status(401).json({ message: 'У пользователя нет роли админа.' })
      }      
      next()
    }
  } catch (e) {
    res.status(401).json({ message: 'Нет авторизации.' })
  }
})

export default adminMiddleware