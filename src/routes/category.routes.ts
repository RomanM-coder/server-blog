import { Router, Request, Response } from 'express'
import { Server } from 'socket.io'
import { UploadedFile } from 'express-fileupload'
import config from 'config'
import fs from 'fs'
import fileService from './fileService' 
import Category from '../models/Category'
import Rucategory from '../models/Rucategory'
import Post from '../models/Post'
import Rupost from '../models/Rupost'
import FileCategory from '../models/FileCategory'
import authMiddleware from '../middleware/auth.middleware'
import { Types, SortOrder } from 'mongoose'
const router = Router()

// interface CustomRequestIo extends Request {
//   io?: Server; // Добавляем свойство io
// }

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

router.use(authMiddleware)

router.get('/', async (req: Request, res: Response) => {
  try {
    let cats: ICategory[] = []            
    const categories = await Category.find()
    console.log('accept-language', req.headers['accept-language'])   
    // for language = ru
    if (req.headers['accept-language'] === 'ru') {
      const rucategories = await Rucategory.find()
      console.log('rucategories=', rucategories)
      
      categories.map((category) => {       
        console.log('category._id=', category._id)
                
        const rucategory = rucategories.find((cat_ru) => cat_ru.categoryId.toString() === category._id.toString())
        console.log('rucategory=', rucategory)
        const cat: ICategory = {
          _id : category._id,
          name: rucategory!.name,
          description: rucategory!.description,
          link: category.link
        }
        cats.push(cat)        
      })
      console.log('cats= ', cats)
      res.json(cats)    
    } else {
      console.log('categories= ', categories)
      res.json(categories)}
        
  } catch(e) {
    res.status(500).json({message: 'Что-то пошло не так.'})
  }
})

router.get('/count', async (req: Request, res: Response) => {
  try {        
    const categories = await Category.find()      
    const categoriesCount = categories.length

    res.json(categoriesCount)    
  } catch(e) {
    handlerError(e, res)
  }
})

router.get('/search', async (req: Request, res: Response) => {
  try {
    let cats: ICategory[] = [] // for language = ru
    let categorySearch: ICategory[] = []
    const query: string = req.query.query as string
    console.log('query=', query)

    let categories: ICategory[] = await Category.find()
    if (!categories) res.status(400).json({ message: 'категории не найдены' })
    else {  
      // language = ru
      if (req.headers['accept-language'] === 'ru') {
        const rucategories = await Rucategory.find()
        console.log('rucategories=', rucategories)
        
        categories.map((category) => {       
          console.log('category._id=', category._id)
                  
          const rucategory = rucategories.find((cat_ru) => cat_ru.categoryId.toString() === category._id.toString())
          console.log('rucategory=', rucategory)
          const cat = {
            _id : category._id,
            name: rucategory!.name,
            description: rucategory!.description,
            link: category.link
          }
          cats.push(cat)        
        })
        console.log('cats= ', cats)
        categories = cats            
      }    

      if (query !== "") { 
        categories.filter((category) => {      
        
          if (category.name.trim().toLowerCase().includes(query.toLowerCase())) {
            categorySearch.push(category)
            console.log('--------------', categorySearch.length)
            
            //returns filtered element array
            return category
          }
        })
        // if (categorySearch.length === 0) res.json(categorySearch)
        res.json(categorySearch)
      } else res.json([])
    }

  } catch(e) {
    handlerError(e, res)
  }
})

router.get('/pagination', async (req: Request, res: Response) => {
  try {
    let cats: ICategory[] = []
    const sortField = req.query.sortfield as string
    const sortParam = req.query.sortparam as 'true' | 'false'    

    if (!sortField || !['true', 'false'].includes(sortParam)) {
      res.status(400).json({ message: 'Invalid sort field or sort param' })
    }

    // Создаем объект сортировки
    const sortObject: { [key: string]: SortOrder } = { [sortField]: sortParam === 'false' ? -1 : 1 }

    const limit: number = Number(req.query.limit)
    const skip: number = Number(req.query.skip)
    // let sortParam = 1
    // if (sortparam === 'true') {
    //   console.log('true')      
    //   sortParam = 1
    // } else if (sortparam === 'false') {
    //   console.log('false')      
    //   sortParam = -1
    // }
    console.log('limit=', limit)
    console.log('skip=', skip)
    console.log('sortField=', sortField)
    console.log('sortParam=', sortParam)     
    let categoriesItems: ICategory[] = await Category
      .find()
      .sort(sortObject)
      .skip(skip)
      .limit(limit)
      // .aggregate([
      //   { $skip : skip },
      //   { $limit : limit },
      //   {  $sort : { [sortField]: sortParam } }
      // ])

    //  language = ru
    if (req.headers['accept-language'] === 'ru') {
      const rucategories: IRuCategory[] = await Rucategory.find()
      // console.log('rucategories=', rucategories)
      if (rucategories.length === 0) {
        res.status(400).json({ message: 'No rucategories found' })
      } else {  
      categoriesItems.map((category: ICategory) => {       
        console.log('category._id=', category._id)
                
        const rucategory: IRuCategory|undefined = rucategories.find(
          (cat_ru: IRuCategory) => cat_ru.categoryId.toString() === category._id.toString()
        )
        console.log('rucategory=', rucategory)
        const cat: ICategory = {
          _id : category._id,
          name: rucategory!.name,
          description: rucategory!.description,
          link: category.link
        }
        cats.push(cat)        
      })
      console.log('cats= ', cats)
      categoriesItems = cats
      //res.json(cats)
      }    
    }
      
    res.json(categoriesItems)
    console.log('categoriesItems=', categoriesItems)   
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