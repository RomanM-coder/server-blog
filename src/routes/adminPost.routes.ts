import { Router, Request, Response } from 'express'
import { Server } from 'socket.io'
import Category from '../models/Category'
import Rucategory from '../models/Rucategory'
import User from '../models/User'
import AdminLogs from '../models/AdminLog'
import Post from '../models/Post'
import Rupost from '../models/Rupost'
import authMiddleware from '../middleware/auth.middleware'
import adminMiddleware from '../middleware/admin.middleware'
import CustomRequest from '../middleware/auth.middleware'
import { Types } from 'mongoose'

const router = Router()
router.use(authMiddleware, adminMiddleware)

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

interface IPostForm {  
  _id: Types.ObjectId,
  title: string,
  title_ru: string,
  description: string,
  description_ru: string,
  favorite: number,
  nofavorite: number, 
  postId: Types.ObjectId,
  categoryId: string//Types.ObjectId 
}

// add new post
router.post('/insert', async (req: CustomRequestIo, res) => {
  try {
    const { title, title_ru, description, description_ru, liked, categoryId, userId } = req.body
    const post = new Post({
      title, description, liked, categoryId
    })
    await post.save()

    const rupost = new Rupost({
      title: title_ru, 
      description: description_ru, 
      postId: post._id, 
      categoryId
    })
    await rupost.save()

    const user = await User.findById(userId)  
    const arrayPosts = user!.postsId
    arrayPosts.push(post._id)
    const userWP = await User.findByIdAndUpdate(userId, {postId: arrayPosts})

    const admin = new AdminLogs({
      adminId: req.params.adminId, 
      what: `insert post.id=${post?._id}`
    })
    await admin.save()
      
    req.io?.to('posts').emit('server_edit_response', {
      messages: {
        en: `Post ${post?.title} has been added successfully`,
        ru: `Пост ${post?.title} был успешно добавлен`        
    }})
    res.status(201).json({ post })

  } catch (e) {    
    handlerError(e, res)
  }
})

// update title(title_ru) ,description(description_ru), favorite, nofavorite
router.put('/edit', async (req: CustomRequestIo, res) => {
  try {
    const { id, title, title_ru, description, description_ru, favorite, nofavorite } = req.body
    const post = await Post.findByIdAndUpdate(id,
      { title,        
        description,
        favorite,
        nofavorite
      }, { new: true })

    const rupost = await Rupost.findOneAndUpdate({postId: id},
      { title: title_ru,
        description: description_ru
      }, { new: true })

    const admin = new AdminLogs({
      adminId: req.params.adminId, 
      what: `edit post.id=${post?._id}`
    })
    await admin.save()  
    
    req.io?.to('posts').emit('server_edit_response', {
      messages: {
        en: `Post ${post?.title} has been updated successfully`,
        ru: `Пост ${post?.title} был успешно обновлен`
    }})  
    res.status(201).json({ post })

  } catch (e) {
    handlerError(e, res)
  }
})

// delete post по id
router.delete('/delete/:id/:adminId', async (req: CustomRequestIo, res) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id)
    const rupost = await Rupost.findOneAndDelete({postId: post?._id})
    
    const admin = new AdminLogs({
      adminId: req.params.adminId, 
      what: `delete post.id=${post?._id}`
    })
    await admin.save()

    req.io?.to('posts').emit('server_edit_response', {
      messages: {
        en: `Post ${post?.title} has been deleted successfully`,
        ru: `Пост ${post?.title} был успешно удален`
    }})
    res.json(post)
  } catch (e) {
    handlerError(e, res)
  }
})

// расширенный русским переводом selectPost
router.get('/:id', async (req: Request, res: Response) => {
  try {                
    const post = await Post.findById(req.params.id)
    
    if (post) {
      const rupost = await Rupost.findOne({postId: post._id})
      console.log('rupost=', rupost)

      const selPost: IPostForm = {} as IPostForm
      selPost._id = post._id
      selPost.title = post.title
      selPost.description = post.description
      selPost.favorite = post.favorite
      selPost.nofavorite = post.nofavorite  
      selPost.title_ru = rupost?.title!
      selPost.description_ru = rupost?.description!

      console.log('selPost= ', selPost)
      res.json(selPost)
    }        
  } catch(e) {
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