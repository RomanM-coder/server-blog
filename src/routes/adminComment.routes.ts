import { Router, Request, Response } from 'express'
import { Server } from 'socket.io'
import User from '../models/User'
import Post from '../models/Post'
import Rupost from '../models/Rupost'
import authMiddleware from '../middleware/auth.middleware'
import adminMiddleware from '../middleware/admin.middleware'
import Comment from '../models/Comment'
import Rucomment from '../models/Rucomment'
import AdminLogs from '../models/AdminLog'
import { Types } from 'mongoose'
import { handlerError } from '../handlers/handlerError'

const router = Router()

interface CustomRequestIo extends Request {
  io?: Server // Добавляем свойство io
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
  sections: [ISection]
  postId: Types.ObjectId
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

interface ICommentForm {
  _id: Types.ObjectId
  content: string
  content_ru: string
  like: number
  dislike: number
  owner: string
  postId: string
}

interface IRuComment {
  _id: string
  content: string
  commentId: string
}

interface ICommentFull {
  _id: string
  content: string
  createdAt: Date
  like: number
  dislike: number
  related: string | null
  user: IUser
  post: IPost
}

const getRuCommentFull = async (
  comment: ICommentFull,
): Promise<ICommentFull> => {
  try {
    let outRuComment: ICommentFull
    const ruComment = (await Rucomment.findOne({
      commentId: comment._id,
    })) as IRuComment

    console.log('ruComment=', ruComment)

    if (!ruComment) {
      console.error(`ruComment not found for comment ${comment._id}`)
      // return // или обработать иначе
    }

    // Если русский комментарий не найден, используем оригинальный контент
    const content = ruComment?.content || comment.content
    console.log('content=', content)

    const postRu = (await Rupost.findOne({
      postId: comment.post._id,
    })) as IRuPost

    // СОЗДАЁМ НОВЫЙ объект поста, не мутируем старый
    const postWithRu = postRu
      ? {
          ...comment.post,
          title: postRu.title || comment.post.title,
          sections: postRu.sections || comment.post.sections,
        }
      : comment.post

    const result: ICommentFull = {
      _id: comment._id,
      content: content,
      createdAt: comment.createdAt,
      like: comment.like,
      dislike: comment.dislike,
      related: comment.related || null,
      user: comment.user,
      post: postWithRu,
    }
    outRuComment = result
    return outRuComment
  } catch (error) {
    console.error(`Error processing comment ${comment._id}:`, error)
    return {} as ICommentFull
  }
}

const getRuCommentsFull = async (
  comments: IComment[],
  outComments: ICommentFull[],
): Promise<ICommentFull[]> => {
  let rucomments: IRuComment[] = []

  for (const comment of comments) {
    const rucomment = (await Rucomment.findOne({
      commentId: comment._id,
    })) as IRuComment
    rucomments.push(rucomment)
  }
  console.log('rucomments=', rucomments)

  for (const comment of comments) {
    try {
      console.log('comment=', comment)

      const ruComment = rucomments.find(
        (comment_ru) =>
          // comment_ru && comment_ru.commentId &&
          comment_ru?.commentId?.toString() === comment._id.toString(),
      ) as IRuComment
      console.log('ruComment=', ruComment)

      if (!ruComment) {
        console.error(`ruComment not found for comment ${comment._id}`)
        // continue // или обработать иначе
      }

      // Если русский комментарий не найден, используем оригинальный контент
      const content = ruComment?.content || comment.content
      console.log('content=', content)

      const user = (await User.findById(comment.owner)) as IUser
      if (!user) {
        console.error(`User not found for comment ${comment._id}`)
        // continue
      }

      let post = (await Post.findById(comment.postId)) as IPost
      if (!post) {
        console.error(`Post not found for comment ${comment._id}`)
        // continue
      }

      const postRu = (await Rupost.findOne({
        postId: post._id,
      })) as IRuPost

      const postWithRu = postRu
        ? {
            ...post,
            title: postRu.title || post!.title,
            sections: postRu.sections || post!.sections,
          }
        : post

      const result: ICommentFull = {
        _id: comment._id,
        content: content,
        createdAt: comment.createdAt,
        like: comment.like,
        dislike: comment.dislike,
        related: comment.related,
        user: user,
        post: postWithRu,
      }
      outComments.push(result)
    } catch (error) {
      console.error(`Error processing comment ${comment._id}:`, error)
      // Продолжаем обработку остальных комментариев
      continue
    }
  }
  return outComments
}

// Рекурсивная функция -----------
const getAllNestedCommentIds = async (
  commentId: string,
  maxDepth = 3,
): Promise<string[]> => {
  const allIds: string[] = [commentId]

  // Рекурсивная функция для поиска вложенных комментариев
  const findNestedComments = async (parentId: string, currentDepth: number) => {
    if (currentDepth >= maxDepth) {
      console.warn(`⚠️ Достигнута максимальная глубина ${maxDepth}`)
      return
    }

    const childComments = await Comment.find({ related: parentId })

    for (const child of childComments) {
      allIds.push(child._id.toString())
      await findNestedComments(child._id.toString(), currentDepth + 1) // Рекурсивный вызов для следующего уровня
    }
  }

  await findNestedComments(commentId, 0)
  return allIds
}

// решение с агрегационным pipeline
interface AggregationResult {
  allIds: Types.ObjectId[]
  // _id: Types.ObjectId
  // другие поля, если нужны
}

const getAllCommentIdsAggregate = async (rootId: string): Promise<string[]> => {
  const result = await Comment.aggregate<AggregationResult>([
    {
      $match: { _id: new Types.ObjectId(rootId) },
    },
    {
      $graphLookup: {
        from: 'comments',
        startWith: '$_id',
        connectFromField: '_id',
        connectToField: 'related',
        as: 'descendants',
        depthField: 'depth',
      },
    },
    {
      $project: {
        allIds: {
          $concatArrays: [['$_id'], '$descendants._id'],
        },
      },
    },
  ])

  if (!result || result.length === 0) {
    return [rootId]
  }

  return result[0]?.allIds?.map((id) => id.toString()) || [rootId]
}
// Использование в роутере:
//const allCommentIds = await getAllCommentIdsAggregate(commentId)

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

// расширенный русским переводом selectPost
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const comment = await Comment.findById(req.params.id)

