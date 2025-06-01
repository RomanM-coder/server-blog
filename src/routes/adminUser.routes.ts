import { Router, Request, Response } from 'express'
import { Server } from 'socket.io'
import bcrypt from 'bcrypt'
import { generatePassword } from '../helper/genPassword'
import { UploadedFile } from 'express-fileupload'
import config from 'config'
import fs from 'fs'
import fileService from './fileService' 
import Category from '../models/Category'
import Rucategory from '../models/Rucategory'
import Post from '../models/Post'
import Rupost from '../models/Rupost'
import FileCategory from '../models/FileCategory'
import User from '../models/User'
import AdminLogs from '../models/AdminLog'
import Comment from '../models/Comment'
import authMiddleware from '../middleware/auth.middleware'
import adminMiddleware from '../middleware/admin.middleware'
import { Types, SortOrder } from 'mongoose'
const router = Router()

interface CustomRequestIo extends Request {
  io?: Server; // Добавляем свойство io
}

interface IUser {
  _id: Types.ObjectId,
  email: string,
  verified: boolean,
  role: string,
  block: boolean,
  createdAt: Date,
  lastLogin?: Date,
  votepost: Types.ObjectId[],
  votecomment: Types.ObjectId[],
  postsId: Types.ObjectId[]  
}

router.use(authMiddleware, adminMiddleware)

router.post('/sort', async (req: Request, res: Response) => {
  try {
    const { sortField, sortOrder, dataSearch }: { sortField: string; sortOrder: 'asc' | 'desc' | 'none', dataSearch: string } = req.body 
     
    let userSearch: IUser[] = []
    console.log('sortField=', sortField)
    console.log('sortOrder=', sortOrder)
    console.log('dataSearch=', dataSearch)
    // Проверяем корректность поля сортировки
    if (!['email', 'role', 'createAt', 'lastLogin'].includes(sortField || '')) {  
      res.status(400).json({ message: 'Invalid sort field' })
    } else {

      // Создаём объект сортировки
      const sortOptions: { [key: string]: SortOrder } = {}
      if (sortField && sortOrder !== 'none') {
        sortOptions[sortField] = sortOrder === 'asc' ? 1 : -1
      }
      console.log('sortOptions=', sortOptions)
      console.log('sortOrder=', sortOrder)
        
      let users: IUser[] = await User.find().sort(sortOptions).lean()
      console.log('users=', users)                                                            
      if (users.length === undefined || users.length == 0) res.status(400).json({ message: 'Пользователи не найдены' })
      else if (dataSearch && dataSearch.trim() !== '') {      
        users.filter((user) => {        
          if (user.email.trim().toLowerCase().includes(dataSearch.toLowerCase())) {
            userSearch.push(user)
            console.log('--------------', userSearch.length)            
            //returns filtered element array
            return user
          }
        })        
        res.json(userSearch)     
      } else res.json(users)
    }
  } catch(e) {
    handlerError(e, res)
  }
})

router.get('/allposts&comments', async (req: Request, res: Response) => {
  try {                  
    const allPosts = await Post.find()
    const allComments = await Comment.find()
    const posts = allPosts.map(obj => obj._id)
    const comments = allComments.map(obj => obj._id)
    console.log('posts= ', posts.length)
    console.log('comments= ', comments.length)
    res.json({posts, comments})
          
  } catch(e) {
    handlerError(e, res)
  }
})

router.get('/search', async (req: Request, res: Response) => {
  try {
    let users: IUser[] = await User.find() // for language = ru
    let userSearch: IUser[] = []
    const query: string = req.query.query as string
    console.log('query=', query)
   
    if (!users) res.status(400).json({ message: 'Пользователи не найдены' })
    else {
      if (query !== "") { 
        users.filter((user) => {      
        
          if (user.email.trim().toLowerCase().includes(query.toLowerCase())) {
            userSearch.push(user)
            console.log('--------------', userSearch.length)            
            //returns filtered element array
            return user
          }
        })        
        res.json(userSearch)
      } else {console.log('dataSeearch=', query)      
        res.json(users)
      }
    }

  } catch(e) {
    handlerError(e, res)
  }
})

