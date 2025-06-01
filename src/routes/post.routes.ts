import { Router, Request, Response } from 'express'
import Category from '../models/Category'
import User from '../models/User'
import Rucategory from '../models/Rucategory'
import Post from '../models/Post'
import Rupost from '../models/Rupost'
import authMiddleware from '../middleware/auth.middleware'
import CustomRequest from '../middleware/auth.middleware'
import { Types } from 'mongoose'
import { Server } from 'socket.io'

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

// update favorite and nofavorite
router.put('/update/:userId', authMiddleware, async (req: CustomRequestIo, res) => {
  try {
    console.log('req.body=', req.body)      
    const { _id, favorite, nofavorite } = req.body
    const userId = req.params.userId

    const user = await User.findById(userId)

    if (!user?.votepost?.includes(_id)) {   
      const post = await Post.findByIdAndUpdate(_id,
        { favorite,
          nofavorite
        }, { new: true })
      console.log('post=', post)

      if (!post) {
        res.status(404).json({ message: 'Post not found' })
      } else {
        // const user = await User.findById(userId)  
        const arrayPosts = user!.votepost ?? []
        console.log('arrayPosts=', arrayPosts)        
        arrayPosts.push(post._id)
        console.log('arrayPosts=', arrayPosts)
        const userWP = await User.findByIdAndUpdate(userId, {votepost: arrayPosts}, { new: true })
        console.log('userWP=', userWP)

        res.status(201).json({ post })
      }
    } else {
      console.log('req-----------')
      const emitMessage =  { messages: {
        en: 'The user can vote only once.',
        ru: 'Пользователь может проголосовать только один раз',
      }}
      
      req.io?.to('posts').emit('server_edit_response', emitMessage)
      req.io?.to('singlePost').emit('server_edit_response', emitMessage)
      req.io?.to('adminPosts').emit('server_edit_response', emitMessage)
      req.io?.to('adminSinglePost').emit('server_edit_response', emitMessage)

      res.status(201).json({message: 'only once'})
    }
  } catch (e) {
    handlerError(e, res)
  }
})

// get all posts in category  
router.get('/:categoryId', authMiddleware, async (req, res) => {
  try {
    let outPosts: IPost[] = []
    const categoryId = req.params.categoryId
    let posts: IPost[] = await Post.find({ categoryId })
    // language = ru
    if (req.headers['accept-language'] === 'ru') {
      const ruposts: IRuPost[] = await Rupost.find({ categoryId: categoryId.toString() })

      console.log('ruposts=', ruposts)
      posts.map((post) => {
        // console.log('category._id=', category._id)

        const rupost = ruposts.find((post_ru) => post_ru.postId.toString() === post._id.toString())
        if (rupost) {
          console.log('rupost=', rupost)
          const support: IPost = {
            _id: post._id,
            title: rupost.title,
            description: rupost.description,
            favorite: post.favorite,
            nofavorite: post.nofavorite,
            categoryId
          }
          outPosts.push(support)
        }
      })
      posts = outPosts
    }

    let category = await Category.findById(req.params.categoryId)

    if (req.headers['accept-language'] === 'ru') {
      category = await Rucategory.findOne({ categoryId: req.params.categoryId })
      console.log('category', category)
    }

    res.json({ posts, category })
  } catch (e) {
    handlerError(e, res)
  }
})

// get post по id
router.get('/detail/:id', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
    res.json(post)
  } catch (e) {
    handlerError(e, res)
  }
})

// search posts по id category
router.get('/search/:categoryId', authMiddleware, async (req, res): Promise<void> => {
  try {
    let postSearch: IPost[] = []
    const query = req.query.query as string
    console.log('query=', query)

    const posts: IPost[] = await Post.find({ categoryId: req.params.categoryId })
    console.log('posts=', posts)
    if (query !== "") {
      posts.filter((post) => {
        if (query === "") {
          //if query is empty
          return post
        } else if (post.title.toLowerCase().includes(query.toLowerCase())) {
          postSearch.push(post)
          console.log('--------------', postSearch.length)

          //returns filtered array
          return post
        }
      })     
      res.json(postSearch)
    } else res.json(posts)

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