    if (!comment) {
      res.status(404).json({ success: false, message: 'Comment not found' })
      console.error(`Comment not found`)
      return
    }
    const rucomment = await Rucomment.findOne({ commentId: comment._id })
    console.log('rupost=', rucomment)

    const selectComment: ICommentForm = {} as ICommentForm
    selectComment._id = comment._id
    selectComment.content = comment.content
    selectComment.like = comment.like
    selectComment.dislike = comment.dislike
    selectComment.content_ru = rucomment?.content!

    console.log('selComment= ', selectComment)
    res.status(200).json({ success: true, selectComment })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/comment get /:id',
      postId: req.params.id,
    })
  }
})

// get comments pagination in post
router.get(
  '/detail/pagination',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      console.log('get comments pagination in post - /detail/pagination/:id')
      let outComments: ICommentFull[] | undefined = []

      const postId = req.query.postId
      if (!postId) {
        res.status(404).json({ success: false, message: 'Post is not found' })
        return
      }

      const {
        page = 0,
        limit = 3,
        sortBy = 'all',
      } = {
        page: parseInt(String(req.query.page || '0'), 10) || 0,
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
        postId: postId, // основные условия (postId)
        ...dateFilter, // фильтр по дате
      }
      console.log('finalQuery=', finalQuery)

      // await new Promise((resolve) => setTimeout(resolve, 300))
      await Comment.syncIndexes()
      let comments: IComment[] = await Comment.find(finalQuery)
        .sort(sortOptions)
        .skip(page * limit)
        .limit(limit)
        .lean<IComment[]>()
      console.log('comments=', comments)
      console.log('comments-count=', comments.length)

      const count = await Comment.countDocuments(finalQuery)

      // language = ru
      if (req.headers['accept-language'] === 'ru') {
        outComments = await getRuCommentsFull(comments, outComments)
      } else {
        for (const comment of comments) {
          const user = (await User.findById(comment.owner)) as IUser
          const post = (await Post.findById(comment.postId)) as IPost

          const support2: ICommentFull = {
            _id: comment._id,
            content: comment.content,
            createdAt: comment.createdAt,
            like: comment.like,
            dislike: comment.dislike,
            related: comment.related,
            user: user,
            post: post,
          }
          outComments.push(support2)
        }
      }
      console.log('countComments=', count)
      const outPost = (await Post.findById(postId)) as IPost

      res.status(200).json({ success: true, outComments, count, outPost })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/admin/comment get /detail/pagination',
        postId: req.query.postId,
      })
    }
  },
)

