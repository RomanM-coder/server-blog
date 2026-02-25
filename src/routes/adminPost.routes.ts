import { Router, Request, Response } from 'express'
import { Server } from 'socket.io'
import Category from '../models/Category'
import Rucategory from '../models/Rucategory'
import User from '../models/User'
import AdminLogs from '../models/AdminLog'
import Post from '../models/Post'
import Rupost from '../models/Rupost'
import Comment from '../models/Comment'
import authMiddleware from '../middleware/auth.middleware'
import adminMiddleware from '../middleware/admin.middleware'
import { UploadedFile } from 'express-fileupload'
import fs from 'fs'
import path from 'path'
import { Types } from 'mongoose'
import { handlerError } from '../handlers/handlerError'

const FILE_POST_PATH = process.env.FILE_POST_PATH

const router = Router()
router.use(authMiddleware, adminMiddleware)

interface CustomRequestIo extends Request {
  //  files?: {
  //   [fieldname: string]: UploadedFile | UploadedFile[]
  // }
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

interface IRuPost {
  _id: Types.ObjectId
  title: string
  sections: ISection[]
  postId: Types.ObjectId
}

interface IPostForm {
  _id: Types.ObjectId
  title: string
  title_ru: string
  sections: ISection[]
  sections_ru: ISection[]
  favorite: number
  nofavorite: number
  // postId: Types.ObjectId
  // categoryId: string //Types.ObjectId
  views: number
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

interface IPostFull extends Omit<IPost, 'userId'> {
  user: IUser
}

interface IPostFullWithComments extends IPostFull {
  countComments: number
}

interface IComment {
  _id: string
  content: string
  createdAt: Date
  like: number
  dislike: number
  owner: string
  related: string | null
  postId: string
}

// Функция для получения IPostFull[] из IPost[]
const getPostsFull = async (
  posts: IPost[],
): Promise<IPostFullWithComments[]> => {
  // Собираем все userId из постов
  const userIds = posts.map((post) => post.userId.toString())
  console.log('userIds-start=', userIds)

  // Один запрос для всех пользователей
  const users = await User.find({
    _id: { $in: userIds },
  }).lean<IUser[]>()

  console.log('users-start=', users)

  // Создаем Map для быстрого доступа
  const userMap = new Map(users.map((user) => [user._id.toString(), user]))
  console.log('userMap-start=', userMap)

  // Собираем все postId для одного запроса комментариев
  const postIds = posts.map((post) => post._id.toString())

  // Один запрос для всех комментариев ко всем постам
  const allComments = await Comment.find({
    postId: { $in: postIds },
  }).lean<IComment[]>()

  // Группируем комментарии по postId
  const commentsByPostId = new Map()
  allComments.forEach((comment) => {
    const postId = comment.postId.toString()
    if (!commentsByPostId.has(postId)) {
      commentsByPostId.set(postId, [])
    }
    commentsByPostId.get(postId).push(comment)
  })

  // Объединяем данные
  const fullPosts: IPostFullWithComments[] = posts
    .map((post) => {
      const user = userMap.get(post.userId.toString())

      if (!user) {
        // Обработка отсутствующего пользователя
        console.warn(`User not found for post ${post._id}`)
        return null
      }

      const postComments = commentsByPostId.get(post._id.toString()) || []
      const countComms = postComments.length

      return {
        _id: post._id,
        title: post.title,
        sections: post.sections,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        favorite: post.favorite,
        nofavorite: post.nofavorite,
        views: post!.views,
        countComments: countComms,
        categoryId: post.categoryId.toString(),
        user: user,
      }
    })
    .filter(Boolean) as IPostFullWithComments[]
  // Убираем null значения

  return fullPosts
}
// функция для получения IRuPostFullWithComments[] из IPost[]
const getRuPostsFull = async (
  posts: IPost[],
  outPosts: IPostFullWithComments[],
): Promise<IPostFullWithComments[]> => {
  // Собираем все Id из en-постов
  const Ids = posts.map((post) => post._id.toString())
  console.log('Ids-start=', Ids)

  // Один запрос для всех ru-постов
  const rupostsAfterDate: IRuPost[] = await Rupost.find({
    postId: { $in: Ids },
  }).lean<IRuPost[]>()
  console.log('rupostsAfterDate-start=', rupostsAfterDate)

  // Создаем Map для быстрого поиска ruPost по postId
  const ruPostMap = new Map(
    rupostsAfterDate.map((ruPost) => [ruPost.postId!.toString(), ruPost]),
  )
  console.log('ruPostMap-start=', ruPostMap)

  // Обновляем посты
  const updatedOutPosts = outPosts.map((post) => {
    const matchingRuPost = ruPostMap.get(post._id.toString())
    if (matchingRuPost) {
      return {
        ...post,
        title: matchingRuPost.title,
        sections: matchingRuPost.sections,
      }
    }
    return post // Если нет соответствия, оставляем оригинальный пост
  })
  return updatedOutPosts
}

const fileProcessing = async (
  files: {
    [fieldname: string]: UploadedFile | UploadedFile[]
  },
  sections: any[],
  sections_ru: any[],
  postFilesDir: string,
): Promise<{ success: boolean; message?: string }> => {
  console.log('files=', files)

  // Перебираем все полученные файлы
  for (const [fieldname, uploadedFile] of Object.entries(files)) {
    console.log(`Processing field: ${fieldname}`)

    // Проверяем, массив ли это (при multiple upload)
    const fileArray = Array.isArray(uploadedFile)
      ? uploadedFile
      : [uploadedFile]

    // Обрабатываем каждый файл в массиве (обычно один)
    for (const file of fileArray) {
      console.log(
        `File: ${file.name}, size: ${file.size}, mimetype: ${file.mimetype}`,
      )

      let index: number
      let isRussian = false
      let targetSections: any[]

      // Определяем, английский это файл или русский
      if (fieldname.startsWith('section_image_')) {
        index = parseInt(fieldname.replace('section_image_', ''))
        targetSections = sections
        isRussian = false
        console.log(`Detected English file for section ${index}`)
      } else if (fieldname.startsWith('section_ru_image_')) {
        index = parseInt(fieldname.replace('section_ru_image_', ''))
        targetSections = sections_ru
        isRussian = true
        console.log(`Detected Russian file for section ${index}`)
      } else {
        console.log(`Unknown fieldname: ${fieldname}, skipping`)
        continue
      }

      // Проверяем валидность индекса и типа секции
      if (
        isNaN(index) ||
        !targetSections[index] ||
        targetSections[index].type !== 'image'
      ) {
        console.log(`Skipping: Invalid index ${index} or not an image section`)
        continue
      }

      console.log(
        `Processing ${
          isRussian ? 'Russian' : 'English'
        } image for section ${index}`,
      )

      // Генерируем уникальное имя файла
      const timestamp = Date.now()
      const fileExtension = path.extname(file.name)
      const languageSuffix = isRussian ? '_ru' : '_en'
      const uniqueFileName = `${timestamp}_${index}${languageSuffix}${fileExtension}`

      // Сохраняем файл
      const uploadPath = path.join(postFilesDir, uniqueFileName)
      console.log(`Saving to: ${uploadPath}`)

      try {
        await file.mv(uploadPath)
        console.log(`✓ File saved: ${uniqueFileName}`)

        // Обновляем путь в соответствующей секции
        targetSections[index].path = uniqueFileName
        console.log(
          `✓ Updated ${
            isRussian ? 'Russian' : 'English'
          } section ${index}.path = ${uniqueFileName}`,
        )
      } catch (mvError) {
        console.error(`Error saving file:`, mvError)
        return {
          success: false,
          message: 'Error saving file',
        }
      }
    }
  }
  return { success: true }
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

// Удаляем старые файлы на основе индекса секции
const deleteOldFilesBySectionIndex = (
  sections: any[],
  sections_ru: any[],
  oldPostEn: IPost,
  oldPostRu: IRuPost,
  files: { [fieldname: string]: UploadedFile | UploadedFile[] },
) => {
  console.log('=== SAFE FILE DELETION ===')

  // Удаляем только в двух случаях:
  // 1. Явная замена файла (пришел новый файл для той же позиции)
  // 2. Секция удалена (ее order не найден в новых секциях)

  const filesToDelete = new Set<string>()
  const oldPostFilesDir = path.join(process.cwd(), 'postFiles')

  // СЛУЧАЙ 1: Явная замена файлов
  // Проверяем, для каких позиций пришли новые файлы
  if (files) {
    Object.keys(files).forEach((fieldname) => {
      if (fieldname.startsWith('section_image_')) {
        const index = parseInt(fieldname.replace('section_image_', ''))
        const oldSection = oldPostEn?.sections?.[index]
        if (oldSection?.type === 'image' && oldSection.path) {
          filesToDelete.add(oldSection.path)
          console.log(`EN section ${index}: ${oldSection.path} → будет заменен`)
        }
      }
      if (fieldname.startsWith('section_ru_image_')) {
        const index = parseInt(fieldname.replace('section_ru_image_', ''))
        const oldSection = oldPostRu?.sections?.[index]
        if (oldSection?.type === 'image' && oldSection.path) {
          filesToDelete.add(oldSection.path)
          console.log(`RU section ${index}: ${oldSection.path} → будет заменен`)
        }
      }
    })
  }

  // СЛУЧАЙ 2: Удаленные секции
  // Собираем все order из новых секций
  const newEnOrders = new Set(
    sections.map((s) => s.order).filter((o) => o !== undefined),
  )
  const newRuOrders = new Set(
    sections_ru.map((s) => s.order).filter((o) => o !== undefined),
  )

  // Проверяем старые секции - если их order нет в новых, значит удалены
  oldPostEn?.sections?.forEach((section) => {
    if (
      section.type === 'image' &&
      section.path &&
      section.order !== undefined
    ) {
      if (!newEnOrders.has(section.order)) {
        filesToDelete.add(section.path)
        console.log(
          `EN order ${section.order}: ${section.path} → секция удалена`,
        )
      }
    }
  })

  oldPostRu?.sections?.forEach((section) => {
    if (
      section.type === 'image' &&
      section.path &&
      section.order !== undefined
    ) {
      if (!newRuOrders.has(section.order)) {
        filesToDelete.add(section.path)
        console.log(
          `RU order ${section.order}: ${section.path} → секция удалена`,
        )
      }
    }
  })

  // Удаляем файлы
  let deletedCount = 0
  filesToDelete.forEach((fileName) => {
    const filePath = path.join(oldPostFilesDir, fileName)
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
        console.log(`✓ Удален: ${fileName}`)
        deletedCount++
      } catch (error) {
        console.error(`Ошибка удаления ${fileName}:`, error)
      }
    }
  })

