import { Router, Request, Response } from 'express'
import { Server } from 'socket.io'
import { UploadedFile } from 'express-fileupload'
import fs from 'fs'
import fileService from './fileService'
import Category from '../models/Category'
import AdminLogs from '../models/AdminLog'
import Rucategory from '../models/Rucategory'
import FileCategory from '../models/FileCategory'
import authMiddleware from '../middleware/auth.middleware'
import adminMiddleware from '../middleware/admin.middleware'
import { Types, SortOrder } from 'mongoose'
import { handlerError } from '../handlers/handlerError'
import jwt from 'jsonwebtoken'

const router = Router()

// interface CustomRequestIo extends Request {
//   io?: Server // Добавляем свойство io
// }

interface CustomJwtPayload extends jwt.JwtPayload {
  userId: string
  email: string
  role: string
}

interface CustomRequestIo extends Request {
  io?: Server // Добавляем свойство io
  user: CustomJwtPayload // Добавляем свойство user
}

interface ICategory {
  _id: Types.ObjectId
  name: string
  link: string
  description: string
}

interface IRuCategory {
  _id: Types.ObjectId
  name: string
  description: string
  categoryId: Types.ObjectId
}

interface ICategoryForm {
  _id: Types.ObjectId
  name: string
  name_ru: string
  description: string
  description_ru: string
  file: string
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

// функция для получения IRuCategoryFull[] из ICategory[]
const getRuCategories = async (
  categories: ICategory[],
  outCategories: ICategory[],
): Promise<ICategory[]> => {
  // Собираем все Id из en-категорий
  const Ids = categories.map((category) => category._id.toString())

  // Один запрос для всех ru-категорий
  const rucategories: IRuCategory[] = await Rucategory.find({
    categoryId: { $in: Ids },
  }).lean<IRuCategory[]>()

  // Создаем Map для быстрого поиска ruCategory по categoryId
  const ruCategoryMap = new Map(
    rucategories.map((ruCategory) => [
      ruCategory.categoryId!.toString(),
      ruCategory,
    ]),
  )

  // Обновляем категории
  outCategories = categories.map((category) => {
    const matchingRuCategory = ruCategoryMap.get(category._id.toString())
    if (matchingRuCategory) {
      return {
        ...category,
        name: matchingRuCategory.name,
        description: matchingRuCategory.description,
      }
    }
    return category // Если нет соответствия, оставляем оригинал категории(en)
  })
  return outCategories
}

const FILE_CATEGORY_PATH = process.env.FILE_CATEGORY_PATH

// const upload = multer({ dest: 'categoryFiles/' })
router.use(authMiddleware, adminMiddleware)

// add new category (add form)
router.post('/insert', async (req: CustomRequestIo, res: Response) => {
  try {
    const { name, name_ru, description, description_ru } = req.body
    const file = req.files?.file as UploadedFile
    console.log('name=', name)
    console.log('name_ru=', name_ru)
    console.log('description=', description)
    console.log('description_ru=', description_ru)
    console.log('file=', file)

    const category = new Category({
      name,
      link: file.name,
      description,
    })
    await category.save()

    const category_ru = new Rucategory({
      name: name_ru,
      description: description_ru,
      categoryId: category._id,
    })
    await category_ru.save()

    const admin = new AdminLogs({
      adminId: req.user.userId,
      what: `insert category.id=${category?._id}`,
    })
    await admin.save()

    // add fileCategory
    // const FILE_CATEGORY_PATH = process.env.FILE_CATEGORY_PATH
    const dirPath = `${FILE_CATEGORY_PATH}\\${name}`
    if (fs.existsSync(dirPath)) {
      res.status(400).json({ message: 'Directory already exist' })
      return
    }
    // console.log('filePath ', filePath)
    await fileService.createDir(dirPath)

    const filePath = `${FILE_CATEGORY_PATH}\\${name}\\${file.name}`
    file.mv(filePath)

    const type = file.name.split('.').pop()
    const newFile = {
      name: file.name,
      type: type,
      size: file.size,
      categoryId: category._id,
    }
    console.log('newFileCat=', newFile)
    const dbFile = new FileCategory(newFile)

    await dbFile.save()
    const emitMessage = {
      messageKey: 'adminCatList.toast.categoryAdded',
    }

    req.io
      ?.to('adminCategories')
      .emit('server_edit_category_response', emitMessage)
    res.status(200).json({ message: 'ok' })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/category post /insert',
    })
  }
})

