import { Router, Request, Response } from 'express'
import { Server } from 'socket.io'
import Category from '../models/Category'
import Rucategory from '../models/Rucategory'
import Post from '../models/Post'
import Rupost from '../models/Rupost'
import FileCategory from '../models/FileCategory'
import authMiddleware from '../middleware/auth.middleware'
import adminMiddleware from '../middleware/admin.middleware'
import CustomRequest from '../middleware/auth.middleware'
import Comment from '../models/Comment'
import Rucomment from '../models/Rucomment'
import AdminLogs from '../models/AdminLog'
import { Types, Schema, model } from 'mongoose'

const router = Router()

interface CustomRequestIo extends Request {
  io?: Server; // Добавляем свойство io
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

interface ICommentForm {  
  _id: Types.ObjectId,
  content: string,
  content_ru: string,
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

router.use(authMiddleware, adminMiddleware)

// расширенный русским переводом selectPost
router.get('/:id', async (req: Request, res: Response) => {
  try {                
    const comment = await Comment.findById(req.params.id)
    
    if (comment) {
      const rucomment = await Rucomment.findOne({commentId: comment._id})
      console.log('rupost=', rucomment)

      const selComment: ICommentForm = {} as ICommentForm
      selComment._id = comment._id
      selComment.content = comment.content      
      selComment.like = comment.like
      selComment.dislike = comment.dislike  
      selComment.content_ru = rucomment?.content!      

      console.log('selComment= ', selComment)
      res.json(selComment)
    }        
  } catch(e) {
    handlerError(e, res)
  }
})

// add new comment(addEdit form)
router.post('/insert', async (req: Request, res: Response) => {
  try {
    const { content, content_ru, like, dislike, owner, postId } = req.body
    const comment = new Comment({
      content, like, dislike, owner, postId
    })
    await comment.save()

    const rucomment = new Rucomment({content: content_ru, commentId: comment._id})
    await rucomment.save()
    
    res.status(201).json({ message: 'ok' })

  } catch (e) {
    console.log('error: ', e)
    handlerError(e, res)
  }
})

// update comment ------------------- 
router.put('/update/:adminId', async (req: CustomRequestIo, res: Response) => {
  try {
    const { id, content, content_ru, like, dislike, owner, postId } = req.body
    const comment = await Comment.findByIdAndUpdate(req.params.id,
      { content,
        like,
        dislike,
        owner,
        postId
      }, { new: true })
    const rucomment = await Rucomment.findOneAndUpdate({commentId: comment?._id},
      { content: content_ru }, { new: true })
      
    const admin = new AdminLogs({
      adminId: req.params.adminId, 
      what: `edit comment.id=${comment?._id}`
    })
    await admin.save()

      req.io?.to('singlePost').emit('server_edit_response', {
        messages: {
          en: `Comment has been updated successfully`,
          ru: `Комментарий был успешно обновлен`
      }}) 
    res.status(201).json({ comment })

  } catch (e) {
    console.log('error: ', e)
    handlerError(e, res)
  }
})
// удаление всех комментариев поста
router.delete('/delete_all/:id/:adminId', async (req: CustomRequestIo, res: Response) => {
  try {    
    // удаляем сначало все rucomment
    const postId = req.params.id
    const comments = await Comment.find({ postId })
    comments.map((comment) => {
      const rucomment = Rucomment.findOneAndDelete({commentId: comment._id})
    })
    // потом удаляем comments
    const comms = await Comment.deleteMany({ postId })
    // админлоги
    const admin = new AdminLogs({
      adminId: req.params.adminId, 
      what: `delete all comments post.id=${postId}`
    })
    await admin.save()

    req.io?.to('singlePost').emit('server_edit_response', {
      messages: {
        en: `Comments has been deleted successfully`,
        ru: `Комментарии были успешно удалены`
    }})
    res.json({message: 'ok'})
  } catch (e) {
    handlerError(e, res)
  }
})
// удаление одного комментария поста
router.delete('/delete/:id/:adminId', async (req: CustomRequestIo, res: Response) => {
  try {     
    const comment = await Comment.findByIdAndDelete(req.params.id)   
    const rucomment = Rucomment.findOneAndDelete({commentId: comment!._id})
    
    const admin = new AdminLogs({
      adminId: req.params.adminId, 
      what: `delete comment.id=${comment?._id}`
    })
    await admin.save()

    req.io?.to('singlePost').emit('server_edit_response', {
      messages: {
        en: `Comment has been deleted successfully`,
        ru: `Комментарий был успешно удален`
    }})
    res.json({message: 'ok'})
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