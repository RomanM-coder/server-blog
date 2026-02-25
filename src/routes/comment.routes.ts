import { Router, Request, Response } from 'express'
import Post from '../models/Post'
import User from '../models/User'
import Rupost from '../models/Rupost'
import authMiddleware from '../middleware/auth.middleware'
import Comment from '../models/Comment'
import Rucomment from '../models/Rucomment'
import { Types, Document } from 'mongoose'
import { Server } from 'socket.io'
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

interface IPost {
  _id: Types.ObjectId
  title: string
  sections: [ISectionPost]
  favorite: number
  nofavorite: number
  categoryId: string //Types.ObjectId
}

interface ISectionPost {
  type: string
  content?: string
  path?: string
  alt?: string
  order?: number
}

interface IRuPost {
  _id: Types.ObjectId
  title: string
  sections: [ISectionPost]
  postId: Types.ObjectId
  categoryId: string //Types.ObjectId
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

interface IRuComment {
  _id: string
  content: string
  commentId: string
}

interface ICommentLean extends Document {
  _id: Types.ObjectId
  content: string
  like: number
  dislike: number
  owner: Types.ObjectId
  postId: Types.ObjectId
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

const getRuCommentsFull = async (
  comments: IComment[],
  outComments: ICommentFull[],
): Promise<ICommentFull[] | undefined> => {
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

      if (postRu) {
        post.title = postRu.title
        post.sections = postRu.sections
      }

      const support1: ICommentFull = {
        _id: comment._id,
        content: content,
        createdAt: comment.createdAt,
        like: comment.like,
        dislike: comment.dislike,
        related: comment.related,
        user: user,
        post: post,
      }
      outComments.push(support1)
    } catch (error) {
      console.error(`Error processing comment ${comment._id}:`, error)
      // Продолжаем обработку остальных комментариев
      continue
    }
  }
  return outComments
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
        $or: [{ like: { $gt: 2 } }, { dislike: { $gt: 2 } }],
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

// add new comment(add form)
router.post('/insert', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { content, like, dislike, related, postId } = req.body
    const owner = req.user.userId

    // const newComment = new Comment({
    const newComment = await Comment.insertOne({
      content,
      like,
      dislike,
      owner,
      related,
      postId,
    })
    await newComment.save()

    const user = await User.findByIdAndUpdate(
      owner,
      { $inc: { commentsCount: 1 } },
      { new: true },
    )

    if (!user) {
      res
        .status(404)
        .json({ message: 'User not found', forUserId: req.user.userId })
      return
    }

    // const user = await User.findById(owner)
    // const arrayComments = user!.votecomment
    // arrayComments.push(comment._id)
    // const userWP = await User.findByIdAndUpdate(owner, {votecomment: arrayComments})

    res.status(200).json({ newComment, forUserId: req.user.userId })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/comment post /insert',
      userId: req.user.userId,
    })
  }
})

// update like/dislike
router.put(
  '/update',
  authMiddleware,
  async (req: CustomRequestIo, res: Response) => {
    try {
      // const { _id, like, dislike } = req.body
      const _id = req.body._id as Types.ObjectId
      if (!_id) {
        res
          .status(404)
          .json({ message: 'Comment not found', forUserId: req.user.userId })
      }
      const like = req.body.like as number
      const dislike = req.body.dislike as number
      const userId = new Types.ObjectId(req.user.userId)
      if (!userId) {
        res
          .status(404)
          .json({ message: 'User not found', forUserId: req.user.userId })
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
        res.status(200).json({ comment, forUserId: req.user.userId })
      } else {
        const emitMessage = {
          messageKey: 'adminSinglePost.toast.voteOnce',
          forUserId: req.user.userId,
        }

        req.io
          ?.to('singlePost')
          .emit('server_edit_comment_response', emitMessage)

        res
          .status(200)
          .json({ message: 'vote once', forUserId: req.user.userId })
      }
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/comment put /update',
        commentId: req.body._id,
      })
    }
  },
)

// get all comments in post
router.get(
  '/detail/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      console.log('get all comments in post - /detail/:id')
      let outComments: ICommentFull[] | undefined = []

      if (!req.params.id) {
        res.status(404).json({
          message: 'Post is not found',
        })
        return
      }
      // await new Promise((resolve) => setTimeout(resolve, 300))
      await Comment.syncIndexes()
      let comments: IComment[] = await Comment.find({ postId: req.params.id })
        .sort({ createdAt: -1 })
        .lean<IComment[]>()
      console.log('comments=', comments)
      console.log('comments-count=', comments.length)

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
      console.log('outComments-count=', outComments!.length)
      const outPost = (await Post.findById(req.params.id)) as IPost

      res.json({ outComments, outPost })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/comment get /detail/:id',
        postId: req.params.id,
      })
    }
  },
)