  console.log(`Всего удалено файлов: ${deletedCount}`)
}

// add new post -- надо совмещать это и file.routes.ts: router.post('/uploadPost'...
router.post('/insert', async (req: CustomRequestIo, res) => {
  try {
    const {
      title,
      title_ru,
      sections: sectionsJson,
      sections_ru: sectionsRuJson,
      adminId,
      favorite,
      nofavorite,
      views,
      categoryId,
    } = req.body

    // Парсим JSON секций
    const sections: any[] = JSON.parse(sectionsJson)
    const sections_ru: any[] = JSON.parse(sectionsRuJson)

    console.log('sections=', sections)
    console.log('sections_ru=', sections_ru)

    console.log('=== SECTIONS PARSED ===')
    console.log('English sections:', JSON.stringify(sections, null, 2))
    console.log('Russian sections:', JSON.stringify(sections_ru, null, 2))

    // Преобразуем req.files в удобный формат
    const files = req.files as {
      [fieldname: string]: UploadedFile | UploadedFile[]
    }

    console.log('Received files:', Object.keys(files))

    // Создаем папку postFiles если ее нет
    // const projectRoot = path.resolve(__dirname, '..', '..') FILE_POST_PATH
    // const postFilesDir = path.join(projectRoot, 'postFiles')
    const postFilesDir = FILE_POST_PATH || '/var/www/blog/server/postFiles'

    if (!fs.existsSync(postFilesDir)) {
      try {
        fs.mkdirSync(postFilesDir, { recursive: true })
        console.log(`Created directory: ${postFilesDir}`)
      } catch (mkdirError) {
        console.error(`Error creating directory ${postFilesDir}:`, mkdirError)
        res.status(400).json({
          success: false,
          message: 'Cannot create FilesDirectory',
        })
        return
      }
    }

    const result = await fileProcessing(
      files,
      sections,
      sections_ru,
      postFilesDir,
    )
    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        forUserId: req.user.userId,
      })
      return
    }

