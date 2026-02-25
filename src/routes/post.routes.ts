import { Router, Request, Response } from 'express'
import Category from '../models/Category'
import User from '../models/User'
import Rucategory from '../models/Rucategory'
import Post from '../models/Post'
import Rupost from '../models/Rupost'
import authMiddleware from '../middleware/auth.middleware'
//import counterViewMiddleware from '../middleware/counterView.middleware'
import { Types } from 'mongoose'
import { Server } from 'socket.io'
import Comment from '../models/Comment'
import { handlerError } from '../handlers/handlerError'
import 'express-session'

const router = Router()

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

interface IRuPost {
  _id: Types.ObjectId
  title: string
  sections: ISection[]
  postId: string
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

//
const countComments = async (post: IPost): Promise<number> => {
  // Один запрос для всех комментариев
  const comments = await Comment.find({ postId: post._id }).lean<IComment[]>()

  // Собираем все Id из комментов
  const commentIds = comments.map((comment) => comment._id.toString())
  console.log('commentIds-start=', commentIds)

  // Один запрос для всех связанных комментариев
  const commentsRelate = await Comment.find({
    related: { $in: commentIds },
  }).lean<IComment[]>()

  const countComments = comments.length + commentsRelate.length
  return countComments || 0
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

declare module 'express-session' {
  interface Session {
    views: {
      [key: string]: boolean
    }
  }
}

router.get(
  '/viewInFull/:postId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      console.log('старт get viewInFull по id')
      const postId = req.params.postId
      const userId = req.user.userId
      const today = new Date().toDateString()

      if (!postId) {
        console.log('No postId - skipping')
        res.status(404).json({ message: 'Post not found' })
        return
      }

      const post = await Post.findById(postId)
      if (!post) {
        res.status(404).json({ message: 'Post not found' })
        return
      }

      // Проверяем, не просматривал ли пользователь пост сегодня
      const viewKey = `view:${postId}:${userId}:${today}`
      let currentViews = post.views

      if (!req.session.views) {
        req.session.views = {}
        console.log('Initialized views object')
      }

      console.log('Current views in session:', req.session.views)

      // Если пользователь еще не просматривал пост сегодня
      if (!req.session.views[viewKey]) {
        console.log('First view today - incrementing')

        const updatedPost = await Post.findByIdAndUpdate(
          postId,
          { $inc: { views: 1 } },
          { new: true },
        )
        console.log('Updated post views:', updatedPost?.views)
        currentViews = updatedPost!.views

        req.session.views[viewKey] = true
        console.log('Set session view key to true')

        // Явно сохраняем сессию и ждём
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              console.error('Error saving session:', err)
              reject(err)
            } else {
              console.log('Session saved successfully')
              resolve()
            }
          })
        })
      } else {
        console.log('Already viewed today - skipping')
      }

      console.log('views=', currentViews)

      res.json({ views: currentViews })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/post get /viewInFull/:postId',
        postId: req.params.postId, // Безопасная доп. информация
      })
    }
  },
)

// update favorite and nofavorite
router.put('/update', authMiddleware, async (req: CustomRequestIo, res) => {
  try {
    console.log('req.body=', req.body)
    const { _id, favorite, nofavorite } = req.body
    const userId = new Types.ObjectId(req.user.userId)

    let outPost: IPostFull

    const user = await User.findById(userId)
    if (!user) {
      res
        .status(404)
        .json({ message: 'User not found', forUserId: req.user.userId })
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
        res
          .status(404)
          .json({ message: 'Post not found', forUserId: req.user.userId })
        return
      }
      // // const user = await User.findById(userId)
      const arrayPosts = user!.votepost ?? []
      console.log('arrayPosts=', arrayPosts)
      arrayPosts.push(post._id)
      console.log('arrayPosts=', arrayPosts)
      const userVP = await User.findByIdAndUpdate(
        userId,
        { votepost: arrayPosts },
        { new: true },
      )
      console.log('userVP=', userVP)

      // const user = await User.findById(userId)
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
      res.status(200).json({ outPost, forUserId: req.user.userId })
    } else {
      const emitMessage = {
        messageKey: 'postPage.toast.voteOnce',
        forUserId: req.user.userId,
      }

      req.io?.to('posts').emit('server_edit_post_response', emitMessage)
      res.status(200).json({ message: 'only once', forUserId: req.user.userId })
    }
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/post put /update',
      postId: req.body._id,
    })
  }
})