router.get(
  '/popularcomments',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('get all popular comment (при старте) - /popularcomments')
      let outComments: ICommentFull[] | undefined = []
      const page = Number(req.query.page) || 1
      let sortBy = req.query.sortBy as string
      const limit = Number(req.query.limit) || 3
      console.log('page=', page)
      console.log('sortBy=', sortBy)

      // await new Promise((resolve) => setTimeout(resolve, 300))
      // await Comment.syncIndexes()
      let dateFilter = {}
      let sortOptions = {}
      const result = sortirovka(dateFilter, sortOptions, sortBy)
      dateFilter = result.dateFilter
      sortOptions = result.sortOptions

      const countComments: IComment[] =
        await Comment.find(dateFilter).lean<IComment[]>()

      // let comments: IComment[] = await Comment.find({ like: { $gt: 3 } })
      // console.log('comments=', comments)
      console.log('dateFilter=', dateFilter)
      console.log('sortOptions=', sortOptions)

      const comments: IComment[] = await Comment.find(dateFilter)
        .sort(sortOptions)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<IComment[]>()

      // language = ru
      if (req.headers['accept-language'] === 'ru') {
        outComments = await getRuCommentsFull(comments, outComments)
      } else {
        for (const comment of comments) {
          const user = (await User.findById(comment.owner)) as IUser
          let post = (await Post.findById(comment.postId)) as IPost

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
      console.log('outComments=', outComments)
      const count = countComments.length

      res.json({ outComments, count })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/comment get /popularcomments',
      })
    }
  },
)

// get select comment (для вставки)  + все связанные comments
router.get(
  '/commentsInsertInPostList/:id',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      console.log('get select comment (для вставки)  + все связанные comments')
      console.log(
        "req.headers['accept-language']-commentsInsertInPostList",
        req.headers['accept-language'],
      )

      let outComments: ICommentFull[] | undefined = []

      function combineComments(
        mainComment: IComment | null,
        relatedComments: IComment[],
      ): IComment[] {
        if (mainComment) {
          return [mainComment, ...relatedComments]
        }
        return relatedComments
      }
      console.log('req.params.id=', req.params.id)

      let comment = await Comment.findById(req.params.id).lean<IComment>()
      if (!comment) {
        res.status(404).json({
          message: 'Comment is not found',
        })
        return
      }
      let comment2 = await Comment.find({ related: comment?._id }).lean<
        IComment[]
      >()
      console.log('comment=', comment)
      console.log('comment2=', comment2)
      const sumComments = combineComments(comment, comment2)
      let summaComments: IComment[] = []
      for (const summaComment of sumComments) {
        summaComments.push(summaComment)
      }

      // language = ru
      if (req.headers['accept-language'] === 'ru') {
        outComments = await getRuCommentsFull(summaComments, outComments)
      } else {
        // language = en
        for (const comment of sumComments) {
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
      res.json({ outComments })
    } catch (e) {
      handlerError(e, res, {
        endpoint: '/api/comment get /commentsInsertInPostList/:id',
        commentId: req.params.id,
      })
    }
  },
)

// search comments
router.get('/search', authMiddleware, async (req, res): Promise<void> => {
  try {
    console.log('search comments - /search')
    let outComments: ICommentFull[] | undefined = []
    let comments: IComment[] = []
    let countComments: number = 0

    // const skip = (parseInt(page) - 1) * parseInt(limit)
    const page = Number(req.query.page) || 1
    const searchString = req.query.q as string
    let sortBy = req.query.sortBy as string
    if (sortBy === undefined) sortBy = 'all'
    const limit = Number(req.query.limit) || 3
    const queryConditions: any = {}
    const queryConditions2: any = {}

    console.log('page=', page)
    console.log('searchString=', searchString)
    console.log('sortBy=', sortBy)

    // Поиск по тексту
    if (searchString && typeof searchString === 'string' && searchString) {
      queryConditions.content = { $regex: searchString, $options: 'i' }
    }
    console.log('queryConditions=', queryConditions)

    if (req.headers['accept-language'] === 'ru') {
      const ruComments: IRuComment[] = await Rucomment.find(queryConditions)

      // собираем все Id en комментариев из ruComments
      const Ids = ruComments.map((comment) => comment.commentId.toString())
      console.log('Ru Ids=', Ids)
      queryConditions2._id = { $in: Ids }

      // Сортировка
      let dateFilter = {}
      let sortOptions = {}
      const result = sortirovka(dateFilter, sortOptions, sortBy)
      dateFilter = result.dateFilter
      sortOptions = result.sortOptions

      console.log('Финальный Ru-Comment запрос MongoDB в search:', {
        filter: queryConditions2,
        sort: sortOptions,
      })

      comments = await Comment.find(queryConditions2)
        .sort(sortOptions)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<IComment[]>()

      console.log('Ru-comment   comments=', comments)

      // количество постов
      countComments = await Comment.countDocuments(queryConditions2)
    } else {
      // Сортировка
      let dateFilter = {}
      let sortOptions = {}
      const result = sortirovka(dateFilter, sortOptions, sortBy)
      dateFilter = result.dateFilter
      sortOptions = result.sortOptions

      // Объединяем все условия
      const finalQuery = {
        ...queryConditions, // ваши основные условия ( content поиск)
        ...dateFilter, // фильтр по дате
      }

      comments = await Comment.find(finalQuery)
        .sort(sortOptions)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<IComment[]>()

      countComments = await Comment.countDocuments(finalQuery)
    }

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
    console.log('outComments=', outComments)
    res.json({ outComments, countComments })
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/comment get /search',
    })
  }
})

export default router
