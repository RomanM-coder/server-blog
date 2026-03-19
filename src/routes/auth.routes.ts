import { Router, Request, Response } from 'express'
import * as mongoose from 'mongoose'
import User from '../models/User'
import Token from '../models/Token'
import bcrypt from 'bcrypt'
import { check, validationResult } from 'express-validator'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { Types } from 'mongoose'
import authMiddleware from '../middleware/auth.middleware'
import { handlerError } from '../handlers/handlerError'
import { verifyCaptcha } from '../helper/verifyCaptcha'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import 'express-session'
import { deleteUserSessions } from '../helper/sessionsDelete'

declare module 'express-session' {
  interface SessionData {
    userId: string
    role: string
    views?: {
      [key: string]: boolean
    }
  }
}

// Расширяем тип Request для TypeScript
interface CustomJwtPayload extends jwt.JwtPayload {
  userId: string
  email: string
  role: string
}

declare global {
  namespace Express {
    interface Request {
      t: (key: string, options?: any) => string
      user: CustomJwtPayload
    }
  }
}

interface IUser {
  _id: Types.ObjectId
  email: string
  avatar: string
  firstName?: string
  lastName?: string
  bio?: string
  password: string
  confirmed: boolean
  role: string
  blocked: boolean
  createdAt: Date
  lastLogin?: Date
  votepost: Types.ObjectId[]
  votecomment: Types.ObjectId[]
  commentsCount: number
  postsPublishedId: Types.ObjectId[]
}

// const FILE_REG_PATH = process.env.FILE_REG_PATH
const JWT_SECRET = process.env.JWT_SECRET
const BASE_URL_FRONT = process.env.BASE_URL_FRONT
const router = Router()

// ТОЛЬКО для проверки доступности email (регистрация)
router.post(
  '/check-email',
  [check('email', 'Incorrect email address').not().isEmpty().isEmail()],
  async (req: Request, res: Response) => {
    try {
      const { email } = req.body
      console.log('email=', email)

      const errors = validationResult(req)
      console.log('errors=', errors)
      if (!errors.isEmpty()) {
        res.json({ status: 'invalid' })
        return
      }

      const user = await User.findOne({ email }).select('_id').lean()

      if (user) {
        res.json({ status: 'taken' }) // ← занят
        return
      } else {
        res.json({ status: 'available' }) // ← свободен
        return
      }
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/auth post /check-email',
        email: req.body.email,
      })
    }
  },
)

// для проверки user, есть ли он в базе
// router.get(
//   '/check-user',
//   [check('email', 'Некорректный email').not().isEmpty().isEmail()],
//   async (req: Request, res: Response) => {
//     try {
//       const { email } = req.body
//       console.log('email=', email)

//       const errors = validationResult(req)
//       console.log('errors=', errors)
//       if (!errors.isEmpty()) {
//         res.json({ success: false })
//         return
//       }

//       const user = await User.findOne({ email }).select('_id').lean()

//       if (user) {
//         res.json({ success: true }) // ← есть
//         return
//       } else {
//         res.json({ success: false }) // ← нет
//         return
//       }
//     } catch (error) {
//       console.log('error:', error)

//       res.status(500).json({
//         success: false,
//       })
//     }
//   },
// )

// api/auth/register
router.post(
  '/register',
  [
    check('email', 'Incorrect email address').not().isEmpty().isEmail(),
    check('password', 'The minimum password length is 6 characters')
      .not()
      .isEmpty()
      .isLength({ min: 6 }),
  ],
  async (req: Request, res: Response): Promise<void> => {
    console.log('req.body: ', req.body)

    try {
      const errors = validationResult(req)
      console.log('errors=', errors)
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Incorrect data during registration',
        })
        return
      }
      const { email, password, captchaToken } = req.body

      // Проверяем капчу
      const isValid = await verifyCaptcha(captchaToken)
      // console.log('captchaToken=', captchaToken)

      if (!isValid) {
        res.status(400).json({
          success: false,
          message: 'Captcha verification failed',
        })
        return
      }

      const candidate = await User.findOne({ email })

      if (candidate) {
        res.status(200).json({
          success: false,
          message: 'Such a user already exists',
        })
        return
      }
      const hashedPassword = await bcrypt.hash(password, 12)
      console.log('hashedPassword')

      const user = new User({
        email: email,
        password: hashedPassword,
        votepost: [],
        votecomment: [],
        postsPublishedId: [],
      })
      await user.save()

      console.log(' await user.save')

      res
        .status(200)
        .json({ success: true, message: 'The user has been created' })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/auth post /register',
        email: req.body.email,
      })
    }
  },
)

