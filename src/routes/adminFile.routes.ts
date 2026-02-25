import { Router, Request, Response } from 'express'
import fs from 'fs'
import fileService from '../routes/fileService'
import Category from '../models/Category'
import FileCategory from '../models/FileCategory'
import authMiddleware from '../middleware/auth.middleware'
import adminMiddleware from '../middleware/admin.middleware'
import { UploadedFile } from 'express-fileupload'
import { handlerError } from '../handlers/handlerError'

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
          categoryId: category._id,
        }
        console.log('newFileCat=', newFile)
        const dbFile = new FileCategory(newFile)

        await dbFile.save()

        res.json(dbFile)
      }
    }
  } catch (e) {
    handlerError(e, res, {
      endpoint: '/api/admin/file post /uploadFileCategory',
    })
  }
})

export default router
