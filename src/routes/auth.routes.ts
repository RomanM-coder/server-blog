import { Router, Request, Response } from 'express'
import config from 'config'
import fs from 'fs'
import fileService from '../routes/fileService'
import User from '../models/User'
import Token from '../models/Token'
import bcrypt from 'bcrypt'
import {check, validationResult} from 'express-validator'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import __ from 'i18n'
// const sendEmail = require('../helper/email')
const router = Router()

// api/auth/register
router.post(
  '/register',
  [
    check('email', 'Некорректный email').not().isEmpty().isEmail(),
    check('password', 'Минимальная длина пароля 6 символов').not().isEmpty().isLength({ min: 6 })
  ],
  async (req: Request, res: Response) => {
    console.log('body: ', req.files)

    try {
      const errors = validationResult(req.body)

      if (!errors.isEmpty()) {

        res.status(400).json({
          errors: errors.array(),
          message: res.__('auth.reg.messageDataIncorrect')
        })
      }

      const { email, password } = req.body
      const candidate = await User.findOne({ email })

      if (candidate) {
        res.status(400).json({ message: res.__('auth.reg.messageAlreadyExists') })
      }

      const hashedPassword = await bcrypt.hash(password, 12)
      const user = new User({
        email: email,
        password: hashedPassword,
        verified: false,
        role: '',
        block: false,
        vote: [null],
        postsId: [null]
      })
      await user.save()      

      const currentUser = await User.findOne({ email })
      const filePath = `${config.get('fileRegPath')}\\${currentUser!._id}`
      console.log('filePath', filePath)

      await fileService.createDir(filePath) // new File({userId: currentUser.id, name: ''})     

      res.status(201).json({ message: res.__('auth.reg.messageUserCreated') })
    } catch (e) {
      res.status(500).json({ message: 'Что-то пошло не так.' })
    }
  })

// api/auth/verifyEmail 
router.post('/verifyemail', async (req, res) => {  
  try {
    const email = req.body.email
    const user = await User.findOne({ email })
    if (!user) res.status(400).json({ message: 'пользователь не найден' })
    else {  
      const confirm = jwt.sign(
        { userId: user._id },
        config.get<string>('jwtSecret'),
        // {expiresIn: 60} 
        { expiresIn: '1h' }
      )
      const confirmToken = new Token({ userId: user._id, token: confirm })
      await confirmToken.save()

      const messageConfirm = `${config.get('baseUrlFront')}/auth/verify/${user.email}/${user._id}/${confirm}`
      console.log('messageConfirm ', messageConfirm)

      const emailTemplate = (username: string, link: string) => `
      <p><b>Hi, ${username}!</b></p>
      <p>To confirm this email, click on the link to the login page of a Simple Blog:</p>
      <p>${link}</p>`
      console.log('emailTemplate ', emailTemplate)

      const transporter = nodemailer.createTransport({
        host: 'smtp.yandex.ru',
        port: 465,
        secure: true,
        auth: {
          user: "rm.splinter@yandex.ru",
          pass: "fioikpuiojeeyunc"
        }
      })
      const mailOptions = {
        from: 'rm.splinter@yandex.ru',
        to: user.email as string,
        subject: "Verify Email",
        html: emailTemplate(user.email as string, messageConfirm)
      }
      await transporter.sendMail(mailOptions)


      // await sendEmail(
      //   user.email,
      //   "Verify Email",
      //   emailTemplate(user.email, messageConfirm)
      // )
      console.log('----------------ok--------------')

      res.status(201).json({ message: res.__('auth.reg.messageVerify') })
    }
  } catch (error) {
    res.json({ message: error }) // "An error occured"
  }
})

// api/auth/verify - get field verify 
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const email = req.body.email
    console.log('email ', email)
    const user = await User.findOne({ email })

    res.json({ verify: user!.verified })
  } catch (error) {
    res.status(400).send("An error occured");
  }
})

// api/auth/verify
router.get('/verify/:email/:id/:token', async (req: Request, res: Response) => {
  try {
    const { email, id, token } = req.params
    const user = await User.findOne({ _id: id })
    console.log('user ', user)
    if (!user) res.status(400).send("Invalid link")
    else {  
      const tokenBd = await Token.findOne({
        userId: user._id,
        token: token
      })
      console.log('token ', tokenBd)
      if (!tokenBd) res.status(400).send("Invalid link")
      else {  
        await User.findByIdAndUpdate(user._id, { verified: true })
        await Token.findOneAndDelete({ _id: tokenBd._id })

        res.send("email verified sucessfully")
      }
    }
  } catch (error) {
    res.status(400).send("An error occured")
  }
})

// api/auth/login
router.post(
  '/login',
  [
    check('email', 'Некорректный email.').not().isEmpty().normalizeEmail().isEmail(),
    check('password', 'Введите пароль.').not().isEmpty().exists()
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req)

      if (!errors.isEmpty()) {
        res.status(400).json({
          errors: errors.array(),
          message: res.__('auth.login.messageDataUncorrect')
        })
      }

      const { email, password } = req.body
      const user = await User.findOne({ email })

      if (!user) {
        console.log('auth.login.messageUserNotFound', res.__('auth.login.messageUserNotFound'));

        res.status(400).json({ message: res.__('auth.login.messageUserNotFound') })
      } else {

        const isMatch = await bcrypt.compare(password, user.password as string)
        if (!isMatch) {
          res.status(400).json({ message: res.__('auth.login.messagePasswordIncorrect') })
        } else {
          console.log('user.id: ---', user.id)

          const token = jwt.sign(
            { userId: user.id },
            config.get<string>('jwtSecret'),
            // {expiresIn: 60} 
            { expiresIn: '10h' }
          )
          res.json({ token, userId: user.id })
        }
      }
    } catch (e) {
      console.log("error", e);

      res.status(500).json({ message: 'Что-то пошло не так.' })
    }
})

// api/auth/role
router.get('/role', async (req: Request, res: Response) => {
  try {    
    const user = await User.findOne({ _id: req.query.userid })
    console.log('user---------------------- ', user)
    if (!user) res.status(400).send("There is no such user")
    else res.json({ role: user.role })      
    
  } catch (error) {
    // res.status(500).json({ message: 'An error occured' }) 
    handlerError(error, res)   
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