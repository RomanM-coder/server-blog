import { Router, Request, Response } from 'express'
import config from 'config'
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
import CustomRequest from '../middleware/auth.middleware'
import Comment from '../models/Comment'
import Rucomment from '../models/Rucomment'
import { UploadedFile } from 'express-fileupload'

const router = Router()

// load avatar's user, write in BD File
router.post('/upload',
  // authMiddleware, 
  async (req, res) => {
    try {
      const file = req.files?.file as UploadedFile
      const user = await User.findOne({ email: req.body.email })
      if (!user) res.status(400).json({ message: 'user not found' })
      else {  
        const path = `${config.get('fileRegPath')}\\${user._id}\\${file.name}`

        if (fs.existsSync(path)) {
          res.status(400).json({ message: 'File already exist' })
        } else {
          file.mv(path)

          const type = file.name.split('.').pop()
          const newFile = {
            name: file.name,
            type: type,
            size: file.size,
            userId: user._id
          }
          console.log('newFileReg=', newFile)
          const dbFile = new File(newFile)

          await dbFile.save()

          res.json(dbFile)
        }
      }
    } catch (e) {
      console.log(e)
      res.status(500).json({ message: "Upload error" })
    }
  })

// get fileCategory по id
router.get('/download',
  // authMiddleware, 
  async (req: Request, res: Response) => {
    try {
      const category = await Category.findOne({ _id: req.query.id })
      if (!category) res.status(400).json({ message: 'category not found' })
      else { 
        const fileCategory = await FileCategory.findOne({ categoryId: category._id })
        if (!fileCategory) res.status(400).json({ message: 'category not found' })
        else {
          // "C:\\Project\\mern-server\\categoryFiles"  'GJHGKJGKJH7879' 'zvezda.png
          console.log('category.name ', category.name)
          console.log('fileCategory.name ', fileCategory.name)

          const path = config.get('fileCategoryPath') + '\\' + category.name + '\\' + fileCategory.name
          console.log('path=', path)

          if (fs.existsSync(path)) return res.download(path, fileCategory.name)
          else res.status(400).json({ message: "Error: In download not path" })
        }
      }
    } catch (e) {
      console.log(e)
      res.status(500).json({ message: "Download error" })
    }
  })

export default router