    // Перед сохранением в БД очищаем sections от _id
    const cleanSections = sections.map(({ _id, ...rest }) => rest)
    const cleanSectionsRu = sections_ru.map(({ _id, ...rest }) => rest)

    // Сохраняем в базу данных
    const postData = {
      title: title.toString(),
      title_ru: title_ru.toString(),
      cleanSections,
      cleanSectionsRu,
      categoryId: new Types.ObjectId(categoryId as string),
      favorite: parseInt(favorite),
      nofavorite: parseInt(nofavorite),
      views: parseInt(views),
      adminId: new Types.ObjectId(adminId as string),
      updatedAt: new Date(),
    }

    const post = new Post({
      title: postData.title,
      sections: postData.cleanSections,
      favorite: postData.favorite,
      nofavorite: postData.nofavorite,
      views: postData.views,
      updatedAt: postData.updatedAt,
      categoryId: postData.categoryId,
      userId: postData.adminId,
    })
    await post.save()

    const rupost = new Rupost({
      title: postData.title_ru,
      sections: postData.cleanSectionsRu,
      postId: post._id,
      categoryId: postData.categoryId,
    })
    await rupost.save()

    const user = await User.findById(postData.adminId)
    const arrayPosts = user!.postsPublishedId
    arrayPosts.push(post._id)
    const userWP = await User.findByIdAndUpdate(postData.adminId, {
      postId: arrayPosts,
    })