// OK
// get all posts in category `${basicUrl.urlPost}/${categoryId}?page=${page}`
router.get('/:categoryId', authMiddleware, async (req, res) => {
  try {
    console.log('старт all posts in category')
    const categoryId = req.params.categoryId
    console.log('categoryId=', categoryId)

    let category = await Category.findById(categoryId)
    if (!category) {
      res.status(404).json({ message: 'Category not found' })
      return
    }
    let outPosts: IPostFullWithComments[] = []
    // Проверяем, является ли categoryId валидным ObjectId
    // if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    //   // Если нет — возвращаем ошибку 400 (Неверный запрос)
    //   return res.status(400).json({
    //     message: `Неверный формат ID категории: ${categoryId}`
    //   });
    // }
    // let posts: IPost[]

    const page = Number(req.query.page) || 1
    let sortBy = req.query.sortBy as string
    if (sortBy === undefined) sortBy = 'all'
    const limit = Number(req.query.limit) || 3

    const queryConditions: any = {}

    // Сортировка
    let dateFilter = {}
    let sortOptions = {}
    const result = sortirovka(dateFilter, sortOptions, sortBy)
    dateFilter = result.dateFilter
    sortOptions = result.sortOptions

    // let query
    // switch (sort) {
    //   case 'fresh':
    //     const threeDaysAgo = new Date()
    //     threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    //     query = Post.find({
    //       categoryId,
    //       createdAt: { $gte: threeDaysAgo },
    //     }).sort({ createdAt: -1, _id: -1 })
    //     break
    //   case 'popular':
    //     query = Post.find({ categoryId }).sort({
    //       favorite: -1,
    //       views: -1,
    //       _id: -1,
    //     })
    //     break
    //   case 'month':
    //     const monthAgo = new Date()
    //     monthAgo.setMonth(monthAgo.getMonth() - 1)
    //     query = Post.find({
    //       categoryId,
    //       createdAt: { $gte: monthAgo },
    //     }).sort({ createdAt: -1, _id: -1 })
    //     break
    //   case 'year':
    //     const yearAgo = new Date()
    //     yearAgo.setFullYear(yearAgo.getFullYear() - 1)
    //     query = Post.find({
    //       categoryId,
    //       createdAt: { $gte: yearAgo },
    //     }).sort({ createdAt: -1, _id: -1 })
    //     break
    //   default:
    //     query = Post.find({ categoryId }).sort({ createdAt: -1, _id: -1 })
    // }

    if (categoryId && categoryId !== undefined) {
      queryConditions.categoryId = categoryId
    }

    // Объединяем все условия
    const finalQuery = {
      ...queryConditions, // основные условия (categoryId)
      ...dateFilter, // фильтр по дате
    }

    // Выполняем запрос с пагинацией
    const posts = await Post.find(finalQuery)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IPost[]>()

    // if (posts.length === 0) {
    //   res.status(404).json({ message: 'Posts not found' })
    //   return
    // }
    const countAll = await Post.countDocuments(finalQuery)

    if (posts.length > 0) {
      outPosts = await getPostsFull(posts)
      // let category = await Category.findById(req.params.categoryId)

      // language = ru
      if (req.headers['accept-language'] === 'ru') {
        outPosts = await getRuPostsFull(posts, outPosts)

        category = await Rucategory.findOne({
          categoryId: req.params.categoryId,
        })
        console.log('category', category)
        console.log('outPosts-ru=', outPosts)
        res.status(200).json({ outPosts, category, count: countAll })
        return
      }
    }

    console.log('category', category)
    console.log('posts=', posts)
    res.status(200).json({ outPosts, category, count: countAll })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/post get /:categoryId',
      categoryId: req.params.categoryId,
    })
  }
})

