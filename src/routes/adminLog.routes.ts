import { Router, Request, Response } from 'express'
import { Server } from 'socket.io'
import bcrypt from 'bcrypt'
import { generatePassword } from '../helper/genPassword'
import config from 'config'
import Post from '../models/Post'
import User from '../models/User'
import AdminLog from '../models/AdminLog'
import Comment from '../models/Comment'
import authMiddleware from '../middleware/auth.middleware'
import adminMiddleware from '../middleware/admin.middleware'
import { Types, SortOrder } from 'mongoose'
const router = Router()

interface CustomRequestIo extends Request {
  io?: Server; // Добавляем свойство io
}

interface IAdminLog {
  _id: Types.ObjectId,
  adminId: string,
  what: string,
  time: Date  
}

router.use(authMiddleware, adminMiddleware)

router.post('/sort', async (req: Request, res: Response) => {
  try {
    const { sortField, sortOrder, dataSearch }: { sortField: string; sortOrder: 'asc' | 'desc' | 'none', dataSearch: string } = req.body 
     
    let adminSearch: IAdminLog[] = []
    console.log('sortField=', sortField)
    console.log('sortOrder=', sortOrder)
    console.log('dataSearch=', dataSearch)
    // Проверяем корректность поля сортировки
    if (!['adminId', 'what', 'time'].includes(sortField || '')) {  
      res.status(400).json({ message: 'Invalid sort field' })
    } else {

      // Создаём объект сортировки
      const sortOptions: { [key: string]: SortOrder } = {}
      if (sortField && sortOrder !== 'none') {
        sortOptions[sortField] = sortOrder === 'asc' ? 1 : -1
      }
      console.log('sortOptions=', sortOptions)
      console.log('sortOrder=', sortOrder)
        
      let admins: IAdminLog[] = await AdminLog.find().sort(sortOptions).lean()
      console.log('admins=', admins)                                                            
      if (admins.length === undefined || admins.length == 0) res.status(400).json({ message: 'Админы не найдены' })
      else if (dataSearch && dataSearch.trim() !== '') {      
        admins.filter((admin) => {        
          if (admin.adminId.trim().toLowerCase().includes(dataSearch.toLowerCase())) {
            adminSearch.push(admin)
            console.log('--------------', adminSearch.length)            
            //returns filtered element array
            return admin
          }
        })        
        res.json(adminSearch)     
      } else res.json(admins)
    }
  } catch(e) {
    handlerError(e, res)
  }
})

router.get('/search', async (req: Request, res: Response) => {
  try {
    let admins: IAdminLog[] = await AdminLog.find() // for language = ru
    let adminSearch: IAdminLog[] = []
    const query: string = req.query.query as string
    console.log('query=', query)
   
    if (!admins) res.status(400).json({ message: 'Админы не найдены' })
    else {
      if (query !== "") { 
        admins.filter((admin) => {      
        
          if (admin.adminId.trim().toLowerCase().includes(query.toLowerCase())) {
            adminSearch.push(admin)
            console.log('--------------', adminSearch.length)            
            //returns filtered element array
            return admin
          }
        })        
        res.json(adminSearch)
      } else {console.log('dataSeearch=', query)      
        res.json(admins)
      }
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