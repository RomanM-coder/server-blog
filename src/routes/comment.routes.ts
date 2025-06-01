import { Router, Request, Response } from 'express'
import Category from '../models/Category'
import Rucategory from '../models/Rucategory'
import Post from '../models/Post'
import User from '../models/User'
import Rupost from '../models/Rupost'
import FileCategory from '../models/FileCategory'
import authMiddleware from '../middleware/auth.middleware'
import Comment from '../models/Comment'
import Rucomment from '../models/Rucomment'
import { Types, Schema, model, syncIndexes } from 'mongoose'
import { Server } from 'socket.io'
const router = Router()

interface CustomRequestIo extends Request {
  io?: Server; // Добавляем свойство io
}

interface IUser {  
  email: String,
  password: String,
  verified: Boolean,
  role: String,
  votepost: [Types.ObjectId],
  votecomment: [Types.ObjectId],
  postsId: [Types.ObjectId]
}

interface IPost {  
  _id: Types.ObjectId,
  title: string,
  description: string, 
  favorite: number,
  nofavorite: number,
  categoryId: string//Types.ObjectId 
}

interface IRuPost {  
  _id: Types.ObjectId,
  title: string,
  description: string, 
  postId: Types.ObjectId,
  categoryId: string//Types.ObjectId 
}

interface IComment {  
  _id: string,
  content: string,
  like: number, 
  dislike: number,
  owner: string,
  postId: string
}

interface IRuComment {  
  _id: string,
  content: string,  
  commentId: string
}

interface ICommentLean extends Document{  
  _id: Types.ObjectId,
  content: string,
  like: number, 
  dislike: number,
  owner: Types.ObjectId,
  postId: Types.ObjectId
}

// add new comment(add form)
router.post('/insert', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { content, like, dislike, owner, postId } = req.body
    const comment = new Comment({
      content, like, dislike, owner, postId
    })
    await comment.save()

    // const user = await User.findById(owner)  
    // const arrayComments = user!.votecomment
    // arrayComments.push(comment._id)
    // const userWP = await User.findByIdAndUpdate(owner, {votecomment: arrayComments})

    res.status(201).json({ comment })

  } catch (e) {
    console.log('error: ', e)
    handlerError(e, res)
  }
})

// update like/dislike 
router.put('/update/:userId', authMiddleware, async (req: CustomRequestIo, res: Response) => {
  try {
    // const { _id, like, dislike } = req.body
    const _id = req.body._id as Types.ObjectId
    const like = req.body.like as number
    const dislike = req.body.dislike as number
    const userId = req.params.userId
    console.log('_id=', _id)
    console.log('like=', like)
    console.log('dislike=', dislike)
    
    const user = await User.findById(userId) as IUser
    console.log('user=', user)
    const commentIds = user?.votecomment?.map((id) => id.toString()) || []
    console.log('user?.votecomment?.includes(_id)=', commentIds.includes(_id.toString()))      
    if (!commentIds.includes(_id.toString())) {
      const comment = await Comment.findByIdAndUpdate(_id,
        { like,
          dislike         
        }, { new: true }) 

      // const user = await User.findById(userId)  
      const arrayComments = user!.votecomment ?? []
      arrayComments.push(comment!._id)
      console.log('arrayComments=', arrayComments)            
      const userWP = await User.findByIdAndUpdate(userId, {votecomment: arrayComments}, { new: true })       
      res.status(201).json({ comment })
    } else {
      console.log('req-----------')
      
      req.io?.to('singlePost').emit('server_edit_response', {
      messages: {
        en: 'The user can vote only once.',
        ru: 'Пользователь может проголосовать только один раз',
      }})
      res.status(201).json({message: 'only once'})
    } 
  } catch (e) {
    console.log('error: ', e)
    handlerError(e, res)
  }
})

// get all comment in post   
router.get('/detail/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    let outComments: IComment[] = []
    // await new Promise((resolve) => setTimeout(resolve, 300))
    await Comment.syncIndexes()
    let comments: IComment[] = await Comment.find({ postId: req.params.id })
    console.log('comments=', comments)

    // language = ru
    if (req.headers['accept-language'] === 'ru') {
      let rucomments: IRuComment[] = []
      for (const comment of comments) {
        const rucomment = await Rucomment.findOne({ commentId: comment._id }) as IRuComment        
        rucomments.push(rucomment)
      }
      // const rucomments = await Rucomment.find({ commentId: req.params.id.toString() })

      console.log('rucomments=', rucomments)
      console.log('comments перед мапом=', comments)
      comments.map((comment) => {
        console.log('comment=', comment)
        const ruComment = rucomments.find((comment_ru) =>
          comment_ru.commentId.toString() === comment._id.toString() 
        ) as IRuComment

        console.log('ruComment=', ruComment)
        const support: IComment = {
          _id: comment._id,
          content: ruComment.content,
          like: comment.like,
          dislike: comment.dislike,
          owner: comment.owner,
          postId: comment.postId
        }
        outComments.push(support)
      })
      comments = outComments
    }

    let post = await Post.findById(req.params.id) as IPost
    if (req.headers['accept-language'] === 'ru') {       
      const postRu = await Rupost.findOne({ postId: req.params.id }) as IRuPost      
      post.title = postRu.title
      post.description = postRu.description
      console.log('post', post)
    }

    res.json({ comments, post })
  } catch (e) {
    handlerError(e, res)
  }
})

// search comments   по id post
router.get('/search/:postId', authMiddleware, async (req, res): Promise<void> => {
  try {
    let commentSearch: IComment[] = []
    const query = req.query.query as string
    console.log('query=', query)

    const comments: IComment[] = await Comment.find({ postId: req.params.postId })
    console.log('comments=', comments)
    if (query !== "") {
      comments.filter((comment) => {
        if (query === "") {
          //if query is empty
          return comment
        } else if (comment.content.toLowerCase().includes(query.toLowerCase())) {
          commentSearch.push(comment)
          console.log('--------------', commentSearch.length)

          //returns filtered array
          return comment
        }
      })     
      res.json(commentSearch)
    } else res.json(comments)

  } catch (e) {
    handlerError(e, res)
  }
})

const handlerError = (e: unknown, res: Response) => {
  if (e instanceof Error) { 
    res.status(500).json({message: 'Что-то пошло не так.'+ (e.message ?? e.name
    )})
  } else {
    console.log('Unknown error:', e)
  }
}

export default router