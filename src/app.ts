// server- app.ts
import express, { Router, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import path from 'path'
import mongoose from 'mongoose'
import { Server } from 'socket.io' // Для socket.io
import {createServer} from 'http' // Для создания HTTP-сервера
import config from 'config'
import fileUpload from 'express-fileupload' // Для загрузки файлов
import { I18n } from 'i18n'
import postRouter from './routes/post.routes'
import authRouter from './routes/auth.routes'
import categoryRouter from './routes/category.routes'
import commentRouter from './routes/comment.routes'
import fileRouter from './routes/file.routes'
import adminCategoryRouter from './routes/adminCategory.routes'
import adminPostRouter from './routes/adminPost.routes'
import adminCommentRouter from './routes/adminComment.routes'
import adminFileRouter from './routes/adminFile.routes'
import adminUserRouter from './routes/adminUser.routes'
import adminLogRouter from './routes/adminLog.routes'
import pushNotify from './routes/pushNotify'
import dotenv from "dotenv"
dotenv.config() // Загрузка переменных окружения
// import { config as configEnv} from 'dotenv'
// configEnv()

interface JoinRoomData {
  room: string
  userId: string
}

const i18n = new I18n({
  locales: ['en', 'ru'],
  directory: path.join(__dirname, 'translate'),
  defaultLocale: 'en'
})
const app = express()
// Middleware для парсинга JSON (если используется application/json)
app.use(express.json())
// Middleware для парсинга multipart/form-data
app.use(express.urlencoded({ extended: true }))
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  // allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(fileUpload({}))
// app.use(express.json({ extended: true }))
app.use(i18n.init)
app.use(function (req: Request, res: Response, next) {
  if (req.headers.upgrade === 'websocket') {
    return next() // Пропускаем WebSocket-соединения
  }
  i18n.setLocale(req.headers['accept-language']!)
  console.log('req.headers', req.headers['accept-language'])
  next()
})
// webPush

// if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
//   throw new Error('VAPID keys are missing in the environment variables')
// }

// webPush.setVapidDetails(
//   'mailto:rm.splinter@yandex.ru',
//   // process.env.VAPID_PUBLIC_KEY,
//   // process.env.VAPID_PRIVATE_KEY
//   config.get('VAPID_PUBLIC_KEY'),
//   config.get('VAPID_PRIVATE_KEY')
// )
// io
interface CustomRequestIo extends Request {
  io?: Server // Добавляем свойство io
}

const server = createServer(app)
const io = new Server(server, {
  //    cors: config.get('baseUrl'),
  serveClient: false,
  cors: {
    origin: "*",    
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'], // Разрешаем нужные заголовки
    credentials: true, // Разрешаем передачу кук и токенов
  }
})

app.use((req: CustomRequestIo, res: Response, next: NextFunction) => {
  req.io = io
  next()
})

app.use('/api/auth', authRouter)
app.use('/api/category', categoryRouter)
app.use('/api/post', postRouter)
app.use('/api/comment', commentRouter)
app.use('/api/file', fileRouter)

app.use('/api/admin/category', adminCategoryRouter)
app.use('/api/admin/post', adminPostRouter)
app.use('/api/admin/comment', adminCommentRouter)
app.use('/api/admin/user', adminUserRouter)
app.use('/api/admin/log', adminLogRouter)
// app.use('/api/notify', pushNotify)

// app.use('/api/admin/file', adminFileRouter)
// app.use('/t', require('./routes/redirect.routes'))

// if (process.env.NODE_ENV === 'production') {
//   app.use('/', express.static(json(__dirname, 'client', 'build')))
//   app.get('*', (req, res) => {
//     res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'))
//   })
// }
// "mongoUri": " mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&..appName=mongosh+2.3.1",

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
    socket.join(room)  // Присоединяем пользователя к комнате
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
  // userHandlers(io, socket)
})
const PORT = process.env.PORT || 5000
// const PORT = config.get('port') || 5000

async function start() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in the environment variables.");
    }
    if (!PORT) {
      throw new Error("PORT is not defined in the environment variables.");
    }
    
    // await mongoose.connect(config.get('mongoUri'), {
    await mongoose.connect(process.env.MONGO_URI, {
    })
    server.listen(PORT, () => console.log(`App has been started port ${PORT}`))
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