// server- app.ts
import dotenv from 'dotenv'
dotenv.config() // Загрузка переменных окружения
import { cleanupTempFiles } from './helper/tempCleanup'
import * as express from 'express'
import { Request, Response, NextFunction } from 'express'
import * as cors from 'cors'
import * as mongoose from 'mongoose'
import * as Server from 'socket.io' // Для socket.io
import * as http from 'http' // Для создания HTTP-сервера
import * as fileUpload from 'express-fileupload' // Для загрузки файлов
import path from 'path'
import MongoStore from 'connect-mongo'
import session from 'express-session'
import postRouter from './routes/post.routes'
import authRouter from './routes/auth.routes'
import categoryRouter from './routes/category.routes'
import commentRouter from './routes/comment.routes'
import fileRouter from './routes/file.routes'
import userRouter from './routes/user.routes'
import adminCategoryRouter from './routes/adminCategory.routes'
import adminPostRouter from './routes/adminPost.routes'
import adminCommentRouter from './routes/adminComment.routes'
import adminUserRouter from './routes/adminUser.routes'
import adminLogRouter from './routes/adminLog.routes'
// import testApiRouter from './routes/test.routes'

interface JoinRoomData {
  room: string
  userId: string
}

const app = express.default()

// 1. Trust Beget proxy (обязательно до всех middleware)
app.set('trust proxy', 1)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

let sessionStore: MongoStore | undefined
// 3. Функция инициализации сессий
function setupSessions() {
  app.use(
    session({
      name: 'sessionId',
      secret:
        process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
      resave: false,
      saveUninitialized: false,
      proxy: true,
      store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI, // ✅ Просто и работает
        dbName: process.env.MONGODB_DB || 'test',
        collectionName: 'sessions',
        ttl: 24 * 60 * 60,
        autoRemove: 'native',
        touchAfter: 24 * 3600,
        stringify: true,
      }),
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        path: '/',
      },
    }),
  )
}

setupSessions() // до роутов !
console.log('✅ Сессии настроены')

