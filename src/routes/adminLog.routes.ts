import { Router, Request, Response } from 'express'
import { Server } from 'socket.io'
import AdminLog from '../models/AdminLog'
import authMiddleware from '../middleware/auth.middleware'
import adminMiddleware from '../middleware/admin.middleware'
import { Types } from 'mongoose'
import { handlerError } from '../handlers/handlerError'
const router = Router()

interface CustomRequestIo extends Request {
  io?: Server // Добавляем свойство io
}

interface IAdminLog {
  _id: Types.ObjectId
  adminId: string
  what: string
  time: Date
}

const sortirovka = (dateFilter: {}, sortOptions: {}, sortBy: string) => {
  let localDateFilter = { ...dateFilter }
  let localSortOptions = { ...sortOptions }

  switch (sortBy) {
    case 'fresh':
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      localDateFilter = { time: { $gte: threeDaysAgo } }
      localSortOptions = { time: -1, _id: -1 }
      break

    case 'month': {
      const monthAgo = new Date()
      monthAgo.setMonth(monthAgo.getMonth() - 1)
      localDateFilter = { time: { $gte: monthAgo } }
      localSortOptions = { time: -1, _id: -1 }
      break
    }

    case 'year': {
      const now = new Date()
      const msInYear = 365 * 24 * 60 * 60 * 1000 // 365 дней в миллисекундах
      const yearAgo = new Date(now.getTime() - msInYear)
      yearAgo.setMilliseconds(0)
      localDateFilter = { time: { $gte: yearAgo } }
      localSortOptions = { time: -1, _id: -1 }
      break
    }

    case 'all':
      localSortOptions = { time: -1, _id: -1 }
      break

    case 'popular':
      // localDateFilter = {
      //   $or: [{ views: { $gt: 20 } }, { favorite: { $gt: 20 } }],
      // }
      localSortOptions = { time: -1, _id: -1 }
      break

    default:
      sortOptions = { time: -1, _id: -1 }
  }
  return { dateFilter: localDateFilter, sortOptions: localSortOptions }
}

router.use(authMiddleware, adminMiddleware)

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

    console.log('searchQuery=', searchQuery)
    console.log('page=', page)
    console.log('sortBy=', sortBy)
    console.log('limit=', limit)

    // Параметры запроса
    const skip = page * limit
    const queryConditions: any = {}

    // Поиск по тексту
    if (searchQuery && typeof searchQuery === 'string') {
      const searchTerm = searchQuery
      queryConditions.what = { $regex: searchTerm, $options: 'i' }
    }

    // Сортировка
    let dateFilter = {}
    let sortOptions = {}
    const result = sortirovka(dateFilter, sortOptions, sortBy)
    dateFilter = result.dateFilter
    sortOptions = result.sortOptions

    // Объединяем все условия
    const finalQuery = {
      ...queryConditions, // основные условия (поиск по what)
      ...dateFilter, // фильтр по дате
    }

    console.log('Финальный запрос MongoDB в search:', {
      filter: finalQuery,
      sort: sortOptions,
    })

    type outAdminLogs = {
      _id: Types.ObjectId
      adminId: { email: string }
      what: string
      time: Date
    }

    const adminLogs = await AdminLog.find(finalQuery)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .populate('adminId', 'email') // Получаем только email
      .lean<outAdminLogs[]>()

    // Преобразуем: заменяем adminId на email строку
    const transformedLogs = adminLogs.map((log) => ({
      ...log,
      adminId: log.adminId?.email || null, // Заменяем объект на строку
    }))

    console.log('queryConditions=', queryConditions)
    console.log('sortOptions=', sortOptions)

    // Общее количество для пагинации
    const countAdminLogs = await AdminLog.countDocuments(finalQuery)

    console.log('transformedLogs=', transformedLogs)
    console.log('countAdminLogs=', countAdminLogs)
    console.log('dataSeearch=', searchQuery)
    res
      .status(200)
      .json({ success: true, outAdminLogs: transformedLogs, countAdminLogs })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/log get /search',
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
    type outAdminLogs = {
      _id: Types.ObjectId
      adminId: { email: string }
      what: string
      time: Date
    }

    const adminLogs = await AdminLog.find(dateFilter)
      .sort(sortOptions)
      .skip(page * limit)
      .limit(limit)
      .populate('adminId', 'email') // Получаем только email
      .lean<outAdminLogs[]>()

    // Преобразуем: заменяем adminId на email строку
    const transformedLogs = adminLogs.map((log) => ({
      ...log,
      adminId: log.adminId?.email || null, // Заменяем объект на строку
    }))

    const countAdminLogs = await AdminLog.countDocuments(dateFilter)

    if (adminLogs.length === 0) {
      res
        .status(200)
        .json({ success: false, message: 'Admin records not found' })
      return
    }

    res
      .status(200)
      .json({ success: true, outAdminLogs: transformedLogs, countAdminLogs })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/log get /',
    })
  }
})

export default router