// update name, link, description in Category(edit form)
// update all fields in FileCategory
router.put('/edit', async (req: CustomRequestIo, res: Response) => {
  try {
    const { name, nameOld, name_ru, id, description, description_ru } = req.body
    const file = req.files?.file as UploadedFile
    console.log('name=', name)
    console.log('name_ru=', name_ru)
    console.log('description=', description)
    console.log('description_ru=', description_ru)
    console.log('nameOld=', nameOld)
    console.log('id=', id)
    console.log('file=', file)

    if (name === nameOld) {
      const category = await Category.findByIdAndUpdate(
        id,
        { name, link: file.name, description },
        { new: true },
      )
      const category_ru = await Rucategory.findOneAndUpdate(
        { categoryId: category?._id },
        { name, description: description_ru },
        { new: true },
      )

      const oldNameFile = await FileCategory.findOne({ categoryId: id })
      // const FILE_CATEGORY_PATH = process.env.FILE_CATEGORY_PATH
      const fileDeletePath = `${FILE_CATEGORY_PATH}\\${name}\\${
        oldNameFile!.name
      }`
      fs.unlinkSync(fileDeletePath)
      console.log('file deleted')

      const filePath = `${FILE_CATEGORY_PATH}\\${name}\\${file.name}`
      file.mv(filePath)

      const type = file.name.split('.').pop()
      const newNameFile = await FileCategory.findByIdAndUpdate(
        oldNameFile!._id,
        { name: file.name, type: type, size: file.size },
        { new: true },
      )

      await newNameFile!.save()

      const admin = new AdminLogs({
        adminId: req.user.userId,
        what: `edit category.id=${category?._id}`,
      })
      await admin.save()

      // io
      console.log('-----req.io------', req.io)
      const emitMessage = {
        messageKey: 'adminCatList.toast.categoryUpdated',
      }

      req.io
        ?.to('adminCategories')
        .emit('server_edit_category_response', emitMessage)
      res.status(200).json({ category })
    } else {
      // delete file in dir
      const nameDeleteFile = await FileCategory.findOne({ categoryId: id })
      console.log('nameDeleteFile=', nameDeleteFile)
      // const FILE_CATEGORY_PATH = process.env.FILE_CATEGORY_PATH
      const oldFileDeletePath = `${FILE_CATEGORY_PATH}\\${nameOld}\\${
        nameDeleteFile!.name
      }`
      fs.unlinkSync(oldFileDeletePath)
      // delete old dir
      fs.rmdirSync(`${FILE_CATEGORY_PATH}\\${nameOld}`)
      console.log('---------ok1-------')
      const category = await Category.findByIdAndUpdate(
        id,
        { name, link: file.name, description },
        { new: true },
      )
      console.log('category=', category)
      const category_ru = await Rucategory.findOneAndUpdate(
        { categoryId: category?._id },
        { name, description: description_ru },
        { new: true },
      )

      const admin = new AdminLogs({
        adminId: req.params.adminId,
        what: `edit category.id=${category?._id}`,
      })
      await admin.save()

      const dirPath = `${FILE_CATEGORY_PATH}\\${name}`
      if (fs.existsSync(dirPath)) {
        res.status(400).json({ message: 'Directory already exist' })
        return
      }
      // create new dir
      await fileService.createDir(dirPath)
      console.log('---------ok2-------')
      const filePath = `${FILE_CATEGORY_PATH}\\${name}\\${file.name}`
      console.log('filePath=', filePath)
      file.mv(filePath)

      const type = file.name.split('.').pop()
      const newNameFile = await FileCategory.findByIdAndUpdate(
        nameDeleteFile!._id,
        { name: file.name, type: type, size: file.size },
        { new: true },
      )
      console.log('newNameFile=', newNameFile)
      await newNameFile!.save()

      const admin_newCat = new AdminLogs({
        adminId: req.params.adminId,
        what: `create new category.id=${category?._id}`,
      })
      await admin_newCat.save()
      // Emiting message
      console.log('-----req.io------', req.io)

      const emitMessage = {
        messageKey: 'adminCatList.toast.categoryUpdated',
      }

      req.io
        ?.to('adminCategories')
        .emit('server_edit_category_response', emitMessage)
      res.status(200).json({ category })
    }
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/category put /edit',
      categoryId: req.body.id,
    })
  }
})