// get comments pagination in post
router.get(
  '/search/query',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      console.log('get comments search in post - /search')
      let outComments: ICommentFull[] | undefined = []
      let comments: IComment[] = []
      let count: number = 0

      const postId = req.query.postId
      if (!postId) {
        res.status(404).json({ success: false, message: 'Post is not found' })
        return
      }

      const {
        q: searchQuery,
        page = 0,
        limit = 3,
        sortBy = 'all',
      } = {
        q: req.query.q || req.query.searchString || '',
        page: parseInt(String(req.query.page || '0'), 10) || 0,
        limit: parseInt(String(req.query.limit || '3'), 10) || 3,
        sortBy: req.query.sortBy?.toString() || 'all',
      }

      const queryConditions: any = {}
      const queryConditions2: any = {}
      if (req.headers['accept-language'] === 'ru') {
        // Поиск по тексту
        if (searchQuery && typeof searchQuery === 'string') {
          queryConditions.content = { $regex: searchQuery, $options: 'i' }
          console.log('🔎 Условие поиска:', queryConditions.content)
        }

        const ruComments: IRuComment[] = await Rucomment.find(queryConditions)

        // собираем все Id (commentId) из ruComments
        const Ids = ruComments.map((comment) => comment.commentId.toString())
        console.log('Ids=', Ids)
        queryConditions2._id = { $in: Ids }

        queryConditions2.postId = postId

        let dateFilter = {}
        let sortOptions = {}
        const result = sortirovka(dateFilter, sortOptions, sortBy)
        dateFilter = result.dateFilter
        sortOptions = result.sortOptions

        // Объединяем все условия
        const finalQuery = {
          ...queryConditions2, // основные условия (commentId)
          ...dateFilter, // фильтр по дате
        }
        console.log('finalQuery=', finalQuery)

        // await new Promise((resolve) => setTimeout(resolve, 300))
        // await Comment.syncIndexes()
        comments = await Comment.find(finalQuery)
          .sort(sortOptions)
          .skip(page * limit)
          .limit(limit)
          .lean<IComment[]>()
        console.log('comments=', comments)
        console.log('comments-count=', comments.length)

        count = await Comment.countDocuments(finalQuery)
      } else {
        // Поиск по тексту
        if (searchQuery && typeof searchQuery === 'string') {
          queryConditions.postId = postId
          queryConditions.content = { $regex: searchQuery, $options: 'i' }
          console.log('🔎 Условие поиска:', queryConditions.content)
        }

        let dateFilter = {}
        let sortOptions = {}
        const result = sortirovka(dateFilter, sortOptions, sortBy)
        dateFilter = result.dateFilter
        sortOptions = result.sortOptions

        // Объединяем все условия
        const finalQuery = {
          ...queryConditions, // основные условия (postId)
          ...dateFilter, // фильтр по дате
        }
        console.log('finalQuery=', finalQuery)

        // await new Promise((resolve) => setTimeout(resolve, 300))
        // await Comment.syncIndexes()
        comments = await Comment.find(finalQuery)
          .sort(sortOptions)
          .skip(page * limit)
          .limit(limit)
          .lean<IComment[]>()
        console.log('comments=', comments)
        console.log('comments-count=', comments.length)

        count = await Comment.countDocuments(finalQuery)
      }
      // language = ru
      if (req.headers['accept-language'] === 'ru') {
        outComments = await getRuCommentsFull(comments, outComments)
      } else {
        for (const comment of comments) {
          const user = (await User.findById(comment.owner)) as IUser
          const post = (await Post.findById(comment.postId)) as IPost

          const support2: ICommentFull = {
            _id: comment._id,
            content: comment.content,
            createdAt: comment.createdAt,
            like: comment.like,
            dislike: comment.dislike,
            related: comment.related,
            user: user,
            post: post,
          }
          outComments.push(support2)
        }
      }
      console.log('countComments=', count)
      const outPost = (await Post.findById(postId)) as IPost

      res.status(200).json({ success: true, outComments, count, outPost })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/admin/comment get /search/query',
      })
    }
  },
)