app.use(
  cors.default({
    origin:
      process.env.NODE_ENV && process.env.NODE_ENV === 'production'
        ? 'https://splinterblog.ru'
        : 'http://localhost:5173',
    //origin: 'http://localhost:5173', //'*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    // allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }),
)

// Запускаем очистку сразу при старте с обработкой ошибок
try {
  cleanupTempFiles()
  console.log('Очистка временных файлов инициализирована')
} catch (error) {
  console.error('Ошибка при запуске очистки:', error)
}

// И затем каждые 1 час 30 минут
const cleanupInterval = setInterval(cleanupTempFiles, 5400000)

// Останавливаем интервал при завершении приложения (опционально)
process.on('SIGTERM', () => {
  clearInterval(cleanupInterval)
  console.log('Очистка временных файлов остановлена')
})

// app.use('/uploads', express.static('uploads'))
// app.use('/uploads', express.static('/var/www/blog/server/uploads'))

// Кастомный обработчик для fileUpload
app.use((req, res, next) => {
  fileUpload.default({
    createParentPath: true,
    limits: { fileSize: 2 * 1024 * 1024 }, //, files: 1
    abortOnLimit: true,
    // responseOnLimit: getTranslatedLimitMessage(req), // Динамический перевод
    responseOnLimit: 'adminUser.profileHeader.fileSize',
    safeFileNames: true,
    preserveExtension: true,
    useTempFiles: true,
    tempFileDir:
      process.env.NODE_ENV && process.env.NODE_ENV === 'production'
        ? '/var/www/blog/server/temp/uploads'
        : path.join(__dirname, '../temp/uploads/'), // папка для временных файлов
    //tempFileDir: '/var/www/blog/server/temp/uploads',
  })(req, res, next)
})

// app.use(function (req: Request, res: Response, next) {
//   if (req.headers.upgrade === 'websocket') {
//     return next() // Пропускаем WebSocket-соединения
//   }
// const acceptLanguage = req.headers['accept-language']
// if (acceptLanguage && !req.locale) {
//   const locale = acceptLanguage.includes('ru') ? 'ru' : 'en'
//   i18n.setLocale(req, locale)
// }
//   next()
// })

interface CustomRequestIo extends Request {
  io?: Server.Server // Добавляем свойство io
  language?: string
}

const server = http.createServer(app)
const io = new Server.Server(server, {
  //    cors: config.get('baseUrl'),
  serveClient: false,
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    // allowedHeaders: ['Content-Type', 'Authorization'], // Разрешаем нужные заголовки
    credentials: true, // Разрешаем передачу кук и токенов
  },
})

app.use((req: CustomRequestIo, res: Response, next: NextFunction) => {
  req.io = io

  // Функция для безопасного получения строки
  const getLanguage = (): string => {
    // Из query параметров
    if (req.query.lang && typeof req.query.lang === 'string') {
      return req.query.lang
    }
    // Из заголовков
    const acceptLanguage = req.headers['accept-language']
    if (acceptLanguage && typeof acceptLanguage === 'string') {
      return acceptLanguage.split(',')[0]
    }
    // Значение по умолчанию
    return 'en'
  }
  req.language = getLanguage()

  next()
})

// app.use(
//   '/postFiles',
//   express.static(path.join(__dirname, '../postFiles'), {
//     // '/var/www/blog/server/postFiles'
//     maxAge: '1d',
//     etag: true,
//   }),
// )
// app.use('/postFiles', express.static('postFiles'))

app.use('/api/auth', authRouter)
app.use('/api/user', userRouter)
app.use('/api/category', categoryRouter)
app.use('/api/post', postRouter)
app.use('/api/comment', commentRouter)
app.use('/api/file', fileRouter)

app.use('/api/admin/category', adminCategoryRouter)
app.use('/api/admin/post', adminPostRouter)
app.use('/api/admin/comment', adminCommentRouter)
app.use('/api/admin/user', adminUserRouter)
app.use('/api/admin/log', adminLogRouter)
// app.use('/api/test', testApiRouter)

// Статика фронтенда
// app.use(express.static(path.join(__dirname, '../../blog/dist')))
// app.use(express.static('/var/www/blog/react/dist'))

// Fallback маршрут
// app.get('*', (req, res) => {
//   res.sendFile(path.resolve(__dirname, '../../blog/dist', 'index.html'))
// })

// app.get('*', (req, res) => {
//   res.sendFile('/var/www/blog/react/dist/index.html')
// })

// 4. Обработка 404 для API
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.originalUrl} not found`,
  })
})

// 6. Глобальный обработчик 404 (после всего)
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    // documentation: '/api/docs' // если есть
  })
})

io.on('connection', (socket) => {
  console.log('User connected')

  socket.on('joinRoom', (data: JoinRoomData) => {
    const { room, userId } = data
    console.log('joinRoom ---------------- room=', room)
    console.log('joinRoom ----------------- userId=', userId)

    if (!room || !userId) {
      console.error('Invalid data received for joinRoom')
      return
    }
    socket.join(room) // Присоединяем пользователя к комнате
    console.log(`User: ${userId} joined room: ${room}`)
  })

  socket.on('leaveRoom', (data: JoinRoomData) => {
    const { room, userId } = data
    console.log('room=', room)
    console.log('userId=', userId)
    if (!room || !userId) {
      console.error('Invalid data received for joinRoom')
      return
    }
    socket.leave(room) // Отключаем пользователя от комнаты
    console.log(`User: ${userId} left room: ${room}`)
  })

  socket.on('disconnect', () => {
    console.log('A user disconnected')
  })
  socket.on('connection_error', (error) => {
    // Write any connection errors to the console
    console.error(error)
  })
})

const PORT = process.env.PORT || 5000

async function start() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in the environment variables.')
    }
    if (!PORT) {
      throw new Error('PORT is not defined in the environment variables.')
    }
    // Подключаем MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
    // Запуск сервера
    // На Beget с Passenger: app.listen() игнорируется, но не ломает приложение
    // На локалке / VPS: работает как обычно
    server.listen(PORT, () => {
      console.log(`App has been started port ${PORT}`)
    })

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('🔄 Получен SIGINT, закрываем соединения...')

      // 1. Закрываем HTTP-сервер (он всё ещё использует callback)
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log('🔌 HTTP-сервер остановлен')
          resolve()
        })
      })

      // 2. Закрываем MongoDB (возвращает Promise в Mongoose 6+)
      await mongoose.connection.close()
      console.log('🔌 MongoDB отключён')

      // 3. Завершаем процесс
      process.exit(0)
    })

    // server.listen(PORT, () => console.log(`App has been started port ${PORT}`))
  } catch (event) {
    if (event instanceof Error) {
      console.log('Server error:', event.message)
    } else {
      console.log('Unknown error:', event)
    }
    process.exit(1)
  }
}

start()

// Запускаем, если файл выполнен напрямую (не импортирован)
// if (require.main === module) {
//  start();
// }

// Экспортируем app для тестов и Passenger
// export default app;
