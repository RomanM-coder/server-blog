const express = require('express')
const cors = require('cors')
const config = require('config')
// const path = require('path')
const mongoose = require('mongoose')
const postRouter = require('./routes/post.routes')
const authRouter = require('./routes/auth.routes')
const categoryRouter = require('./routes/category.routes')

const app = express()

app.use(express.json({extended: true}))
app.use(cors())

app.use('/api/auth', authRouter)
app.use('/api/post', postRouter)
app.use('/api/category', categoryRouter)
// app.use('/t', require('./routes/redirect.routes'))

// if (process.env.NODE_ENV === 'production') {
//   app.use('/', express.static(json(__dirname, 'client', 'build')))
//   app.get('*', (req, res) => {
//     res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'))
//   })
// }
// "mongoUri": " mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&..appName=mongosh+2.3.1",

const PORT = config.get('port') || 5000

async function start() {
  try {
    await mongoose.connect(config.get('mongoUri'), {

    })
    app.listen(PORT, () => console.log(`App has been started port ${PORT}`))
  } catch(e) {
    console.log('Server error ', e.message)
    process.exit(1)    
  }
}

start()