// add new comment(addEdit form)
router.post('/insert', async (req: CustomRequestIo, res: Response) => {
  try {
    let newComment: ICommentFull
    const { content, content_ru, like, dislike, owner, postId } = req.body
    const comment = new Comment({
      content,
      like,
      dislike,
      owner,
      postId,
    })
    await comment.save()

    const rucomment = new Rucomment({
      content: content_ru,
      commentId: comment._id,
    })
    await rucomment.save()

    const user = (await User.findByIdAndUpdate(
      owner,
      { $inc: { commentsCount: 1 } },
      { new: true },
    )) as IUser

    if (!user) {
      res
        .status(400)
        .json({
          success: false,
          message: 'User not found',
          forUserId: req.user.userId,
        })
      console.error(`User not found for comment ${comment._id}`)
      return
    }

    const post = (await Post.findById(comment.postId)) as IPost
    if (!post) {
      res
        .status(404)
        .json({
          success: false,
          message: 'Post not found',
          forUserId: req.user.userId,
        })
      console.error(`Post not found for comment ${comment._id}`)
      return
    }

    // 4. Преобразуем Mongoose Document в обычный объект
    const commentObject: ICommentFull = {
      _id: comment._id.toString(),
      content: comment.content,
      like: comment.like,
      dislike: comment.dislike,
      createdAt: comment.createdAt,
      related: comment.related ? comment.related.toString() : null,
      user: user,
      post: post,
    }
    // language = ru
    if (req.headers['accept-language'] === 'ru') {
      newComment = await getRuCommentFull(commentObject)
      console.log('Ru-newComment=', newComment)
    } else {
      const support2: ICommentFull = {
        _id: comment._id.toString(),
        content: comment.content,
        createdAt: comment.createdAt,
        like: comment.like,
        dislike: comment.dislike,
        related: comment.related ? comment.related.toString() : null,
        user: user,
        post: post,
      }
      newComment = support2
      console.log('En-newComment=', newComment)
    }
    const emitMessage = {
      messageKey: 'adminSinglePost.toast.addComment',
      forUserId: req.user.userId,
    }

    req.io
      ?.to('adminSinglePost')
      .emit('server_edit_comment_response', emitMessage)

    res
      .status(200)
      .json({ success: true, newComment, forUserId: req.user.userId })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/comment post /insert',
    })
  }
})

// update like/dislike
router.put(
  '/like/comment/update',
  async (req: CustomRequestIo, res: Response) => {
    try {
      // const { _id, like, dislike } = req.body
      const _id = req.body._id as Types.ObjectId
      if (!_id) {
        res
          .status(404)
          .json({
            success: false,
            message: 'Comment not found',
            forUserId: req.user.userId,
          })
      }
      const like = req.body.like as number
      const dislike = req.body.dislike as number
      const userId = new Types.ObjectId(req.user.userId)
      if (!userId) {
        res
          .status(404)
          .json({
            success: false,
            message: 'User not found',
            forUserId: req.user.userId,
          })
      }
      console.log('_id=', _id)
      console.log('like=', like)
      console.log('dislike=', dislike)

      const user = (await User.findById(userId)) as IUser
      console.log('user=', user)
      const commentIds = user?.votecomment?.map((id) => id.toString()) || []
      console.log(
        'user?.votecomment?.includes(_id)=',
        commentIds.includes(_id.toString()),
      )
      console.log('commentIds=', commentIds)
      console.log('_id=', _id)
      if (!commentIds.includes(_id.toString())) {
        const comment = await Comment.findByIdAndUpdate(
          _id,
          { like, dislike },
          { new: true },
        )

        // const user = await User.findById(userId)
        const arrayComments = user!.votecomment ?? []
        arrayComments.push(comment!._id)
        console.log('arrayComments=', arrayComments)
        const userVC = await User.findByIdAndUpdate(
          userId,
          { votecomment: arrayComments },
          { new: true },
        )
        res
          .status(200)
          .json({ success: true, comment, forUserId: req.user.userId })
      } else {
        const emitMessage = {
          messageKey: 'adminSinglePost.toast.voteOnce',
          forUserId: req.user.userId,
        }

        req.io
          ?.to('adminSinglePost')
          .emit('server_edit_comment_response', emitMessage)

        res
          .status(200)
          .json({
            success: false,
            message: 'vote once',
            forUserId: req.user.userId,
          })
      }
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/admin/comment put /like/comment/update',
        commentId: req.body._id,
      })
    }
  },
)

