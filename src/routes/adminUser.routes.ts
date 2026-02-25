import { Router, Request, Response } from 'express'
import { Server } from 'socket.io'
import bcrypt from 'bcrypt'
import { generatePassword } from '../helper/genPassword'
import { UploadedFile } from 'express-fileupload'
import fs from 'fs'
import path from 'path'
import Post from '../models/Post'
import User from '../models/User'
import AdminLogs from '../models/AdminLog'
import Comment from '../models/Comment'
import authMiddleware from '../middleware/auth.middleware'
import adminMiddleware from '../middleware/admin.middleware'
import { Types } from 'mongoose'
import { handlerError } from '../handlers/handlerError'

const router = Router()

const FILE_REG_PATH = process.env.FILE_REG_PATH

interface CustomRequestIo extends Request {
  io?: Server // Добавляем свойство io
}

interface ISection {
  type: string
  content?: string
  path?: string
  alt?: string
  order?: number
}

interface IPost {
  _id: Types.ObjectId
  title: string
  sections: ISection[]
  favorite: number
  nofavorite: number
  views: number
  createdAt: Date
  updatedAt?: Date
  categoryId: string
  userId: string
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

const sortirovka = (dateFilter: {}, sortOptions: {}, sortBy: string) => {
  let localDateFilter = { ...dateFilter }
  let localSortOptions = { ...sortOptions }

  switch (sortBy) {
    case 'fresh':
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      localDateFilter = { createdAt: { $gte: threeDaysAgo } }
      localSortOptions = { createdAt: -1, _id: -1 }
      break

    case 'month': {
      const monthAgo = new Date()
      monthAgo.setMonth(monthAgo.getMonth() - 1)
      localDateFilter = { createdAt: { $gte: monthAgo } }
      localSortOptions = { createdAt: -1, _id: -1 }
      break
    }

    case 'year': {
      const now = new Date()
      const msInYear = 365 * 24 * 60 * 60 * 1000 // 365 дней в миллисекундах
      const yearAgo = new Date(now.getTime() - msInYear)
      yearAgo.setMilliseconds(0)
      localDateFilter = { createdAt: { $gte: yearAgo } }
      localSortOptions = { createdAt: -1, _id: -1 }
      break
    }

    case 'all':
      localSortOptions = { createdAt: -1, _id: -1 }
      break

    case 'popular':
      localDateFilter = {
        $or: [{ views: { $gt: 20 } }, { favorite: { $gt: 20 } }],
      }
      localSortOptions = {
        views: -1,
        favorite: -1,
        createdAt: -1,
        _id: -1,
      }
      break

    default:
      sortOptions = { createdAt: -1, _id: -1 }
  }
  return { dateFilter: localDateFilter, sortOptions: localSortOptions }
}

router.use(authMiddleware, adminMiddleware)

router.get('/allposts&comments', async (req: Request, res: Response) => {
  try {
    const [posts, comments] = await Promise.all([
      Post.find().select('_id'),
      Comment.find().select('_id'),
    ])

    console.log('posts= ', posts.length)
    console.log('comments= ', comments.length)
    res.json({
      success: true,
      posts: posts.map((p) => p._id),
      comments: comments.map((c) => c._id),
    })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/user get /allposts&comments',
    })
  }
})

router.get('/search', async (req: Request, res: Response) => {
  try {
    const {
      q: searchQuery,
      page = 0,
      limit = 3,
      sortBy = 'all',
    } = {
      q: (req.query.q as string) || (req.query.searchString as string) || '',
      page: parseInt(String(req.query.page || '0'), 10),
      limit: parseInt(String(req.query.limit || '3'), 10),
      sortBy: req.query.sortBy?.toString() || 'all',
    }

    // Параметры запроса
    const skip = page * limit
    const queryConditions: any = {}

    // Поиск по тексту
    if (searchQuery && typeof searchQuery === 'string') {
      const searchTerm = searchQuery
      queryConditions.email = { $regex: searchTerm, $options: 'i' }
    }

    // Сортировка
    let dateFilter = {}
    let sortOptions = {}
    const result = sortirovka(dateFilter, sortOptions, sortBy)
    dateFilter = result.dateFilter
    sortOptions = result.sortOptions

    // Объединяем все условия
    const finalQuery = {
      ...queryConditions, // основные условия (поиск по email)
      ...dateFilter, // фильтр по дате
    }

    console.log('Финальный запрос MongoDB в search:', {
      filter: finalQuery,
      sort: sortOptions,
    })

    const users: IUser[] = await User.find(finalQuery)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      // .populate('userId')
      .lean<IUser[]>()

    // outUsers = users
    console.log('queryConditions=', queryConditions)
    console.log('sortOptions=', sortOptions)

    // Общее количество для пагинации
    const countUsers = await User.countDocuments(finalQuery)

    console.log('users=', users)
    console.log('countUsers=', countUsers)
    console.log('dataSeearch=', searchQuery)
    res.status(200).json({ success: true, outUsers: users, countUsers })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/user get /search',
    })
  }
})

