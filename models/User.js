const {Schema, model, Types} = require('mongoose')
const Post = require('./Post')

const schema = new Schema({  
  email: {type: String, required: true, unique: true},
  password: {type: String, required: true},
  // postsId: {type: Array[Types.ObjectId]}
  postsId:[{ type: Types.ObjectId, ref: Post }]  
})

module.exports = model('User', schema)