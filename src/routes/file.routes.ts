import * as express from 'express'
import { Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import User from '../models/User'
import File from '../models/File'
import Category from '../models/Category'
import Post from '../models/Post'
import FileCategory from '../models/FileCategory'
import authMiddleware from '../middleware/auth.middleware'
import { UploadedFile } from 'express-fileupload'
import { Types } from 'mongoose'
import { handlerError } from '../handlers/handlerError'

const router = express.default.Router()

interface IFile {
  _id: Types.ObjectId
  name: String
  type: String
  size: Number
  userId: Types.ObjectId
}

router.put(
  '/change-avatar',
  authMiddleware,
  async (req: Request, res: Response) => {
    let oldAvatarPath: string | null = null
    let newAvatarPath: string | null = null

    try {
      if (!req.files || !req.files.avatar) {
        res.status(400).json({ error: 'Файл не загружен' })
        return
      }

      const avatar = req.files.avatar as UploadedFile

      // ✅ Проверка user (теперь из глобального типа)
      if (!req.user?.userId) {
        res.status(401).json({ error: 'Invalid user data' })
        return
      }

      const user = await User.findById(req.user.userId)
      if (!user) {
        res.status(404).json({ error: 'Пользователь не найден' })
        return
      }

      // Валидация
      if (!avatar.mimetype.startsWith('image/')) {
        res.status(400).json({ error: 'Файл должен быть изображением' })
        return
      }

      if (avatar.size > 2 * 1024 * 1024) {
        res.status(400).json({ error: 'Размер файла не должен превышать 2MB' })
        return
      }

      // Сохраняем путь к старому аватару для удаления
      oldAvatarPath =
        user!.avatar !== '/uploads/avatars/default-avatar.png'
          ? user!.avatar!.substring(1)
          : null

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

      const file = await File.findOne({ userId: user._id })
      // if (!file) {

      // } else {
      //    file.name = fileName
      // file.type = fileExtension
      // file.size = avatar.size
      // file.save()
      // }

      file!.name = fileName
      file!.type = fileExtension
      file!.size = avatar.size
      file?.save()

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

      res.json({
        success: true,
        avatar: user.avatar,
        message: 'Аватар успешно обновлен',
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
      res.status(500).json({ error: 'Ошибка при обновлении аватара' })
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

router.get('/download', async (req: Request, res: Response) => {
  try {
    // 2. Поиск категории
    const category = await Category.findById(req.query.id)
    if (!category) {
      res.status(404).json({ message: 'Category not found' })
    } else {
      // 3. Поиск файла категории
      const fileCategory = await FileCategory.findOne({
        categoryId: category._id,
      })
      if (!fileCategory) {
        res.status(404).json({ message: 'File for category not found' })
      } else {
        // 4. Формирование пути (кросс-платформенное)
        const filePath = path.join(
          process.env.FILE_CATEGORY_PATH!,
          category.name,
          fileCategory.name,
        )

        console.log(`Attempting to download: ${filePath}`)
        // 5. Проверка существования файла
        if (!fs.existsSync(filePath)) {
          console.error(`File not found at path: ${filePath}`)
          res.status(404).json({ message: 'File not found on server' })
        } else {
          //6. Определение Content-Type
          const ext = path.extname(fileCategory.name).toLowerCase()
          const mimeTypes: {
            [key: string]: string
            '.png': string
            '.jpg': string
            '.jpeg': string
            '.gif': string
            '.webp': string
            '.svg': string
          } = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
          }
          // 7. Отправка файла
          res.setHeader(
            'Content-Type',
            mimeTypes[ext] || 'application/octet-stream',
          )
          return res.sendFile(filePath)
        }
      }
    }
  } catch (e) {
    console.error('Download error:', e)
    handlerError(e, res, {
      endpoint: 'get /download',
      categoryId: req.query.id,
    })
  }
})

//download PostImage
router.get('/downloadPostImage', async (req: Request, res: Response) => {
  try {
    // 1. Поиск поста
    const post = await Post.findById(req.query.id)
    if (!post) {
      res.status(404).json({ message: 'Post not found' })
      return
    }
    // 2. Поиск файла поста
    const filePost: string = req.query.nameImage as string

    if (!filePost) {
      res.status(404).json({ message: 'File for post not found' })
      return
    }
    // 3. Формирование пути (кросс-платформенное)
    const filePath = path.join(process.env.FILE_POST_PATH!, filePost)

    console.log(`Attempting to download: ${filePath}`)
    // 4. Проверка существования файла
    if (!fs.existsSync(filePath)) {
      console.error(`File not found at path: ${filePath}`)
      res.status(404).json({ message: 'File not found on server' })
      return
    }
    // 5. Определение Content-Type
    const ext = path.extname(filePost).toLowerCase()
    const mimeTypes: {
      [key: string]: string
      '.png': string
      '.jpg': string
      '.jpeg': string
      '.gif': string
      '.webp': string
      '.svg': string
    } = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    }
    // 6. Отправка файла
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    return res.sendFile(filePath)
  } catch (e) {
    console.error('Download error:', e)
    handlerError(e, res, {
      endpoint: '/api/file get /downloadPostImage',
      postId: req.query.id,
    })
  }
})

//download заглушку
router.get('/plug/downloadImage', async (req: Request, res: Response) => {
  try {
    // 1. Поиск файла
    const filePlug: string = req.query.nameImagePlug as string

    if (!filePlug) {
      res.status(404).json({ message: 'File not found' })
      return
    }
    // 2. Формирование пути (кросс-платформенное)
    const filePath = path.join(process.env.FILE_PLUG_PATH!, filePlug)

    console.log(`Attempting to download: ${filePath}`)
    // 3. Проверка существования файла
    if (!fs.existsSync(filePath)) {
      console.error(`File not found at path: ${filePath}`)
      res.status(404).json({ message: 'File not found on server' })
      return
    }
    // 4. Определение Content-Type
    const ext = path.extname(filePlug).toLowerCase()
    const mimeTypes: {
      [key: string]: string
      '.png': string
      '.jpg': string
      '.jpeg': string
      '.gif': string
      '.webp': string
      '.svg': string
    } = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    }
    // 5. Отправка файла
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    return res.sendFile(filePath)
  } catch (e) {
    console.error('Download error:', e)
    handlerError(e, res, {
      endpoint: 'get /plug/downloadImage',
    })
  }
})

//download UserAvatar
router.get('/downloadUserAvatar', async (req: Request, res: Response) => {
  try {
    // 2. Поиск user
    const user = await User.findById(req.query.id)
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }
    // 3. Поиск файла аватара user
    const fileUser: string = req.query.nameImage as string

    if (!fileUser) {
      res.status(404).json({ message: 'File user`s not found' })
      return
    }
    // 4. Формирование пути (кросс-платформенное)
    const filePath = path.join(
      process.env.FILE_REG_PATH!,
      // user._id.toString(),
      // 'avatars',
      fileUser as string,
    )

    console.log(`Attempting to download: ${filePath}`)
    // 5. Проверка существования файла
    if (!fs.existsSync(filePath)) {
      console.error(`File not found at path: ${filePath}`)
      res.status(404).json({ message: 'File not found on server' })
      return
    }
    //6. Определение Content-Type
    const ext = path.extname(fileUser).toLowerCase()
    const mimeTypes: {
      [key: string]: string
      '.png': string
      '.jpg': string
      '.jpeg': string
      '.gif': string
      '.webp': string
      '.svg': string
    } = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    }
    // 7. Отправка файла
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    return res.sendFile(filePath)
  } catch (e) {
    console.error('Download error:', e)
    handlerError(e, res, {
      endpoint: 'get /downloadUserAvatar',
      userId: req.query.id,
    })
  }
})

export default router