    const admin = new AdminLogs({
      adminId: postData.adminId,
      what: `insert post.id=${post?._id}`,
    })
    await admin.save()

    const emitMessage = {
      messageKey: 'adminPostPage.toast.addPost',
      forUserId: req.user.userId,
    }

    req.io?.to('adminPosts').emit('server_edit_adminPost_response', emitMessage)

    res
      .status(200)
      .json({ success: true, addedPost: post, forUserId: req.user.userId })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/post post /insert',
    })
  }
})

// favorite/nofavorite post in adminSinglePost
router.put('/like/update', async (req: CustomRequestIo, res) => {
  try {
    console.log('req.body=', req.body)
    const { _id, favorite, nofavorite } = req.body
    const userId = new Types.ObjectId(req.user.userId)

    let outPost: IPostFull

    const user = await User.findById(userId)
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
        forUserId: req.user.userId,
      })
      return
    }

    if (!user?.votepost?.includes(_id)) {
      const post = await Post.findByIdAndUpdate(
        _id,
        { favorite, nofavorite },
        { new: true, timestamps: false },
      ).lean<IPost>()
      console.log('post=', post)

      if (!post) {
        res.status(404).json({
          success: false,
          message: 'Post not found',
          forUserId: req.user.userId,
        })
        return
      }

      const arrayPosts = user.votepost ?? []
      console.log('arrayPosts=', arrayPosts)
      arrayPosts.push(post._id)
      console.log('arrayPosts=', arrayPosts)
      const userVP = await User.findByIdAndUpdate(
        userId,
        { votepost: arrayPosts },
        { new: true },
      )
      console.log('userVP=', userVP)

      outPost = {
        _id: post._id,
        title: post.title,
        sections: post.sections,
        favorite: post.favorite,
        nofavorite: post.nofavorite,
        views: post.views,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        categoryId: post.categoryId,
        user: user,
      }

      if (req.headers['accept-language'] === 'ru') {
        const rupost = await Rupost.findOne({
          postId: post._id.toString(),
        }).lean<IRuPost>()

        outPost = {
          _id: post._id,
          title: rupost?.title || post.title,
          sections: rupost?.sections || post.sections,
          favorite: post.favorite,
          nofavorite: post.nofavorite,
          views: post.views,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          categoryId: post.categoryId,
          user: user,
        }
      }
      console.log('outPost=', outPost)
      res.status(200).json({ success: true, outPost })
    } else {
      const emitMessage = {
        messageKey: 'postPage.toast.voteOnce',
        forUserId: req.user.userId,
      }

      req.io
        ?.to('adminPosts')
        .emit('server_edit_adminPost_response', emitMessage)
      req.io
        ?.to('adminSinglePost')
        .emit('server_edit_adminSinglePost_response', emitMessage)

      res.status(200).json({
        success: false,
        message: 'only once',
        forUserId: req.user.userId,
      })
    }
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/post put /like/update',
      postId: req.body._id,
    })
  }
})

