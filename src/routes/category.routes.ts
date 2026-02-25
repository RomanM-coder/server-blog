import { Router, Request, Response } from 'express'
import Category from '../models/Category'
import Rucategory from '../models/Rucategory'
import User from '../models/User'
import { handlerError } from '../handlers/handlerError'
import authMiddleware from '../middleware/auth.middleware'
import { Types } from 'mongoose'

const router = Router()

interface ICategory {
  _id: Types.ObjectId
  name: string
  link: string
  description: string
}

interface IRuCategory {
  _id: Types.ObjectId
  name: string
  link: string
  description: string
  categoryId: Types.ObjectId
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

router.use(authMiddleware)

// get all categories
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('start   get all categories   /')
    let outCategories: ICategory[] = []
    const categories = await Category.find().lean<ICategory[]>()
    console.log('accept-language', req.headers['accept-language'])

    // for language = ru
    if (req.headers['accept-language'] === 'ru') {
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
            title: matchingRuCategory.name,
            sections: matchingRuCategory.description,
          }
        }
        return category // Если нет соответствия, оставляем оригинал категории(en)
      })
      outCategories = await getRuCategories(categories, outCategories)
      console.log('outCategories-RU= ', outCategories)

      res.status(200).json({ success: true, outCategories })
    } else {
      outCategories = categories
      console.log('outCategories-EN= ', outCategories)

      res.status(200).json({ success: true, outCategories })
    }
  } catch (e) {
    handlerError(e, res, { endpoint: '/api/category get /' })
  }
})

// get category по id
router.get('/:categoryId', async (req: Request, res: Response) => {
  try {
    console.log('start   get category по id   /:categoryId')
    const categoryId = req.params.categoryId

    // Проверяем, является ли categoryId валидным ObjectId
    if (!Types.ObjectId.isValid(categoryId as string)) {
      res.status(400).json({
        success: false,
        message: 'Incorrect category ID format.',
      })
      return
    }

    const category = await Category.findById(categoryId)

    if (!category) {
      res.status(200).json({
        success: false,
        message: 'Category not found.',
      })
      return
    }
    console.log('get(/:categoryId)', category)

    res.status(200).json({ success: true, category })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/category get /:categoryId',
      categoryId: req.params.categoryId,
    })
  }
})

// get field user.confirmed
router.get('/user/confirmed', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user.userId)
    if (!user) {
      res.status(404).json({ success: false, confirmed: false })
      return
    }

    res.status(200).json({ success: true, confirmed: user.confirmed })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/category get /user/confirmed',
      userId: req.user.userId,
    })
  }
})

export default router