// api/auth/confirmEmail
router.post('/confirmEmail', async (req, res) => {
  try {
    const email = req.body.email
    const user = await User.findOne({ email })
    if (!user) {
      // ✅ Для безопасности не сообщаем, что пользователь не найден
      res.status(200).json({
        success: true, // Возвращаем success: true чтобы не раскрывать информацию
        message:
          'If a user with this email address exists, they will receive a link to confirm their email address.',
      })
      return
    } else {
      if (!JWT_SECRET) {
        throw new Error(
          'JWT_SECRET is not defined in the environment variables.',
        )
      }
      // const confirm = jwt.sign(
      //   { userId: user._id },
      //   // config.get<string>('jwtSecret'),
      //   JWT_SECRET,
      //   // {expiresIn: 60}
      //   { expiresIn: '1h' },
      // )

      const generateConfirmEmailToken = crypto.randomBytes(32).toString('hex')
      const hashConfirmEmail = crypto
        .createHash('sha256')
        .update(generateConfirmEmailToken)
        .digest('hex')

      const confirmToken = new Token({
        userId: user._id,
        tokenHash: hashConfirmEmail,
      })
      await confirmToken.save()

      const confirmLink = `${BASE_URL_FRONT}/auth/confirm-email/${generateConfirmEmailToken}`
      console.log('confirmLink ', confirmLink)

      const emailTemplate = (username: string, link: string) => `
      <p><b>Hi, ${username}!</b></p>
      <p>To confirm this email, click on the link to the login page of a Simple Blog:</p>
      <p>${link}</p>`
      console.log('emailTemplate ', emailTemplate)

      // HTML шаблон письма 2
      //   const emailTemplate2 = (username: string, link: string) => `
      //   <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      //     <h2 style="color: #333;">Подтверждение email</h2>
      //     <p><b>Здравствуйте, ${username}!</b></p>
      //     <p>Для подтверждения вашего email адреса перейдите по ссылке:</p>
      //     <div style="text-align: center; margin: 20px 0;">
      //       <a href="${link}"
      //          style="background-color: #007bff; color: white; padding: 12px 24px;
      //                 text-decoration: none; border-radius: 4px; display: inline-block;">
      //         Подтвердить Email
      //       </a>
      //     </div>
      //     <p>Если вы не регистрировались в нашем сервисе, проигнорируйте это письмо.</p>
      //     <p><small>Ссылка действительна в течение 1 часа.</small></p>
      //   </div>
      // `

      const transporter = nodemailer.createTransport({
        host: 'smtp.yandex.ru',
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_PROGRAMM || 'rm.splinter@yandex.ru',
          pass: process.env.EMAIL_PASSWORD,
        },
      })

      const mailOptions = {
        from: `"Simple Blog" <${
          process.env.EMAIL_PROGRAMM || 'rm.splinter@yandex.ru'
        }>`,
        to: user.email as string,
        subject: 'Подтверждение email - Simple Blog',
        html: emailTemplate(user.email as string, confirmLink),
        text: `Для подтверждения email перейдите по ссылке: ${confirmLink}`,
      }
      await transporter.sendMail(mailOptions)

      // await sendEmail(
      //   user.email,
      //   "Confirm Email",
      //   emailTemplate(user.email, messageConfirm)
      // )
      console.log('----------------ok--------------')
      // Всегда возвращаем одинаковый ответ для безопасности
      res.status(200).json({
        success: true,
        message:
          'If a user with this email address exists, they will receive a link to confirm their email address.',
      })
    }
  } catch (e) {
    console.log('error', e)
    if (e instanceof Error && e.message.includes('JWT_SECRET')) {
      res.status(500).json({
        success: false,
        message: 'Server configuration error',
      })
    } else {
      handlerError(e, res, {
        endpoint: '/api/auth post /confirmEmail',
        email: req.body.email,
      })
    }
  }
})