// update title(title_ru) ,sections(sections_ru), favorite, nofavorite, views, files
router.put('/edit', async (req: CustomRequestIo, res) => {
  try {
    // Получаем текстовые данные
    const {
      title,
      title_ru,
      categoryId,
      // nameOld,
      adminId,
      favorite,
      nofavorite,
      views,
      sections: sectionsJson,
      sections_ru: sectionsRuJson,
    } = req.body

    const id = new Types.ObjectId(req.body.id as string)

    if (!id) {
      res.status(404).json({
        success: false,
        message: 'Post not found',
        forUserId: req.user.userId,
      })
      return
    }

    const oldPostEn = (await Post.findById(id)) as IPost
    const oldPostRu = (await Rupost.findById(id)) as IRuPost

    // Парсим JSON секций
    const sections: any[] = JSON.parse(sectionsJson)
    const sections_ru: any[] = JSON.parse(sectionsRuJson)

    console.log('sections=', sections)
    console.log('sections_ru=', sections_ru)

    console.log('=== SECTIONS PARSED ===')
    console.log('English sections:', JSON.stringify(sections, null, 2))
    console.log('Russian sections:', JSON.stringify(sections_ru, null, 2))

    let files: { [fieldname: string]: UploadedFile | UploadedFile[] } = {}

    if (req.files) {
      // Преобразуем req.files в удобный формат
      files = req.files as {
        [fieldname: string]: UploadedFile | UploadedFile[]
      }

      console.log('Received files:', Object.keys(files))

      // Создаем папку postFiles если ее нет
      // const projectRoot = path.resolve(__dirname, '..', '..')
      // const postFilesDir = path.join(projectRoot, 'postFiles')
      const postFilesDir = FILE_POST_PATH || '/var/www/blog/server/postFiles'

      if (!fs.existsSync(postFilesDir)) {
        fs.mkdirSync(postFilesDir, { recursive: true })
        console.log(`Created directory: ${postFilesDir}`)
      }

      const result = await fileProcessing(
        files,
        sections,
        sections_ru,
        postFilesDir,
      )
      if (!result.success) {
        res.status(400).json({
          success: false,
          message: result.message,
          forUserId: req.user.userId,
        })
        return
      }
    }

    console.log('=== FINAL SECTIONS ===')
    console.log(
      'English sections after processing:',
      JSON.stringify(sections, null, 2),
    )
    console.log(
      'Russian sections after processing:',
      JSON.stringify(sections_ru, null, 2),
    )

    // Перед сохранением в БД очищаем sections от _id
    const cleanSections = sections.map(({ _id, ...rest }) => rest)
    const cleanSectionsRu = sections_ru.map(({ _id, ...rest }) => rest)

    // Сохраняем в базу данных
    const postData = {
      title: title.toString(),
      title_ru: title_ru.toString(),
      cleanSections,
      cleanSectionsRu,
      categoryId: new Types.ObjectId(categoryId as string),
      favorite: parseInt(favorite),
      nofavorite: parseInt(nofavorite),
      views: parseInt(views),
      adminId: new Types.ObjectId(adminId as string),
      updatedAt: new Date(),
    }

    console.log('=== UPDATING DATABASE ===')
    // Обновляем английский пост
    const post = await Post.findByIdAndUpdate(
      id,
      {
        title: postData.title,
        sections: postData.cleanSections,
        favorite: postData.favorite,
        nofavorite: postData.nofavorite,
        views: postData.views,
        updatedAt: postData.updatedAt,
      },
      { new: true },
    )
    console.log(`English post updated: ${post ? 'SUCCESS' : 'FAILED'}`)

    console.log('=== DEBUG RUSSIAN SECTIONS BEFORE SAVE ===')
    if (!req.files) {
      console.log('No files in request')
      // Обрабатываем случай без файлов
      sections_ru.forEach((section, index) => {
        if (section.type === 'image') {
          console.log(`Russian section ${index} (no files in request):`, {
            path: section.path,
            alt: section.alt,
            type: section.type,
            order: section.order,
            hasFile: 'NO',
          })
        }
      })
    } else {
      sections_ru.forEach((section, index) => {
        if (section.type === 'image') {
          console.log(`Russian section ${index}:`, {
            path: section.path,
            alt: section.alt,
            type: section.type,
            order: section.order,
            hasFile: files[`section_ru_image_${index}`] ? 'YES' : 'NO',
          })
        }
      })
    }
    // Обновляем русский пост
    const rupost = await Rupost.findOneAndUpdate(
      { postId: id },
      { title: postData.title_ru, sections: postData.cleanSectionsRu },
      { new: true },
    )

    console.log(`Russian post updated: ${rupost ? 'SUCCESS' : 'FAILED'}`)

    deleteOldFilesBySectionIndex(
      sections,
      sections_ru,
      oldPostEn,
      oldPostRu,
      files,
    )

    const admin = new AdminLogs({
      adminId: postData.adminId,
      what: `edit post.id=${post?._id}`,
    })
    await admin.save()

    const emitMessage = {
      messageKey: 'adminPostPage.toast.editComment',
      forUserId: req.user.userId,
    }

    req.io?.to('adminPosts').emit('server_edit_adminPost_response', emitMessage)
    req.io
      ?.to('adminSinglePost')
      .emit('server_edit_adminSinglePost_response', emitMessage)

    const filesReceived = req.files ? Object.keys(files) : ''

    res.status(200).json({
      success: true,
      updatedPost: post,
      forUserId: req.user.userId,
      debug: {
        sectionsProcessed: sections,
        sectionsRuProcessed: sections_ru,
        filesReceived: filesReceived,
      },
    })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/post put /edit',
      postId: req.body.id,
    })
  }
})

