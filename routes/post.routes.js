const {Router} = require( 'express' )
const Post = require('../models/Post')
const authMiddleware = require('../middleware/auth.middleware')
const router = Router()

// add new post(add form)
router.post('/insert', authMiddleware, async (req, res) => {
  try {
    const {title, description, liked, categoryId} = req.body    
    const post = new Post({
      title, description, liked, categoryId
    })    
    await post.save()
    res.status(201).json({post})
   
  } catch(e) {
    console.log('error: ', e)    
    res.status(500).json({message: 'Что-то пошло не так.'+ (e.message ?? e.error)})
  }
})

// update liked
router.put('/update/:id', authMiddleware, async (req, res) => {
  try {
    const {title, description, liked, categoryId} = req.body    
    const post = await Post.findByIdAndUpdate(req.params.id, 
      {
      title, 
      description, 
      liked, 
      categoryId
      }, {new: true})   
    res.status(201).json({post})
   
  } catch(e) {
    console.log('error: ', e)    
    res.status(500).json({message: 'Что-то пошло не так.'+ (e.message ?? e.error)})
  }
})

// update title and description(edit form)
router.put('/edit/:id', authMiddleware, async (req, res) => {
  try {
    const {title, description, liked, categoryId} = req.body    
    const post = await Post.findByIdAndUpdate(req.params.id, 
      {
        title, 
        description, 
        liked, 
        categoryId
      }, {new: true})   
    res.status(201).json({post})
   
  } catch(e) {
    console.log('error: ', e)    
    res.status(500).json({message: 'Что-то пошло не так.'+ (e.message ?? e.error)})
  }
})

// get all posts in category
router.get('/:categoryId', authMiddleware, async (req, res) => {
  try {
    const posts = await Post.find({categoryId: req.params.categoryId})    
    res.json(posts)
  } catch(e) {
    res.status(500).json({message: 'Что-то пошло не так.' + (e.message ?? e.error)})
  }
})

// get post по id
router.get('/detail/:id', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)    
    res.json(post)   
  } catch(e) {
    res.status(500).json({message: 'Что-то пошло не так.' + (e.message ?? e.error)})
  }
})

// delete post по id
router.delete('/delete/:id', authMiddleware, async (req, res) => {      
    try {
      const post = await Post.findByIdAndDelete(req.params.id)
      res.json(post)    
    } catch(e) {
      res.status(500).json({message: 'Что-то пошло не так.' + (e.message ?? e.error)})
    }
})

module.exports = router