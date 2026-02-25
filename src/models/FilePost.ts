import { Schema, model, Types } from 'mongoose'
import Post from './Post'

const schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    size: { type: Number, default: 0 },
    postId: { type: Types.ObjectId, ref: Post.modelName, required: true },
  },
  { versionKey: false }
)

export default model('FilePost', schema)