// update comment -------------------
router.put('/update', async (req: CustomRequestIo, res: Response) => {
  try {
    const { _id, content, content_ru, like, dislike, owner, postId } = req.body
    const updatedComment = await Comment.findByIdAndUpdate(
      _id,
      { content, like, dislike, owner, postId },
      { new: true },
    )
    const rucomment = await Rucomment.findOneAndUpdate(
      { commentId: updatedComment?._id },
      { content: content_ru },
      { new: true },
    )

    const admin = new AdminLogs({
      adminId: req.user.userId,
      what: `edit comment.id=${updatedComment?._id}`,
    })
    await admin.save()

    const emitMessage = {
      messageKey: 'adminSinglePost.toast.editComment',
      forUserId: req.user.userId,
    }

    req.io
      ?.to('adminSinglePost')
      .emit('server_edit_comment_response', emitMessage)

    res.status(200).json({ updatedComment, forUserId: req.user.userId })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/comment put /update',
      commentId: req.body._id,
    })
  }
})
// удаление всех комментариев поста
router.delete(
  '/delete_all/:id/:adminId',
  async (req: CustomRequestIo, res: Response) => {
    try {
      const postId = req.params.id
      const comments = await Comment.find({ postId })

      if (!comments || comments.length === 0) {
        res
          .status(404)
          .json({
            success: false,
            message: 'Comments not found',
            forUserId: req.user.userId,
          })
        return
      }
      console.log(
        `📝 Найдено ${comments.length} корневых комментариев для поста ${postId}`,
      )

      // 2. Параллельно собираем ID ВСЕХ деревьев комментариев
      const allTreesPromises = comments.map((comment) =>
        getAllNestedCommentIds(comment._id.toString()),
      )

      const allTreesArrays = await Promise.all(allTreesPromises)

      // 3. Объединяем все ID в один массив (убираем дубликаты)
      const commentsOfAllTrees = Array.from(new Set(allTreesArrays.flat()))
      console.log(
        `🌳 Удаляем ${commentsOfAllTrees.length} уникальных комментариев`,
      )

      // 4. Преобразуем в ObjectId для запросов
      const objectIds = commentsOfAllTrees.map((id) => new Types.ObjectId(id))

      // 5. Удаляем переводы и комментарии ПАРАЛЛЕЛЬНО
      const [deleteRucommentsResult, deleteCommentsResult] = await Promise.all([
        Rucomment.deleteMany({
          commentId: { $in: objectIds },
        }),
        Comment.deleteMany({
          _id: { $in: objectIds },
        }),
      ])

      console.log(
        `🗑️ Удалено: ${deleteCommentsResult.deletedCount} комментариев, 
        ${deleteRucommentsResult.deletedCount} переводов`,
      )

      // 6.1. Находим сколько комментариев удалено у КАЖДОГО пользователя
      const userCommentCounts = await Comment.aggregate([
        { $match: { _id: { $in: objectIds } } },
        {
          $group: {
            _id: '$owner', // Группируем по владельцу
            count: { $sum: 1 }, // Считаем сколько у каждого
          },
        },
      ])

      console.log('📊 Статистика по пользователям:', userCommentCounts)

      // 6.2. Обновляем каждого пользователя с его количеством
      const updatePromises = userCommentCounts.map(
        async ({ _id: userId, count }) => {
          return User.findByIdAndUpdate(
            userId,
            { $inc: { commentsCount: -count } }, // Уменьшаем на реальное количество
            { new: true },
          )
        },
      )

      await Promise.all(updatePromises)
      console.log(`👤 Обновлено ${userCommentCounts.length} пользователей`)

      // 6.3. Находим ВСЕХ уникальных пользователей, чьи комментарии удалены для статистики
      const affectedUsers = await Comment.find(
        { _id: { $in: objectIds } }, // Ищем комментарии из нашего списка
        'owner', // Выбираем ТОЛЬКО поле owner (владельца)
      ).distinct('owner')

      // 7. Логи
      const admin = new AdminLogs({
        adminId: req.params.adminId,
        what: `delete ALL comments for post ${postId}: ${deleteCommentsResult.deletedCount} comments, 
        ${deleteRucommentsResult.deletedCount} translations`,
      })
      await admin.save()

      // 8. Socket
      const emitMessage = {
        messageKey: 'adminSinglePost.toast.deleteAllComments',
        count: deleteCommentsResult.deletedCount,
        forUserId: req.user.userId,
      }

      req.io
        ?.to('adminSinglePost')
        .emit('server_delete_comment_response', emitMessage)

      // 9. Ответ
      res.status(200).json({
        success: true,
        message: `Deleted ${deleteCommentsResult.deletedCount} comments`,
        deletedComments: deleteCommentsResult.deletedCount,
        deletedTranslations: deleteRucommentsResult.deletedCount,
        deletedUsersAffected: affectedUsers.length,
        postId,
        forUserId: req.user.userId,
      })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/admin/comment delete /delete_all/:id/:adminId',
        postId: req.params.id,
      })
    }
  },
)

