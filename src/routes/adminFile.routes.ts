import { Router, Request, Response } from 'express'
// import config from 'config'
import fs from 'fs'
import fileService from '../routes/fileService'
import User from '../models/User'
import File from '../models/File'
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
import { UploadedFile } from 'express-fileupload'
import dotenv from "dotenv"
dotenv.config() // Загрузка переменных окружения

const FILE_CATEGORY_PATH = process.env.FILE_CATEGORY_PATH

const router = Router()
router.use(authMiddleware, adminMiddleware)

// write in BD FileCategory
router.post('/uploadFileCategory', async (req: Request, res: Response) => {
    try {
      console.log('req.files ', req.files)

      const { name } = req.body
      const file = req.files?.file as UploadedFile
      console.log('name=', name)
      console.log('file=', file)
      const category = await Category.findOne({ name })
      if (!category) res.status(400).json({ message: 'Category not found' })
      else {  
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

          res.json(dbFile)
        }
      }
    } catch (e) {
      console.log(e)
      res.status(500).json({ message: "Upload error" })
    }
  })

export default router