// add new user
router.post('/insert', async (req: CustomRequestIo, res) => {
  try {   
    const { email, role, block, verified, createdAt, lastLogin, votepost, votecomment, adminId } = req.body
    const blockBool = block === 'true' ? true : false
    const verifiedBool = verified === 'true' ? true : false    
    const lastLoginDate = lastLogin === 'null' ? undefined : new Date(lastLogin)
    const votecommentParse = JSON.parse(votecomment)    
    const votepostParse = JSON.parse(votepost)
    const password = generatePassword()
    const hashedPassword = await bcrypt.hash(password, 12)

    if (!Array.isArray(votecommentParse)) {
      throw new Error("Ожидался массив votecomment")
    }
    if (!Array.isArray(votepostParse)) {
      throw new Error("Ожидался массив votepost")
    }
    const newUser = new User({ 
      email,
      password: hashedPassword, 
      role, 
      block: blockBool, 
      verified: verifiedBool, 
      createdAt: new Date(createdAt), 
      lastLogin: lastLoginDate, 
      votepost: votepostParse, 
      votecomment: votecommentParse })
    await newUser.save()
    
    const admin = new AdminLogs({
      adminId: adminId, 
      what: `add new user.id=${newUser?._id}`
    })
    await admin.save()
      
    req.io?.to('posts').emit('server_edit_response', {
      messages: {
        en: `Post ${newUser?.email} has been added successfully`,
        ru: `Пост ${newUser?.email} был успешно добавлен`        
    }})
    res.status(201).json({ newUser })

  } catch (e) {    
    handlerError(e, res)
  }
})

// update user
router.put('/edit', async (req: CustomRequestIo, res) => {
  try {
    const { id, email, role, block, verified, createdAt, lastLogin, votepost, votecomment, adminId } = req.body
    const blockBool = block === 'true' ? true : false
    const verifiedBool = verified === 'true' ? true : false
    const createdAtDate = new Date(createdAt)
    const lastLoginDate = lastLogin === 'null' ? undefined : new Date(lastLogin)
    const votecommentParse = JSON.parse(votecomment)    
    const votepostParse = JSON.parse(votepost)
    console.log('votecomment typeof', typeof votecomment)
    
    if (!Array.isArray(votecommentParse)) {
      throw new Error("Ожидался массив votecomment")
    }
    if (!Array.isArray(votepostParse)) {
      throw new Error("Ожидался массив votepost")
    }
    const user = await User.findByIdAndUpdate(id,
      { email, 
        role, 
        block: blockBool, 
        verified: verifiedBool, 
        createdAt: createdAtDate, 
        lastLogin: lastLoginDate, 
        votepost: votepostParse, 
        votecomment: votecommentParse
      }, { new: true })
    
    const adminLogs = new AdminLogs({
      adminId: adminId,
      what: `Edit user(id=${id})`
    })
    await adminLogs.save()   
    
    req.io?.to('posts').emit('server_edit_response', {
      messages: {
        en: `Post ${user?.email} has been updated successfully`,
        ru: `Пост ${user?.email} был успешно обновлен`
    }})  
    res.status(201).json({ user })

  } catch (e) {
    handlerError(e, res)
  }
})

// delete user по id
router.delete('/delete/:id/:adminId', async (req: CustomRequestIo, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id)
    const admin = new AdminLogs({
      adminId: req.params.adminId, 
      what: `delete user.id=${user?._id}`
    })
    await admin.save()     

    req.io?.to('posts').emit('server_edit_response', {
      messages: {
        en: `Post ${user?.email} has been deleted successfully`,
        ru: `Пост ${user?.email} был успешно удален`
    }})
    res.json(user)
  } catch (e) {
    handlerError(e, res)
  }
})

// selectUser по id
router.get('/:id', async (req: Request, res: Response) => {
  try {                
    const user = await User.findById(req.params.id)
    if (user) res.json(user)
    else res.status(500).json({message: 'Такого юзера нет'})              
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