// удаление одного комментария поста
router.delete('/delete/:id', async (req: CustomRequestIo, res: Response) => {
  try {
    const commentId = req.params.id
    const comment = await Comment.findById(commentId)

    if (!comment) {
      res
        .status(404)
        .json({
          success: false,
          message: 'Comment not found',
          forUserId: req.user.userId,
        })
      return
    }

    const commentsOfAllTree = await getAllNestedCommentIds(
      comment._id.toString(),
    )

    // 4. Преобразуем в ObjectId для запросов
    const objectIds = commentsOfAllTree.map((id) => new Types.ObjectId(id))

    // 5. Удаляем переводы и комментарии ПАРАЛЛЕЛЬНО
    const [deleteRucommentsResult, deleteCommentsResult] = await Promise.all([
      Rucomment.deleteMany({
        commentId: { $in: objectIds },
      }),
      Comment.deleteMany({
        _id: { $in: objectIds },
      }),
    ])

    console.log(
      `🗑️ Удалено: ${deleteCommentsResult.deletedCount} комментариев, 
        ${deleteRucommentsResult.deletedCount} переводов`,
    )

    // 6.1. Находим сколько комментариев удалено у КАЖДОГО пользователя
    const userCommentCounts = await Comment.aggregate([
      { $match: { _id: { $in: objectIds } } },
      {
        $group: {
          _id: '$owner', // Группируем по владельцу
          count: { $sum: 1 }, // Считаем сколько у каждого
        },
      },
    ])

    console.log('📊 Статистика по пользователям:', userCommentCounts)

    // 6.2. Обновляем каждого пользователя с его количеством
    const updatePromises = userCommentCounts.map(
      async ({ _id: userId, count }) => {
        return User.findByIdAndUpdate(
          userId,
          { $inc: { commentsCount: -count } }, // Уменьшаем на реальное количество
          { new: true },
        )
      },
    )

    await Promise.all(updatePromises)
    console.log(`👤 Обновлено ${userCommentCounts.length} пользователей`)

    // 7. Логи
    const admin = new AdminLogs({
      adminId: req.user.userId,
      what: `delete comment for post ${commentId}: ${deleteCommentsResult.deletedCount} comments, 
        ${deleteRucommentsResult.deletedCount} translations`,
    })
    await admin.save()

    const emitMessage = {
      messageKey: 'adminSinglePost.toast.deleteComment',
      forUserId: req.user.userId,
    }

    req.io
      ?.to('adminSinglePost')
      .emit('server_delete_comment_response', emitMessage)

    // Отправляем успешный ответ
    res.status(200).json({
      success: true,
      message: `Deleted ${deleteCommentsResult.deletedCount} comments`,
      deletedComments: deleteCommentsResult.deletedCount,
      deletedTranslations: deleteRucommentsResult.deletedCount,
      postId: comment.postId,
      forUserId: req.user.userId,
    })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/comment delete /delete/:id',
      commentId: req.params.id,
    })
  }
})

export default router