router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      page = 0,
      limit = 3,
      sortBy = 'all',
    } = {
      page: parseInt(String(req.query.page || '0'), 10),
      limit: parseInt(String(req.query.limit || '3'), 10),
      sortBy: req.query.sortBy?.toString() || 'all',
    }

    let dateFilter = {}
    let sortOptions = {}
    const result = sortirovka(dateFilter, sortOptions, sortBy)
    dateFilter = result.dateFilter
    sortOptions = result.sortOptions

    console.log('dateFilter=', dateFilter)

    // Выполняем запрос с пагинацией
    const users: any = await User.find(dateFilter)
      .sort(sortOptions)
      .skip(page * limit)
      .limit(limit)
      // .populate('userId')
      // .then((posts) =>
      //   posts.map((post) => ({
      //     ...post.toObject(),
      //     user: post.userId, // Копируем userId в user
      //     userId: undefined, // Удаляем старое поле (опционально)
      //   }))
      // )
      .lean<IUser[]>()
    // или .lean() as unknown as IUser[]
    console.log('users=', users)

    const countUsers = await User.countDocuments(dateFilter)

    if (!users) {
      res.status(200).json({ success: false, message: 'Users not found' })
      return
    }

    res.status(200).json({ success: true, outUsers: users, countUsers })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/user get /',
    })
  }
})

// add new user
router.post(
  '/insert',
  (req, res, next) => {
    // Проверяем количество файлов
    if (req.files) {
      const fileCount = Object.keys(req.files).length
      if (fileCount > 1) {
        res.status(400).json({
          success: false,
          message: 'Maximum 1 file allowed for change avatar',
          forUserId: req.user.userId,
        })
        return
      }
    }
    next()
  },
  async (req: CustomRequestIo, res) => {
    try {
      const {
        email,
        firstName,
        lastName,
        bio,
        role,
        block,
        confirmed,
        createdAt,
        lastLogin,
        votepost,
        votecomment,
      } = req.body
      const blockBool = block === 'true' ? true : false
      const confirmedBool = confirmed === 'true' ? true : false
      const lastLoginDate =
        lastLogin === 'null' ? undefined : new Date(lastLogin)
      const votecommentParse = JSON.parse(votecomment)
      const votepostParse = JSON.parse(votepost)
      const password = generatePassword()
      const hashedPassword = await bcrypt.hash(password, 12)

      if (!Array.isArray(votecommentParse)) {
        // throw new Error('Ожидался массив votecomment')
        res.status(400).json({
          success: false,
          message: 'Expected array votecomment',
          forUserId: req.user.userId,
        })
      }
      if (!Array.isArray(votepostParse)) {
        // throw new Error('Ожидался массив votepost')
        res.status(400).json({
          success: false,
          message: 'Expected array votepost',
          forUserId: req.user.userId,
        })
      }
      const newUser = new User({
        email,
        firstName,
        lastName,
        bio,
        password: hashedPassword,
        role,
        block: blockBool,
        confirmed: confirmedBool,
        createdAt: new Date(createdAt),
        lastLogin: lastLoginDate,
        votepost: votepostParse,
        votecomment: votecommentParse,
      })
      await newUser.save()

      const admin = new AdminLogs({
        adminId: req.user.userId,
        what: `add new user.id=${newUser?._id}`,
      })
      await admin.save()

      const emitMessage = {
        messageKey: 'adminUser.toast.userAdded',
        forUserId: req.user.userId,
      }

      req.io?.to('adminUsers').emit('server_edit_user_response', emitMessage)
      res
        .status(200)
        .json({ success: true, outUser: newUser, forUserId: req.user.userId })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/admin/user post /insert',
      })
    }
  },
)

