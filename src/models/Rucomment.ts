import { Schema, model, Types } from 'mongoose'
import Comment from './Comment'

const schema = new Schema({
  content: { type: String, required: true },
  commentId: { type: Types.ObjectId, ref: Comment.modelName, required: true }
},
  { versionKey: false })

export default model('Rucomment', schema)