// OK
// get all posts "start" `${basicUrl.urlPost}/?page=${page}`
router.get('/', authMiddleware, async (req, res) => {
  try {
    console.log('старт all posts in "start"')
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
    console.log('page-start=', page)
    console.log('sortBy-start=', sortBy)
    // const page = parseInt(req.query.page, 10)
    // if (isNaN(page)) {
    //   // Установите значение по умолчанию или верните ошибку
    //   return res.status(400).json({ error: 'Parameter 'page' must be a valid number' });
    // }

    // Сортировка
    let dateFilter = {}
    let sortOptions = {}
    const result = sortirovka(dateFilter, sortOptions, sortBy)
    dateFilter = result.dateFilter
    sortOptions = result.sortOptions

    // // Объединяем все условия
    // const finalQuery = {
    //   ...queryConditions, // ваши основные условия (categoryId, title поиск)
    //   ...dateFilter, // фильтр по дате
    // }

    console.log('Финальный запрос MongoDB в /:', {
      filter: dateFilter,
      sort: sortOptions,
    })

    const postsAfterDate = await Post.find(dateFilter)
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
      .lean<IPost[]>()
    // или .lean() as unknown as IPost[]
    console.log('postsAfterDate-start=', postsAfterDate)
    const count = await Post.countDocuments(dateFilter)

    outPosts = await getPostsFull(postsAfterDate)
    console.log('req.headers=', req.headers['accept-language'])

    // language = ru
    if (req.headers['accept-language'] === 'ru') {
      outPosts = await getRuPostsFull(postsAfterDate, outPosts)

      console.log('outPosts-ru=', outPosts)
      res.json({ outPosts, count })
      return
    }

    console.log('outPosts=', outPosts)
    console.log('count=', count)
    res.json({ outPosts, count })
  } catch (e) {
    handlerError(e, res, { endpoint: '/api/post get /' })
  }
})

// OK пока не используется, используется aggregation function
// get post по id - url: `${basicUrl.urlPost}/detail/${postId}`
router.get('/detail/:postId', authMiddleware, async (req, res) => {
  try {
    console.log('старт get post по id - /detail/:postId')
    let outPosts: IPost[] = []
    const postId = req.params.postId

    console.log('postId=', postId)
    const post = await Post.findById(postId.toString()).lean<IPost>()
    if (!post) {
      res.status(404).json({ message: 'Post not found' })
      return
    }
    console.log('post=', post)
    outPosts = [post!]
    if (req.headers['accept-language'] === 'ru') {
      const rupost = await Rupost.findOne({
        postId: postId.toString(),
      }).lean<IRuPost>()
      // добавить случай не нахождения переводов -> return англ перевод
      if (rupost) {
        console.log('rupost=', rupost)
        const support: IPost = {
          _id: post._id,
          title: rupost?.title || post.title,
          sections: rupost?.sections || post.sections,
          favorite: post.favorite,
          nofavorite: post.nofavorite,
          views: post.views,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          categoryId: post.categoryId,
          userId: post.userId,
        }
        outPosts.push(support)
      }
    }
    console.log('outPosts=', outPosts)
    res.json(outPosts)
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/post get /detail/:postId',
      postId: req.params.postId,
    })
  }
})