// delete post по id
router.delete('/delete/:id', async (req: CustomRequestIo, res) => {
  try {
    const id = req.params.id
    if (!id) {
      res.status(404).json({
        success: false,
        message: 'Post not found',
        forUserId: req.user.userId,
      })
      return
    }
    const deletePost = await Post.findById(id)
    if (!deletePost) {
      res.status(404).json({
        success: false,
        message: 'Post not found',
        forUserId: req.user.userId,
      })
      return
    }
    const deleteRupost = await Rupost.findOne({ postId: deletePost?._id })

    // 2. УДАЛЯЕМ ФАЙЛЫ ПЕРЕД УДАЛЕНИЕМ ПОСТОВ
    const oldPostFilesDir = path.join(process.cwd(), 'postFiles')
    const filesToDelete = new Set<string>()

    // Собираем все файлы из английских секций
    deletePost.sections?.forEach((section) => {
      if (section.type === 'image' && section.path) {
        filesToDelete.add(section.path)
        console.log(`Found EN file to delete: ${section.path}`)
      }
    })

    // Собираем все файлы из русских секций
    deleteRupost?.sections?.forEach((section) => {
      if (section.type === 'image' && section.path) {
        filesToDelete.add(section.path)
        console.log(`Found RU file to delete: ${section.path}`)
      }
    })

    // Удаляем все файлы
    let deletedCount = 0
    filesToDelete.forEach((fileName) => {
      const filePath = path.join(oldPostFilesDir, fileName)
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath)
          console.log(`✓ Deleted file: ${fileName}`)
          deletedCount++
        } catch (error) {
          console.error(`Error deleting ${fileName}:`, error)
        }
      } else {
        console.log(`File not found: ${fileName}`)
      }
    })

    console.log(`Total files deleted: ${deletedCount}`)

    const post = await Post.findByIdAndDelete(id)
    const rupost = await Rupost.findOneAndDelete({ postId: post?._id })

    const admin = new AdminLogs({
      adminId: req.user.userId,
      what: `delete post.id=${post?._id}`,
    })
    await admin.save()

    const emitMessage = {
      messageKey: 'adminSinglePost.toast.deletePost',
      forUserId: req.user.userId,
    }
    req.io?.to('adminPosts').emit('server_edit_adminPost_response', emitMessage)
    req.io
      ?.to('adminSinglePost')
      .emit('server_edit_adminSinglePost_response', emitMessage)

    res.status(200).json({ success: true, post, forUserId: req.user.userId })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/post delete /delete/:id',
      postId: req.params.id,
    })
  }
})