// update user
router.put(
  '/edit',
  (req, res, next) => {
    // Проверяем количество файлов
    if (req.files) {
      const fileCount = Object.keys(req.files).length
      if (fileCount > 1) {
        res.status(400).json({
          success: false,
          message: 'Maximum 1 file allowed for change avatar',
          forUserId: req.user.userId,
        })
        return
      }
    }
    next()
  },
  async (req: CustomRequestIo, res) => {
    try {
      const {
        id,
        email,
        firstName,
        lastName,
        bio,
        role,
        block,
        confirmed,
        createdAt,
        lastLogin,
        votepost,
        votecomment,
      } = req.body
      const blockBool = block === 'true' ? true : false
      const confirmedBool = confirmed === 'true' ? true : false
      const createdAtDate = new Date(createdAt)
      const lastLoginDate =
        lastLogin === 'null' ? undefined : new Date(lastLogin)
      const votecommentParse = JSON.parse(votecomment)
      const votepostParse = JSON.parse(votepost)
      console.log('votecomment typeof', typeof votecomment)

      if (!Array.isArray(votecommentParse)) {
        // throw new Error('Ожидался массив votecomment')
        res.status(400).json({
          success: false,
          message: 'Expected array votecomment',
          forUserId: req.user.userId,
        })
      }
      if (!Array.isArray(votepostParse)) {
        // throw new Error('Ожидался массив votepost')
        res.status(400).json({
          success: false,
          message: 'Expected array votepost',
          forUserId: req.user.userId,
        })
      }
      const user = await User.findByIdAndUpdate(
        id,
        {
          email,
          firstName,
          lastName,
          bio,
          role,
          block: blockBool,
          confirmed: confirmedBool,
          createdAt: createdAtDate,
          lastLogin: lastLoginDate,
          votepost: votepostParse,
          votecomment: votecommentParse,
        },
        { new: true },
      )

      const adminLogs = new AdminLogs({
        adminId: req.user.userId,
        what: `Edit user(id=${id})`,
      })
      await adminLogs.save()

      const emitMessage = {
        messageKey: 'adminUser.toast.userUpdated',
        forUserId: req.user.userId,
      }

      req.io?.to('adminUsers').emit('server_edit_user_response', emitMessage)
      res
        .status(200)
        .json({ success: true, outUser: user, forUserId: req.user.userId })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/admin/user put /edit',
        userId: req.body.id,
      })
    }
  },
)

// delete user по id
router.delete('/delete/:id', async (req: CustomRequestIo, res) => {
  try {
    const id = new Types.ObjectId(req.params.id as string)
    if (!id) {
      res.status(404).json({
        success: false,
        message: 'User not found',
        forUserId: req.user.userId,
      })
      return
    }
    const user = await User.findByIdAndDelete(id)
    const admin = new AdminLogs({
      adminId: req.user.userId,
      what: `delete user.id=${user?._id}`,
    })
    await admin.save()

    const emitMessage = {
      messageKey: 'adminUser.toast.userDeleted',
      forUserId: req.user.userId,
    }

    req.io?.to('adminUsers').emit('server_edit_user_response', emitMessage)
    res
      .status(200)
      .json({ success: true, outUser: user, forUserId: req.user.userId })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/user delete /delete/:id',
      userId: req.params.id,
    })
  }
})

// selectUser по id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = new Types.ObjectId(req.params.id as string)
    const user = await User.findById(id)
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }
    res.status(200).json({ success: true, outUser: user })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/user get /:id',
      userId: req.user.userId,
    })
  }
})

