// middleware/sessionCookie.ts
import { Request, Response, NextFunction } from 'express'

const ensureSessionCookie = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Сохраняем оригинальные методы
  const originalJson = res.json
  const originalSend = res.send
  const originalEnd = res.end

  // Переопределяем json
  res.json = function (body: any): Response {
    if (req.session?.id && !res.headersSent) {
      res.cookie('sessionId', req.session.id, {
        secure: true,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax', // Временно меняем на lax
        domain: '.splinterblog.ru',
        // sameSite: 'none',
        // path: '/',
      })
      console.log('✅ Cookie set in json for:', req.session.id)
    }
    return originalJson.call(this, body)
  }

  // Переопределяем send
  res.send = function (body?: any): Response {
    if (req.session?.id && !res.headersSent) {
      res.cookie('sessionId', req.session.id, {
        secure: true,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax', // Временно меняем на lax
        domain: '.splinterblog.ru',
        // sameSite: 'none',
        // path: '/',
      })
      console.log('✅ Cookie set in send for:', req.session.id)
    }
    return originalSend.call(this, body)
  }

  next()
}

export default ensureSessionCookie