// get postfull по id --- aggregation function - url: `${basicUrl.urlPost}/detailAggregation/${postId}`
router.get(
  '/detailAggregation/:postId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      console.log('старт get postfull по id --- aggregation function')
      const postId = req.params.postId
      const objectId = new Types.ObjectId(postId as string)

      // Проверяем, является ли postId валидным ObjectId
      if (!Types.ObjectId.isValid(postId as string)) {
        // Если нет — возвращаем ошибку 400 (Неверный запрос)
        res.status(400).json({
          message: 'Incorrect Post ID format',
        })
        return
      }

      // Увеличиваем просмотры
      // await Post.findByIdAndUpdate(postId, { $inc: { views: 1 } })

      const postsFullWithComments = (await Post.aggregate([
        {
          $match: {
            _id: objectId,
          },
        },
        // Получаем пользователя
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $unwind: '$user',
        },
        // { $unwind: { path: '$user', preserveNullAndEmptyArrays: false } },

        // Получаем прямые комментарии к посту
        {
          $lookup: {
            from: 'comments',
            localField: '_id',
            foreignField: 'postId',
            as: 'comments',
          },
        },
        // Получаем связанные комментарии (ответы на комментарии)
        // {
        //   $lookup: {
        //     from: 'comments',
        //     let: { commentIds: '$comments._id' },
        //     pipeline: [
        //       {
        //         $match: {
        //           $expr: {
        //             $in: ['$related', '$$commentIds'],
        //           },
        //         },
        //       },
        //     ],
        //     as: 'relatedComments',
        //   },
        // },
        // Добавляем поле countComments
        {
          $addFields: {
            countComments: {
              // $add: [{ $size: '$comments' }, { $size: '$relatedComments' }],
              $add: [{ $size: '$comments' }],
            },
          },
        },
        // Проекция полей
        {
          $project: {
            title: 1,
            sections: 1,
            favorite: 1,
            nofavorite: 1,
            views: 1,
            countComments: 1, // Теперь это поле есть
            createdAt: 1,
            updatedAt: 1,
            categoryId: 1,
            'user._id': 1,
            'user.email': 1,
            'user.avatar': 1,
            'user.firstName': 1,
            'user.lastName': 1,
            'user.bio': 1,
            // 'user.password': 1,
            'user.confirmed': 1,
            'user.role': 1,
            'user.block': 1,
            'user.createdAt': 1,
            'user.lastLogin': 1,
            'user.votepost': 1,
            'user.votecomment': 1,
            'user.commentsCount': 1,
            'user.postsPublishedId': 1,
          },
        },
        {
          $limit: 1,
        },
      ])) as IPostFullWithComments[]

      // Обработка русского языка
      if (
        req.headers['accept-language'] === 'ru' &&
        postsFullWithComments.length > 0
      ) {
        const ruPost = (await Rupost.findOne({ postId: objectId })) as IRuPost

        if (ruPost) {
          postsFullWithComments[0].title =
            ruPost?.title || postsFullWithComments[0].title
          postsFullWithComments[0].sections =
            ruPost.sections || postsFullWithComments[0].sections
        }
      }

      res.json({ postsFullWithComments })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/post get /detailAggregation/:postId',
        postId: req.params.postId,
      })
    }
  },
)

// search posts по id category
router.get(
  '/search/:categoryId',
  authMiddleware,
  async (req, res): Promise<void> => {
    try {
      console.log('старт search posts по id category')
      let outPosts: IPostFullWithComments[] = []
      let posts: IPost[] = []
      let count: number = 0

      const {
        q: searchQuery,
        page = 1,
        limit = 3,
        sortBy = 'all',
      } = {
        q: req.query.q || req.query.searchString || '',
        page: parseInt(String(req.query.page || '1'), 10) || 1,
        limit: parseInt(String(req.query.limit || '3'), 10) || 3,
        sortBy: req.query.sortBy?.toString() || 'all',
      }
      const catId: string = req.params.categoryId as string
      let categoryId: Types.ObjectId | undefined

      if (catId && catId !== 'undefined') {
        categoryId = new Types.ObjectId(catId)
      } else {
        categoryId = undefined
      }

      console.log('categoryId=', categoryId)
      console.log('searchQuery=', req.query)

      // Параметры запроса
      const skip = (page - 1) * limit
      const queryConditions: any = {}
      const queryConditions2: any = {}

      if (req.headers['accept-language'] === 'ru') {
        // Поиск по тексту
        if (searchQuery && typeof searchQuery === 'string') {
          queryConditions.title = { $regex: searchQuery, $options: 'i' }
        }
        const ruPosts: IRuPost[] = await Rupost.find(queryConditions)

        if (categoryId && categoryId !== undefined) {
          queryConditions2.categoryId = categoryId
        }
        // собираем все Id en постов из ruPosts
        const Ids = ruPosts.map((post) => post.postId.toString())
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

        posts = await Post.find(queryConditions2)
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          // .populate('userId')
          .lean<IPost[]>()
        console.log('Ru   posts=', posts)

        // количество постов
        count = await Post.countDocuments(queryConditions2)
      } else {
        // Поиск по тексту
        if (searchQuery && typeof searchQuery === 'string') {
          // Если есть и categoryId и поисковой запрос, ищем по обоим условиям
          if (categoryId && categoryId !== undefined) {
            queryConditions.categoryId = categoryId
            queryConditions.title = { $regex: searchQuery, $options: 'i' }
          } else {
            // Если только поисковой запрос без категории
            queryConditions.title = { $regex: searchQuery, $options: 'i' }
          }
        }

        // Сортировка
        let dateFilter = {}
        let sortOptions = {}
        const result = sortirovka(dateFilter, sortOptions, sortBy)
        dateFilter = result.dateFilter
        sortOptions = result.sortOptions

        // Объединяем все условия
        const finalQuery = {
          ...queryConditions, // основные условия (categoryId, title поиск)
          ...dateFilter, // фильтр по дате
        }

        console.log('Финальный запрос MongoDB в search:', {
          filter: finalQuery,
          sort: sortOptions,
        })

        // Выполняем запрос с page
        posts = await Post.find(finalQuery)
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          // .populate('userId')
          .lean<IPost[]>()

        // количество постов
        count = await Post.countDocuments(finalQuery)

        console.log('queryConditions=', queryConditions)
        console.log('sortOptions=', sortOptions)

        // Общее количество для пагинации
        // await Post.countDocuments(queryConditions)

        console.log('En  posts=', posts)
      }
      let category = {}

      if (categoryId) {
        const foundCategory = await Category.findById(req.params.categoryId)
        if (!foundCategory) {
          res.status(404).json({ message: 'Category not found' })
          return
        }
        category = foundCategory
      }

      if (posts.length > 0) {
        outPosts = await getPostsFull(posts)

        // language = ru
        if (req.headers['accept-language'] === 'ru') {
          outPosts = await getRuPostsFull(posts, outPosts)
          if (categoryId) {
            const ruCategory = await Rucategory.findOne({
              categoryId: req.params.categoryId,
            })
            if (ruCategory) category = ruCategory
          }
          console.log('category', category)
          console.log('outPosts-ru=', outPosts)
          res.status(200).json({ outPosts, category, count })
          return
        }
      }

      res.status(200).json({ outPosts, category, count })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/post get /search/:categoryId',
        categoryId: req.params.categoryId,
      })
    }
  },
)