// api/auth/informConfirmEmail - get field user.confirmed
router.post(
  '/informConfirmEmail',
  [check('email', 'Некорректный email').not().isEmpty().isEmail()],
  async (req: Request, res: Response) => {
    try {
      const email = req.body.email
      console.log('email ', email)

      const errors = validationResult(req)
      console.log('errors=', errors)
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          confirm: false,
          message: 'Invalid email format',
        })
        return
      }

      const user = await User.findOne({ email })

      if (!user) {
        res.status(404).json({
          success: false,
          confirm: false,
          message: 'User not found',
        })
        return
      }

      res.status(200).json({ success: true, confirm: user.confirmed })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/auth post /informConfirmEmail',
        email: req.body.email,
      })
    }
  },
)

// api/auth/confirm-email/:token
router.get('/confirm-email/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params
    console.log('token: ', token)
    // Проверяем, есть ли токен
    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Token is required',
      })
      return
    }
    // Преобразуем в строку
    // const tokenString = Array.isArray(token) ? token[0] : token

    // Проверяем, что это строка
    if (typeof token !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Invalid token format',
      })
      return
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const tokenBd = await Token.findOne({ tokenHash }).populate('userId')
    console.log('tokenBd: ', tokenBd)
    if (!tokenBd) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired confirmation link',
      })
      return
    }

    const expiryTime = new Date(tokenBd.createdAt.getTime() + 60 * 60 * 1000)
    if (tokenBd.createdAt && new Date() > expiryTime) {
      await Token.findOneAndDelete({ _id: tokenBd._id })
      res.status(400).json({
        success: false,
        message: 'Confirmation link has expired',
      })
      return
    }

    const user = tokenBd.userId as unknown as IUser

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      })
      return
    }
    await User.findByIdAndUpdate(user._id, { confirmed: true })
    await Token.findOneAndDelete({ _id: tokenBd._id })

    res.status(200).json({
      success: true,
      message: 'Email confirmed successfully',
      email: user.email,
    })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/auth get /confirm-email/:token',
    })
  }
})

// limiter для /forget-password эндпоинта
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many attempts, try again in an hour',
  },
  keyGenerator: (req) => {
    const forwardedFor = req.headers['x-forwarded-for']
    const realIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim()

    const detectedIp = req.ip || realIp || req.socket.remoteAddress || 'unknown'

    // 2. 👇 ИСПОЛЬЗУЕМ helper для безопасной работы с IPv6
    // Он автоматически применит маску подсети (по умолчанию /64)
    return ipKeyGenerator(detectedIp)
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// api/auth/forget-password
router.post('/forget-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const email = req.body.email
    const user = await User.findOne({ email })
    if (!user) {
      // ✅ Для безопасности не сообщаем, что пользователь не найден
      //'Если email зарегистрирован, письмо отправлено'
      res.status(200).json({
        success: true, // Возвращаем success: true чтобы не раскрывать информацию
        message:
          'If a user with this email exists, a link to reset the password is sent to them',
      })
      return
    } else {
      if (!JWT_SECRET) {
        throw new Error(
          'JWT_SECRET is not defined in the environment variables.',
        )
      }
      // const forgetPassword = jwt.sign(
      //   { userId: user._id },
      //   // config.get<string>('jwtSecret'),
      //   JWT_SECRET,
      //   // {expiresIn: 60}
      //   { expiresIn: '1h' },
      // )
      const generateResetToken = crypto.randomBytes(32).toString('hex')
      const hashForgetPassword = crypto
        .createHash('sha256')
        .update(generateResetToken)
        .digest('hex')

      const forgetPasswordToken = new Token({
        userId: user._id,
        tokenHash: hashForgetPassword,
      })
      await forgetPasswordToken.save()

      const forgetPasswordLink = `${BASE_URL_FRONT}/auth/reset-password/${generateResetToken}`
      console.log('forgetPasswordLink ', forgetPasswordLink)

      const emailTemplate = (username: string, link: string) => `
      <p><b>Hi, ${username}!</b></p>
      <p>To confirm the password reset, click on the link to the login page of a Simple Blog:</p>
      <p>${link}</p>`
      console.log('emailTemplate ', emailTemplate)

      const transporter = nodemailer.createTransport({
        host: 'smtp.yandex.ru',
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_PROGRAMM || 'rm.splinter@yandex.ru',
          pass: process.env.EMAIL_PASSWORD,
        },
      })

      const mailOptions = {
        from: `"Simple Blog" <${
          process.env.EMAIL_PROGRAMM || 'rm.splinter@yandex.ru'
        }>`,
        to: user.email as string,
        subject: 'Сброс пароля - Simple Blog',
        html: emailTemplate(user.email as string, forgetPasswordLink),
        text: `Для подтверждения сброса пароля перейдите по ссылке: ${forgetPasswordLink}`,
      }
      await transporter.sendMail(mailOptions)

      console.log('----------------ok--------------')
      // Всегда возвращаем одинаковый ответ для безопасности
      res.status(200).json({
        success: true,
        message:
          'If a user with this email exists, a link to reset the password is sent to them',
      })
    }
  } catch (e) {
    console.log('error', e)
    if (e instanceof Error && e.message.includes('JWT_SECRET')) {
      res.status(500).json({
        success: false,
        message: 'Server configuration error',
      })
    } else {
      handlerError(e, res, {
        endpoint: '/api/auth post /forget-password',
        email: req.body.email,
      })
    }
  }
})

