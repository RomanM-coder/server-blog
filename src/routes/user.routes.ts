import * as express from 'express'
import { Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import User from '../models/User'
import authMiddleware from '../middleware/auth.middleware'
import { UploadedFile } from 'express-fileupload'
import { handlerError } from '../handlers/handlerError'

// const FILE_CATEGORY_PATH = process.env.FILE_CATEGORY_PATH
const FILE_REG_PATH = process.env.FILE_REG_PATH

const router = express.default.Router()

router.get('/profile', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user.userId
  try {
    const user = await User.findById(userId)
    if (!user) {
      res
        .status(404)
        .json({ success: false, message: 'profilePage.toast.userNotFound' })
      return
    }

    res.json({ success: true, userProfile: user })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/user get /profile',
      userId: userId, // Безопасная доп. информация
    })
  }
})

router.put('/profile', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user.userId
  try {
    const { firstName, lastName, bio } = req.body

    // ✅ Валидация входных данных
    if (!firstName && !lastName && !bio) {
      res.status(400).json({
        success: false,
        message: 'profilePage.toast.leastOneUpdate',
      })
      return
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { firstName, lastName, bio },
      { new: true },
    )
    // .select('-password') !!
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'profilePage.toast.userNotFound',
      })
      return
    }

    res.json({
      success: true,
      userProfile: user,
      message: 'profilePage.toast.userUpdated',
    })
  } catch (e) {
    handlerError(e, res, { endpoint: '/api/user put /profile', userId: userId })
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
          message: 'profilePage.profileHeader.fileOne',
        })
        return
      }
    }
    next()
  },
  authMiddleware,
  async (req: Request, res: Response) => {
    let oldAvatarPath: string | null = null
    let newAvatarPath: string | null = null

    try {
      if (!req.files || !req.files.avatar) {
        res.status(400).json({
          success: false,
          message: 'profilePage.profileHeader.fileNotLoaded',
        })
        return
      }

      const avatar = req.files.avatar as UploadedFile

      // ✅ Проверка user (теперь из глобального типа)
      if (!req.user?.userId) {
        res.status(401).json({
          success: false,
          message: 'profilePage.profileHeader.invalidUserData',
        })
        return
      }

      const user = await User.findById(req.user.userId)
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'profilePage.profileHeader.userNotFound',
        })
        return
      }

      // Валидация
      if (!avatar.mimetype.startsWith('image/')) {
        res.status(400).json({
          success: false,
          message: 'profilePage.profileHeader.fileIsImage',
        })
        return
      }

      if (avatar.size > 2 * 1024 * 1024) {
        res.status(400).json({
          success: false,
          message: 'profilePage.profileHeader.fileSize',
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

      res.json({
        success: true,
        avatar: user.avatar,
        message: 'profilePage.profileHeader.avatarUpdatedSuccessfully',
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
