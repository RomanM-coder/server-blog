import { Router, Request, Response} from 'express'
import { Server } from 'socket.io'
import { UploadedFile } from 'express-fileupload'
// import config from 'config'
import fs from 'fs'
import fileService from './fileService' 
import Category from '../models/Category'
import AdminLogs from '../models/AdminLog'
import Rucategory from '../models/Rucategory'
import Post from '../models/Post'
import Rupost from '../models/Rupost'
import FileCategory from '../models/FileCategory'
import authMiddleware from '../middleware/auth.middleware'
import adminMiddleware from '../middleware/admin.middleware'
import { Types, SortOrder } from 'mongoose'
import dotenv from "dotenv"
dotenv.config() // Загрузка переменных окружения
const router = Router()

interface CustomRequestIo extends Request {
  io?: Server; // Добавляем свойство io
}

interface ICategory {
  _id: Types.ObjectId,
  name: string,
  link: string,
  description: string
}

interface IRuCategory {
  _id: Types.ObjectId,
  name: string, 
  description: string,
  categoryId: Types.ObjectId
}

interface ICategoryForm {
  _id: Types.ObjectId,
  name: string,
  name_ru: string, 
  description: string,
  description_ru: string,
  file: string
}

const FILE_CATEGORY_PATH = process.env.FILE_CATEGORY_PATH

// const upload = multer({ dest: 'categoryFiles/' })
router.use(authMiddleware, adminMiddleware)

// add new category (add form)
router.post('/insert', async (req: CustomRequestIo, res: Response) => {
  try {        
    const {name, name_ru, description, description_ru} = req.body
    const file = req.files?.file as UploadedFile     
    console.log('name=', name)
    console.log('name_ru=', name_ru)
    console.log('description=', description)
    console.log('description_ru=', description_ru)
    console.log('file=', file)    

    const category = new Category({
      name,
      link: file.name,      
      description 
    })    
    await category.save()

    const category_ru = new Rucategory({
      name: name_ru,
      description: description_ru,
      categoryId: category._id
    })
    await category_ru.save()

    const admin = new AdminLogs({
      adminId: req.params.adminId, 
      what: `insert category.id=${category?._id}`
    })
    await admin.save()

    // add fileCategory
    // const FILE_CATEGORY_PATH = process.env.FILE_CATEGORY_PATH 
    const dirPath = `${FILE_CATEGORY_PATH}\\${name}`
    if (fs.existsSync(dirPath)) {
      res.status(400).json({ message: 'Directory already exist' })
    } else {
      // console.log('filePath ', filePath)   
      await fileService.createDir(dirPath)

      const filePath = `${FILE_CATEGORY_PATH}\\${name}\\${file.name}`
      file.mv(filePath)

      const type = file.name.split('.').pop()
      const newFile = {
        name: file.name,
        type: type,
        size: file.size,
        categoryId: category._id
      }
      console.log('newFileCat=', newFile)
      const dbFile = new FileCategory(newFile)

      await dbFile.save()
      req.io?.to('categories').emit('server_edit_response', {
        messages: {
          en: `Category ${category?.name} has been added successfully`,
          ru: `Категория ${category_ru?.name} была успешно добавлена`,
        }})
      res.status(201).json({message: 'ok'})
    } 

  } catch(e) {
    handlerError(e, res)
  }
})