// delete category по id
router.delete('/delete/:id', async (req: CustomRequestIo, res: Response) => {
  try {
    const id = req.params.id
    // delete dir + file
    const nameFileCategory = await Category.findOne({ _id: id })
    if (nameFileCategory) {
      const filePath = `${FILE_CATEGORY_PATH}\\${nameFileCategory.name}\\${nameFileCategory.link}`
      if (!fs.existsSync(filePath)) {
        res.status(400).json({ message: 'Файла по пути нет' })
        return
      }
      fs.unlinkSync(filePath)
      fs.rmdirSync(`${FILE_CATEGORY_PATH}\\${nameFileCategory.name}`)

      // delete FileCategory in BD
      const fileCategory = await FileCategory.findOneAndDelete({
        categoryId: id,
      })

      // delete Category
      const category = await Category.findByIdAndDelete(req.params.id)
      const category_ru = await Rucategory.findOneAndDelete({
        categoryId: category?._id,
      })

      const admin = new AdminLogs({
        adminId: req.user.userId,
        what: `delete category.id=${category?._id}`,
      })
      await admin.save()

      const emitMessage = {
        messageKey: 'adminCatList.toast.categoryDeleted',
      }

      req.io
        ?.to('adminCategories')
        .emit('server_edit_category_response', emitMessage)
      res.status(200).json(category)
    }
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/category delete /delete/:id',
      categoryId: req.params.id,
    })
  }
})
// расширенный русским переводом selectCategory
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const category = await Category.findById(req.params.id)

    if (!category) {
      res.status(404).json({ success: false, message: 'Category not found' })
      return
    }
    const rucategory = await Rucategory.findOne({ categoryId: category!._id })
    console.log('rucategories=', rucategory)

    const selectCategory: ICategoryForm = {} as ICategoryForm
    selectCategory._id = category._id
    selectCategory.name = category.name
    selectCategory.description = category.description
    selectCategory.file = category.link
    selectCategory.name_ru = rucategory?.name || ''
    selectCategory.description_ru = rucategory?.description || ''

    console.log('cats= ', selectCategory)
    res.status(200).json({ success: true, selectCategory })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/category get /:id',
      categoryId: req.params.id,
    })
  }
})

router.get('/list/pagination', async (req: Request, res: Response) => {
  try {
    let outCategories: ICategory[] = []
    const sortField = req.query.sortfield as string
    const sortParam = req.query.sortparam as 'true' | 'false'

    if (!sortField || !['true', 'false'].includes(sortParam)) {
      res.status(400).json({ message: 'Invalid sort field or sort param' })
      return
    }

    // Создаем объект сортировки
    const sortObject: { [key: string]: SortOrder } = {
      [sortField]: sortParam === 'false' ? -1 : 1,
    }

    // const limit: number = Number(req.query.limit)
    const limit: number = parseInt(String(req.query.limit || '3'), 10) || 3
    // const skip: number = Number(req.query.skip)
    const skip: number = parseInt(String(req.query.skip || '0'), 10) || 0

    console.log('limit=', limit)
    console.log('skip=', skip)
    console.log('sortField=', sortField)
    console.log('sortParam=', sortParam)
    let categoriesItems: ICategory[] = await Category.find()
      .sort(sortObject)
      .skip(skip)
      .limit(limit)
    // .aggregate([
    //   { $skip : skip },
    //   { $limit : limit },
    //   {  $sort : { [sortField]: sortParam } }
    // ])

    // Общее количество для пагинации
    const countCategories = await Category.countDocuments()

    //  language = ru
    if (req.headers['accept-language'] === 'ru') {
      const rucategories: IRuCategory[] = await Rucategory.find()
      // console.log('rucategories=', rucategories)
      if (rucategories.length === 0) {
        res.status(404).json({ message: 'No rucategories found' })
        return
      }
      // Создаем Map для быстрого поиска по categoryId
      const ruCategoriesMap = new Map<string, IRuCategory>()
      rucategories.forEach((ruCat) => {
        ruCategoriesMap.set(ruCat.categoryId.toString(), ruCat)
      })

      categoriesItems.map((category: ICategory) => {
        console.log('category._id=', category._id)

        const rucategory = ruCategoriesMap.get(category._id.toString())
        console.log('rucategory=', rucategory)

        if (!rucategory) {
          console.warn(`❌ Перевод не найден для category ${category._id}`)
          // Fallback на английскую версию
          outCategories.push({
            _id: category._id,
            name: category.name,
            description: category.description,
            link: category.link,
          })
          return
        }

        outCategories.push({
          _id: category._id,
          name: rucategory.name,
          description: rucategory.description,
          link: category.link,
        })
      })
      console.log('cats= ', outCategories)
      categoriesItems = outCategories
    }

    res.status(200).json({ categoriesItems, count: countCategories })
    console.log('categoriesItems=', categoriesItems)
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/category get /list/pagination',
    })
  }
})

