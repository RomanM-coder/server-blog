const {Schema, model, Types} = require('mongoose')
const Category = require('./Category')

const schema = new Schema({  
  title: {type: String, required: true, unique: true},
  description: {type: String, required: true},
  liked: {type: Boolean, default: false, required: true},
  categoryId: {type: Types.ObjectId, ref: Category, required: true}  
})

module.exports = model( 'Post', schema )