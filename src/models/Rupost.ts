import { Schema, model, Types } from 'mongoose'
import Post from './Post'
import Category from './Category'

const schema = new Schema({
  title: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  postId: { type: Types.ObjectId, ref: Post.modelName, required: true },
  categoryId: { type: Types.ObjectId, ref: Category.modelName, required: true }
},
  { versionKey: false })

export default model('Rupost', schema)