// api/auth/forget-password/:token
router.get('/reset-password/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params

    // Проверяем, есть ли токен
    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Token is required',
      })
      return
    }

    // Проверяем, что это строка
    if (typeof token !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Invalid token format',
      })
      return
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    const tokenBd = await Token.findOne({ tokenHash }).populate('userId')
    console.log('token: ', tokenBd)
    if (!tokenBd) {
      res.status(400).json({
        success: false,
        message: 'Invalid or outdated reset link',
      })
      return
    }

    const expiryTime = new Date(tokenBd.createdAt.getTime() + 60 * 60 * 1000)
    if (tokenBd.createdAt && new Date() > expiryTime) {
      await Token.findOneAndDelete({ _id: tokenBd._id })
      res.status(400).json({
        success: false,
        message: 'Reset link has expired',
      })
      return
    }

    const user = tokenBd.userId as unknown as IUser

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      })
      return
    }

    res.status(200).json({
      success: true,
      message: 'Enter a new password',
    })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/auth get /reset-password/:token',
    })
  }
})

// POST - отправка нового пароля
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body // ← токен из формы!

    // Проверяем, есть ли токен
    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Token is required',
      })
      return
    }
    // Проверяем, что это строка
    if (typeof token !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Invalid token format',
      })
      return
    }

    // Проверяем, что пароль есть
    if (!newPassword) {
      res.status(400).json({
        success: false,
        message: 'New password is required',
      })
      return
    }

    // Проверяем, что это строка
    if (typeof newPassword !== 'string') {
      res.status(400).json({
        success: false,
        message: 'New password must be a string',
      })
      return
    }

    console.log('1. Token из запроса:', token)
    console.log('2. Длина токена:', token.length)

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    console.log('3. Хеш токена:', tokenHash)
    console.log('4. Длина хеша:', tokenHash.length)

    console.log('Тип tokenHash в запросе:', typeof tokenHash)
    console.log('Тип tokenHash в схеме:', Token.schema.paths.tokenHash.instance)

    const tokenBd = await Token.findOne({
      tokenHash: tokenHash.toString(),
    }).populate('userId')
    console.log('5. Найдено в базе:', !!tokenBd)

    if (!tokenBd) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired reset link',
      })
      return
    }
    // Проверка срока действия
    const expiryTime = new Date(tokenBd.createdAt.getTime() + 60 * 60 * 1000)
    if (tokenBd.createdAt && new Date() > expiryTime) {
      await Token.findOneAndDelete({ _id: tokenBd._id })
      res.status(400).json({
        success: false,
        message: 'Reset link has expired',
      })
      return
    }

    const user = tokenBd.userId as unknown as IUser

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      })
      return
    }

    // Хешируем и сохраняем новый пароль
    const hashedPassword = await bcrypt.hash(newPassword, 12)
    await User.findByIdAndUpdate(user._id, {
      password: hashedPassword,
    })

    // 🔥 БЕЗОПАСНОЕ УДАЛЕНИЕ СЕССИЙ
    // const deletedCount = await deleteUserSessions(user._id.toString())
    // console.log(`✅ Удалено ${deletedCount} сессий`)

    // Удаляем использованный токен
    await Token.findByIdAndDelete(tokenBd._id)

    res.json({
      success: true,
      message: 'Password has been reset successfully',
    })
  } catch (e) {
    handlerError(e, res)
  }
})