// update name, link, description in Category(edit form)
// update all fields in FileCategory
router.put('/edit', async (req: CustomRequestIo, res: Response) => {
  try {
    const {name, nameOld, name_ru, id, description, description_ru} = req.body
    const file = req.files?.file as UploadedFile
    console.log('name=', name)
    console.log('name_ru=', name_ru)
    console.log('description=', description)
    console.log('description_ru=', description_ru)
    console.log('nameOld=', nameOld)
    console.log('id=', id)
    console.log('file=', file)

    if (name === nameOld) {
      const category = await Category.findByIdAndUpdate(id, 
        { name,         
          link: file.name, 
          description       
        }, {new: true})
      const category_ru = await Rucategory.findOneAndUpdate({categoryId: category?._id}, 
        { name,         
          description: description_ru       
        }, {new: true})             

      const oldNameFile = await FileCategory.findOne({categoryId: id})
      // const FILE_CATEGORY_PATH = process.env.FILE_CATEGORY_PATH
      const fileDeletePath = `${FILE_CATEGORY_PATH}\\${name}\\${oldNameFile!.name}`
      fs.unlinkSync(fileDeletePath)
      console.log('file deleted') 
      
      const filePath = `${FILE_CATEGORY_PATH}\\${name}\\${file.name}`         
      file.mv(filePath)
          
      const type = file.name.split('.').pop()      
      const newNameFile = await FileCategory.findByIdAndUpdate(oldNameFile!._id, 
        { name: file.name,
          type: type,     
          size: file.size }, {new: true})

      await newNameFile!.save()

      const admin = new AdminLogs({
        adminId: req.params.adminId, 
        what: `edit category.id=${category?._id}`
      })
      await admin.save()

      // io
      console.log('-----req.io------', req.io)
      
      req.io?.to('categories').emit('server_edit_response', {
        messages: {
          en: `Category ${category?.name} has been updated successfully`,
          ru: `Категория ${category_ru?.name} была успешно обновлена`,
      }})
      res.status(201).json({category})

    } else {
      // delete file in dir
      const nameDeleteFile = await FileCategory.findOne({categoryId: id})
      console.log('nameDeleteFile=', nameDeleteFile)
      // const FILE_CATEGORY_PATH = process.env.FILE_CATEGORY_PATH
      const oldFileDeletePath = `${FILE_CATEGORY_PATH}\\${nameOld}\\${nameDeleteFile!.name}`
      fs.unlinkSync(oldFileDeletePath)
      // delete old dir
      fs.rmdirSync(`${FILE_CATEGORY_PATH}\\${nameOld}`)
      console.log('---------ok1-------')
      const category = await Category.findByIdAndUpdate(id, 
        { name,         
          link: file.name, 
          description       
        }, {new: true})
      console.log('category=', category)
      const category_ru = await Rucategory.findOneAndUpdate({categoryId: category?._id}, 
        { name,         
          description: description_ru       
        }, {new: true})
        
      const admin = new AdminLogs({
        adminId: req.params.adminId, 
        what: `edit category.id=${category?._id}`
      })
      await admin.save()  

      const dirPath = `${FILE_CATEGORY_PATH}\\${name}`
      if (fs.existsSync(dirPath)) {
        res.status(400).json({message: 'Directory already exist'})
      } else {     
        // create new dir   
        await fileService.createDir(dirPath)
        console.log('---------ok2-------')
        const filePath = `${FILE_CATEGORY_PATH}\\${name}\\${file.name}`
        console.log('filePath=', filePath)         
        file.mv(filePath)
            
        const type = file.name.split('.').pop()      
        const newNameFile = await FileCategory.findByIdAndUpdate(nameDeleteFile!._id, 
          { name: file.name,
            type: type,     
            size: file.size }, {new: true})
        console.log('newNameFile=', newNameFile)    
        await newNameFile!.save()

        const admin = new AdminLogs({
          adminId: req.params.adminId, 
          what: `edit category.id=${category?._id}`
        })
        await admin.save() 
        // Emiting message
        console.log('-----req.io------', req.io)
        
        req.io?.to('categories').emit('server_edit_response', {
          messages: {
            en: `Category ${category?.name} has been updated successfully`,
            ru: `Категория ${category_ru?.name} была успешно обновлена`,
        }}) 
        res.status(201).json({category})
      }
    }   
  } catch(e) {
    handlerError(e, res)    
  }
})

// delete category по id 
router.delete('/delete/:id/:adminId', async (req: CustomRequestIo, res: Response) => {      
  try {
    const id = req.params.id    
    // delete dir + file
    const nameFileCategory = await Category.findOne({_id: id})
    if (nameFileCategory) {
      const filePath = `${FILE_CATEGORY_PATH}\\${nameFileCategory.name}\\${nameFileCategory.link}` 
      if (!fs.existsSync(filePath)) {
        res.status(400).json({message: 'Файла по пути нет'})
      } else {
        fs.unlinkSync(filePath)
        fs.rmdirSync(`${FILE_CATEGORY_PATH}\\${nameFileCategory.name}`)
        
        // delete FileCategory in BD
        const fileCategory = await FileCategory.findOneAndDelete({categoryId: id})

        // delete Category
        const category = await Category.findByIdAndDelete(req.params.id)
        const category_ru = await Rucategory.findOneAndDelete({categoryId: category?._id})

        const admin = new AdminLogs({
          adminId: req.params.adminId, 
          what: `delete category.id=${category?._id}`
        })
        await admin.save()

        req.io?.to('categories').emit('server_edit_response', {
          messages: {
            en: `Category ${category?.name} has been deleted successfully`,
            ru: `Категория ${category_ru?.name} была успешно удалена`,
          }})
        res.json(category)
      }
    }  
  } catch(e) {
    handlerError(e, res)
  }
})
// расширенный русским переводом selectCategory
router.get('/:id', async (req: Request, res: Response) => {
  try {                
    const category = await Category.findById(req.params.id)
    
    if (category) {
      const rucategory = await Rucategory.findOne({categoryId: category._id})
      console.log('rucategories=', rucategory)

      const cat: ICategoryForm = {} as ICategoryForm
      cat._id = category._id
      cat.name = category.name
      cat.description = category.description
      cat.file = category.link  
      cat.name_ru = rucategory?.name!
      cat.description_ru = rucategory?.description!

      console.log('cats= ', cat)
      res.json(cat)
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