// сделать унифицированной(category, start, )
// get count posts `${basicUrl.urlPost}/?categoryId=categoryId&sortBy=${sortBy}&q=search...`
router.get(
  '/stats/countPosts',
  authMiddleware,
  async (req, res): Promise<void> => {
    try {
      console.log('старт count posts in "start"')

      const { q: searchQuery, sortBy = 'all' } = {
        q: req.query.q || req.query.searchString || '',
        sortBy: req.query.sortBy?.toString() || 'all',
      }

      const catId = req.query.categoryId as string
      const categoryId =
        catId && catId !== 'undefined' ? new Types.ObjectId(catId) : undefined

      const post1Id = req.query.postId as string
      const postId =
        post1Id && post1Id !== 'undefined'
          ? new Types.ObjectId(post1Id)
          : undefined

      console.log('query-start=', searchQuery)
      console.log('sortBy-start=', sortBy)

      // Формируем условия запроса
      const queryConditions: Record<string, any> = {}

      // Условие по категории (если есть)
      if (categoryId) {
        queryConditions.categoryId = categoryId
      } else if (postId) {
        const post = await Post.findById(postId)
        if (post) {
          queryConditions.categoryId = post.categoryId
        }
      }

      // Условие по поиску (если есть)
      if (searchQuery as string) {
        queryConditions.title = {
          $regex: searchQuery as string,
          $options: 'i',
        }
      }

      // Сортировка
      let dateFilter = {}
      let sortOptions = {}
      const result = sortirovka(dateFilter, sortOptions, sortBy)
      dateFilter = result.dateFilter
      sortOptions = result.sortOptions

      // Объединяем все условия
      const finalQuery = {
        ...queryConditions, // мои основные условия (categoryId, title поиск)
        ...dateFilter, // фильтр по дате
      }

      console.log('Финальный запрос MongoDB в countPosts:', {
        filter: finalQuery,
        sort: sortOptions,
      })

      const countPosts = await Post.countDocuments(finalQuery)

      // const postsAfterDate = await Post.find(finalQuery)
      //   .sort(sortOptions)
      //   .lean<IPostFull[]>()
      console.log('countPosts-start=', countPosts)

      console.log('countPosts=', countPosts)
      res.json({ succses: true, countPosts })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/post get /stats/countPosts',
        categoryId: req.query.categoryId,
      })
    }
  },
)

export default router
