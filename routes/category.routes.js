const {Router} = require( 'express' )
const config = require('config')
const Category = require('../models/Category')
const Post = require('../models/Post')
const authMiddleware = require('../middleware/auth.middleware')
const router = Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const categories = await Category.find()    
    res.json(categories)
  } catch(e) {
    res.status(500).json({message: 'Что-то пошло не так.'})
  }
})

// add new category (add form)
router.post('/insert', authMiddleware, async (req, res) => {
  try {
    const {name, description} = req.body    
    const category = new Category({
      name, description
    })    
    await category.save()
    res.status(201).json({category})
   
  } catch(e) {
    console.log('error: ', e)    
    res.status(500).json({message: 'Что-то пошло не так.'+ (e.message ?? e.error)})
  }
})

// update name and description category(edit form)
router.put('/edit/:id', authMiddleware, async (req, res) => {
  try {
    const {name, description} = req.body    
    const category = await Category.findByIdAndUpdate(req.params.id, 
      {
        name, 
        description
      }, {new: true})   
    res.status(201).json({category})
   
  } catch(e) {
    console.log('error: ', e)    
    res.status(500).json({message: 'Что-то пошло не так.'+ (e.message ?? e.error)})
  }
})

// delete category по id
router.delete('/delete/:id', authMiddleware, async (req, res) => {      
  try {
    const category = await Category.findByIdAndDelete(req.params.id)
    res.json(category)  
  } catch(e) {
    res.status(500).json({message: 'Что-то пошло не так.' + (e.message ?? e.error)})
  }
})

module.exports = router