import { Request, Response, NextFunction, RequestHandler } from 'express'
import Post from '../models/Post'
import 'express-session'

// interface CustomRequest2 extends Request {
//   session: {
//     views?: {
//       [key: string]: boolean
//     }
//   }
// }

declare module 'express-session' {
  interface Session {
    views: {
      [key: string]: boolean
    }
  }
}

const counterViewMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const postId = req.params.postId
    const userIp = req.ip
    const today = new Date().toDateString()

    console.log('=== COUNTER MIDDLEWARE START ===')
    console.log('Post ID:', postId)
    console.log('User IP:', userIp)
    console.log('Today:', today)
    console.log('Session ID:', req.sessionID)
    console.log('Session:', req.session)

    if (!postId) {
      console.log('No postId - skipping')
      return next()
    }

    // Проверяем существование поста
    const post = await Post.findById(postId)
    if (!post) {
      console.log('Post not found - skipping')
      return next()
    }

    // Проверяем, не просматривал ли пользователь пост сегодня
    const viewKey = `view:${postId}:${userIp}:${today}`

    if (!req.session.views) {
      req.session.views = {}
      console.log('Initialized views object')
    }

    console.log('Current views in session:', req.session.views)

    // Если пользователь еще не просматривал пост сегодня
    if (!req.session.views[viewKey]) {
      console.log('First view today - incrementing')

      const updatedPost = await Post.findByIdAndUpdate(
        postId,
        { $inc: { views: 1 } },
        { new: true },
      )
      console.log('Updated post views:', updatedPost?.views)

      req.session.views[viewKey] = true
      console.log('Set session view key to true')

      // Явно сохраняем сессию и ждём
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('Error saving session:', err)
            reject(err)
          } else {
            console.log('Session saved successfully')
            resolve()
          }
        })
      })
    } else {
      console.log('Already viewed today - skipping')
    }
    console.log('=== COUNTER MIDDLEWARE END ===')
    next()
  } catch (error) {
    console.error('Error counting view:', error)
    next()
  }
}

export default counterViewMiddleware