// api/auth/login
router.post(
  '/login',
  [
    check('email', 'Incorrect email address').not().isEmpty().isEmail(),
    check('password', 'Enter the password').not().isEmpty().exists(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req)

      if (!errors.isEmpty()) {
        console.log('errors: ', errors.array())

        res.status(401).json({
          success: false,
          message: 'Incorrect data to log in to the system',
        })
        return
      }
      const { email, password, captchaToken } = req.body

      // Проверяем капчу
      const isValid = await verifyCaptcha(captchaToken)

      if (!isValid) {
        res.status(400).json({
          success: false,
          message: 'Captcha verification failed',
        })
        return
      }
      console.log('email=', email)
      const user = await User.findOne({ email })
      console.log('User=', user)

      if (!user) {
        console.log('User not found')
        res.status(401).json({
          success: false,
          message: 'Incorrect data to log in to the system',
        })
        return
      } else {
        const isMatch = await bcrypt.compare(password, user.password as string)
        if (!isMatch) {
          res.status(401).json({
            success: false,
            message: 'Incorrect data to log in to the system',
          })
          return
        } else {
          console.log('user.id: ---', user.id)
          if (!JWT_SECRET) {
            throw new Error(
              'JWT_SECRET is not defined in the environment variables.',
            )
          }

          const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            // config.get<string>('jwtSecret'),
            JWT_SECRET,
            // {expiresIn: 60}
            { expiresIn: '10h' },
          )

          const writeLastLoginUser = User.findByIdAndUpdate(user.id, {
            lastLogin: new Date(),
          })

          // Сохраняем данные в сессию
          // req.session.userId = user._id.toString()
          // req.session.role = user.role.toString()

          // ✅ ЯВНО СОХРАНЯЕМ
          // await new Promise((resolve, reject) => {
          //   req.session.save((err) => {
          //     if (err) {
          //       console.error('Session save error:', err)
          //       reject(err)
          //     } else {
          //       console.log('Session saved successfully')
          //       resolve(true)
          //     }
          //   })
          // })

          res
            .status(200)
            .json({ success: true, token, userId: user.id, role: user.role })
        }
      }
    } catch (e) {
      console.log('error', e)
      if (e instanceof Error && e.message.includes('JWT_SECRET')) {
        res.status(500).json({
          success: false,
          message: 'Server configuration error',
        })
      } else {
        handlerError(e, res, {
          endpoint: '/api/auth post /login',
          email: req.body.email,
        })
      }
    }
  },
)

// api/auth/role  - исправить учитывая что role в token !!!!!--------------------
router.get('/role', async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ _id: req.query.userid })
    console.log('user---------------------- ', user)
    if (!user) {
      res.status(404).send('There is no such user')
      return
    }

    res.status(200).json({ role: user.role })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/auth get /role',
      userId: req.query.userid,
    })
  }
})

router.get('/validate-token', authMiddleware, (req: Request, res: Response) => {
  // ✅ Валидный токен - 200 OK
  res.status(200).json({
    valid: true,
    user: { id: req.user.userId, email: req.user.email },
  })
})

router.put(
  '/record-login-date',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userLL = await User.findByIdAndUpdate(
        req.user.userId,
        { lastLogin: new Date() },
        { new: true },
      )

      if (userLL) {
        res.status(200).json({ success: true })
      } else {
        res.status(200).json({ success: false })
      }
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/auth put /record-login-date',
        userId: req.user.userId,
      })
    }
  },
)

router.get('/real-user', async (req: Request, res: Response) => {
  try {
    console.log('email:', req.query.email)

    const user = await User.findOne({ email: req.query.email })
    console.log('real-user---------------------- ', user)
    if (!user) {
      res.status(404).json({ success: false })
      return
    } else res.status(200).json({ success: true })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/auth get /real-user',
    })
  }
})

export default router