// расширенный русским переводом selectPost
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const post = await Post.findById(req.params.id)

    if (!post) {
      res.status(404).json({ success: false, message: 'Post not found' })
      console.error(`Post not found`)
      return
    }

    const rupost = await Rupost.findOne({ postId: post._id })
    console.log('rupost=', rupost)

    const selectPost: IPostForm = {} as IPostForm
    selectPost._id = post._id
    selectPost.title = post.title
    selectPost.sections = post.sections as unknown as ISection[]
    selectPost.favorite = post.favorite
    selectPost.nofavorite = post.nofavorite
    selectPost.title_ru = rupost?.title || ''
    selectPost.sections_ru = (rupost?.sections as unknown as ISection[]) || []
    selectPost.views = post.views

    console.log('selPost= ', selectPost)
    res.status(200).json({ success: true, selectPost })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/post get /:id',
      postId: req.params.id,
    })
  }
})

// get all posts in category
router.get('/postlist/:categoryId', async (req, res) => {
  try {
    console.log('admin старт all posts in category')

    const categoryId = req.params.categoryId
    console.log('categoryId=', categoryId)

    let category = await Category.findById(categoryId)
    if (!category) {
      res.status(404).json({ message: 'Category not found' })
      return
    }
    let outPosts: IPostFullWithComments[] = []

    const {
      page = 1,
      limit = 3,
      sortBy = 'all',
    } = {
      page: parseInt(String(req.query.page || '1'), 10) || 1,
      limit: parseInt(String(req.query.limit || '3'), 10) || 3,
      sortBy: req.query.sortBy?.toString() || 'all',
    }

    let dateFilter = {}
    let sortOptions = {}
    const result = sortirovka(dateFilter, sortOptions, sortBy)
    dateFilter = result.dateFilter
    sortOptions = result.sortOptions

    // Объединяем все условия
    const finalQuery = {
      categoryId: categoryId, // основные условия (categoryId)
      ...dateFilter, // фильтр по дате
    }
    console.log('finalQuery=', finalQuery)

    // Выполняем запрос с пагинацией
    const posts: any = await Post.find(finalQuery)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(limit)
      // .populate('userId')
      // .then((posts) =>
      //   posts.map((post) => ({
      //     ...post.toObject(),
      //     user: post.userId, // Копируем userId в user
      //     userId: undefined, // Удаляем старое поле (опционально)
      //   }))
      // )
      .lean<IPostFull[]>()
    // или .lean() as unknown as IPost[]
    console.log('posts=', posts)

    const count = await Post.countDocuments(finalQuery)

    if (posts.length > 0) {
      outPosts = await getPostsFull(posts)

      // language = ru
      if (req.headers['accept-language'] === 'ru') {
        outPosts = await getRuPostsFull(posts, outPosts)

        category = await Rucategory.findOne({
          categoryId: req.params.categoryId,
        })
        console.log('category', category)
        console.log('outPosts-ru=', outPosts)
        res.status(200).json({ outPosts, category, count })
        return
      }
    }

    console.log('category', category)
    console.log('posts=', posts)
    res.status(200).json({ outPosts, category, count })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/post get /postlist/:categoryId',
      categoryId: req.params.categoryId,
    })
  }
})

export default router