router.put(
  '/change-avatar',
  (req, res, next) => {
    // Проверяем количество файлов
    if (req.files) {
      const fileCount = Object.keys(req.files).length
      if (fileCount > 1) {
        res.status(200).json({
          success: false,
          message: 'Maximum 1 file allowed for change avatar',
          forUserId: req.user.userId,
        })
        return
      }
    }
    next()
  },
  async (req: Request, res: Response) => {
    let oldAvatarPath: string | null = null
    let newAvatarPath: string | null = null

    try {
      if (!req.files || !req.files.avatar) {
        res
          .status(400)
          .json({
            success: false,
            message: 'File not loaded',
            forUserId: req.user.userId,
          })
        return
      }

      const avatar = req.files.avatar as UploadedFile

      // ✅ Проверка user (теперь из глобального типа)
      if (!req.user?.userId) {
        res
          .status(401)
          .json({
            success: false,
            message: 'Invalid user data',
            forUserId: req.user.userId,
          })
        return
      }

      const user = await User.findById(req.body.userId)
      if (!user) {
        res
          .status(404)
          .json({
            success: false,
            message: 'User not found',
            forUserId: req.user.userId,
          })
        return
      }

      // Валидация
      if (!avatar.mimetype.startsWith('image/')) {
        res.status(400).json({
          success: false,
          message: 'The file must be an image',
          forUserId: req.user.userId,
        })
        return
      }

      if (avatar.size > 2 * 1024 * 1024) {
        res.status(400).json({
          success: false,
          message: 'The file size should not exceed 2MB',
          forUserId: req.user.userId,
        })
        return
      }

      // Сохраняем путь к старому аватару для удаления
      oldAvatarPath =
        user!.avatar !== 'default-avatar.svg'
          ? `${FILE_REG_PATH}/${user!.avatar}`
          : null
      console.log('oldAvatarPath=', oldAvatarPath)

      // Генерируем новое имя файла
      const fileExtension = path.extname(avatar.name).toLowerCase()
      const fileName = `avatar-${user._id}-${Date.now()}${fileExtension}`
      const uploadPath = path.join('uploads', 'avatars', fileName)
      newAvatarPath = uploadPath // Сохраняем для отката при ошибке

      const uploadDir = path.dirname(uploadPath)
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }

      // Перемещаем файл
      await avatar.mv(uploadPath)

      // Обновляем данные пользователя
      user!.avatar = fileName
      // user.avatarOriginalName = avatar.name;
      // user.avatarSize = avatar.size;
      // user.avatarMimeType = avatar.mimetype;
      await user!.save()

      // const file = await File.findOne({ userId: user._id })
      // file!.name = fileName
      // file!.type = fileExtension
      // file!.size = avatar.size
      // file?.save()

      // Удаляем старый аватар (если это не дефолтный)
      if (oldAvatarPath && fs.existsSync(oldAvatarPath)) {
        // try {
        //   fs.unlinkSync(oldAvatarPath)
        // } catch (unlinkError) {
        //   console.error('Ошибка при удалении старого аватара:', unlinkError)
        //   // Не прерываем выполнение если не удалось удалить старый файл
        // }
        const deletionSuccessful = safeDeleteAvatar(
          oldAvatarPath,
          req.user.userId,
        )
        if (!deletionSuccessful) {
          // Можно вернуть предупреждение
          console.log('Старый аватар требует ручного удаления')
        }
      }

      // ✅ Удаляем временный файл express-fileupload
      if (avatar.tempFilePath && fs.existsSync(avatar.tempFilePath)) {
        // try {
        //   fs.unlinkSync(avatar.tempFilePath)
        // } catch (tempError) {
        //   console.error('Ошибка при удалении временного файла:', tempError)
        // }
        const deletionSuccessful = safeDeleteAvatar(
          avatar.tempFilePath,
          req.user.userId,
        )
        if (!deletionSuccessful) {
          // Можно вернуть предупреждение
          console.log('Временный файл требует ручного удаления')
        }
      }

      const admin = new AdminLogs({
        adminId: req.user.userId,
        what: `edit avater of user.id=${user?._id}`,
      })
      await admin.save()

      res.json({
        success: true,
        avatar: user.avatar,
        message: 'Avatar has been successfully updated',
        forUserId: req.user.userId,
      })
    } catch (error) {
      // ✅ Откат: удаляем новый файл если он был загружен
      if (newAvatarPath && fs.existsSync(newAvatarPath)) {
        // try {
        //   fs.unlinkSync(newAvatarPath)
        // } catch (unlinkError) {
        //   console.error(
        //     'Ошибка при удалении нового файла при откате:',
        //     unlinkError
        //   )
        // }
        const deletionSuccessful = safeDeleteAvatar(
          newAvatarPath,
          req.user.userId,
        )
        if (!deletionSuccessful) {
          // Можно вернуть предупреждение
          console.log('Ошибка при удалении нового файла при откате')
        }
      }

      // ✅ Удаляем временный файл express-fileupload
      if (req.files?.avatar) {
        if (!Array.isArray(req.files.avatar)) {
          if (
            req.files?.avatar?.tempFilePath &&
            fs.existsSync(req.files.avatar.tempFilePath)
          ) {
            // try {
            //   fs.unlinkSync(req.files.avatar.tempFilePath)
            // } catch (tempError) {
            //   console.error('Ошибка при удалении временного файла:', tempError)
            // }
            const deletionSuccessful = safeDeleteAvatar(
              req.files?.avatar?.tempFilePath,
              req.user.userId,
            )
            if (!deletionSuccessful) {
              // Можно вернуть предупреждение
              console.log('Ошибка при удалении временного файла при откате')
            }
          }
        }
      } else {
        console.log('Получен массив файлов, а ожидался один файл')
      }
      res.status(500).json({
        success: false,
        message: 'Error updating the avatar',
        forUserId: req.user.userId,
      })
    }
  },
)

const safeDeleteAvatar = (filePath: string, userId: string) => {
  if (!filePath || !fs.existsSync(filePath)) return true

  try {
    // Первая попытка удаления
    fs.unlinkSync(filePath)
    return true
  } catch (error) {
    console.warn('Первая попытка удаления не удалась:', filePath)

    try {
      // Вторая попытка: переименование
      const backupPath = `${filePath}.backup-${Date.now()}`
      fs.renameSync(filePath, backupPath)
      console.log('Файл переименован для последующего удаления:', backupPath)
      return true
    } catch (renameError) {
      // Файл заблокирован - логируем для ручного вмешательства
      if (renameError instanceof Error) {
        console.error(
          'Файл невозможно удалить, требуется ручное вмешательство:',
          {
            path: filePath,
            userId: userId,
            error: renameError.message,
          },
        )
      } else {
        console.error('Файл невозможно удалить, неизвестная ошибка:', {
          path: filePath,
          userId: userId,
          error: String(renameError),
        })
      }
      return false
    }
  }
}

export default router
