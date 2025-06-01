import { Schema, model, Types } from 'mongoose'
import Post from './Post'
import User from './User'

const schema = new Schema({
  content: { type: String, required: true },
  like: { type: Number, default: 0, required: true },
  dislike: { type: Number, default: 0, required: true },
  owner: { type: Types.ObjectId, ref: User.modelName, required: true },
  postId: { type: Types.ObjectId, ref: Post.modelName, required: true }
},
  { versionKey: false })

export default model('Comment', schema)