router.get('/all/count', async (req: Request, res: Response) => {
  try {
    const categories = await Category.find()
    const categoriesCount = categories.length

    res.status(200).json(categoriesCount)
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/category get /all/count',
    })
  }
})

// get categories по search
router.get('/search/query', async (req: Request, res: Response) => {
  try {
    console.log('admin start get categories по  /:search')
    let outCategories: ICategory[] = []
    let categories: ICategory[] = []
    let countCategories: number = 0
    const {
      q: searchQuery,
      page = 0,
      limit = 3,
      sortBy = 'all',
    } = {
      q: req.query.q || req.query.searchString || '',
      page: parseInt(String(req.query.page || '0'), 10),
      limit: parseInt(String(req.query.limit || '3'), 10),
      sortBy: req.query.sortBy?.toString() || 'all',
    }

    // Параметры запроса
    const skip = page * limit
    const queryConditions: any = {}
    const queryConditions2: any = {}

    if (req.headers['accept-language'] === 'ru') {
      // Поиск по тексту
      if (searchQuery && typeof searchQuery === 'string') {
        queryConditions.name = { $regex: searchQuery, $options: 'i' }
      }
      const ruCategories: IRuCategory[] = await Rucategory.find(queryConditions)

      // if (categoryId && categoryId !== undefined) {
      //   queryConditions2.categoryId = categoryId
      // }
      // собираем все Id en постов из ruPosts
      const Ids = ruCategories.map((category) => category.categoryId.toString())
      console.log('Ids=', Ids)
      queryConditions2._id = { $in: Ids }

      // Сортировка
      let dateFilter = {}
      let sortOptions = {}
      const result = sortirovka(dateFilter, sortOptions, sortBy)
      dateFilter = result.dateFilter
      sortOptions = result.sortOptions

      console.log('Финальный Ru запрос MongoDB в search:', {
        filter: queryConditions2,
        sort: sortOptions,
      })

      categories = await Category.find(queryConditions2)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        // .populate('userId')
        .lean<ICategory[]>()
      console.log('Ru   categories=', categories)

      // количество постов
      countCategories = await Category.countDocuments(queryConditions2)
    } else {
      // Поиск по тексту
      if (searchQuery && typeof searchQuery === 'string') {
        const searchTerm = searchQuery
        queryConditions.name = { $regex: searchTerm, $options: 'i' }
        console.log('🔎 Условие поиска:', queryConditions.name)
      }

      // Сортировка
      let dateFilter = {}
      let sortOptions = {}
      const result = sortirovka(dateFilter, sortOptions, sortBy)
      dateFilter = result.dateFilter
      sortOptions = result.sortOptions

      // Объединяем все условия
      const finalQuery = {
        ...queryConditions, // основные условия (name поиск)
        ...dateFilter, // фильтр по дате
      }

      console.log('Финальный запрос MongoDB в search:', {
        filter: finalQuery,
        sort: sortOptions,
      })

      // Выполняем запрос с page
      categories = await Category.find(finalQuery)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        // .populate('userId')
        .lean<ICategory[]>()

      // Общее количество для пагинации
      countCategories = await Category.countDocuments(finalQuery)
    }
    outCategories = categories
    console.log('categories=', categories)
    console.log('countCategories=', countCategories)

    if (categories.length > 0) {
      // language = ru
      if (req.headers['accept-language'] === 'ru') {
        outCategories = await getRuCategories(categories, outCategories)
      }
    }
    res.status(200).json({ outCategories, count: countCategories })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/category get /search/query',
    })
  }
})

export default router
