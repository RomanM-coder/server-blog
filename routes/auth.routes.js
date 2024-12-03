const {Router} = require( 'express' )
const bcrypt = require('bcrypt')
const {check, validationResult} = require('express-validator')
const jwt = require('jsonwebtoken')
const config = require('config')
const User = require('../models/User')
const router = Router()

// api/auth/register
router.post(
  '/register',
  [
    check('email', 'Некорректный email').not().isEmpty().isEmail(),
    check('password', 'Минимальная длина пароля 6 символов').not().isEmpty().isLength({min: 6})
  ],
  async (req, res) => {
    console.log('body: ', req.body);
    
  try {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
     
      return res.status(400).json({
        errors: errors.array(),
        message: 'Некорректные данные при регистрации.'
      })
    }

    const {email, password} = req.body
    const candidate = await User.findOne({email})
   
    if (candidate) {
      return res.status(400).json({message: 'Такой пользователь уже существует.'})
    }    
    
    const hashedPassword = await bcrypt.hash(password, 12)
    const user = new User({email: email, password: hashedPassword, postsId: [null]})    
    await user.save()
    res.status(201).json({message: 'Пользователь создан.'})
   
  } catch(e) {
    res.status(500).json({message: 'Что-то пошло не так.'})
  }
    
})

// api/auth/login
router.post(
  '/login',
  [
    check('email', 'Некорректный email.').not().isEmpty().normalizeEmail().isEmail(),
    check('password', 'Введите пароль.').not().isEmpty().exists()
  ],
  async (req, res) => {
  try {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array(),
        message: 'Некорректные данные при входе в систему.'
      })
    }

    const {email, password} = req.body
    const user = await User.findOne({email})

    if (!user) {
      return res.status(400).json({message: 'Пользователь не найден.'})
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(400).json({message: 'Неверный пароль, попробуйте снова.'})
    }
    const token = jwt.sign(
      {userId: user.id},
      config.get('jwtSecret'),
      // {expiresIn: 60} 
      {expiresIn: '1h'}
    )
    res.json({token, userId: user.id})
   
  } catch(e) {
    console.log("error", e);
    
    res.status(500).json({message: 'Что-то пошло не так.'})
  }  
})
module.exports = router