import { Schema, model, Types } from 'mongoose'
import Category from './Category'

const schema = new Schema({
  title: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  favorite: { type: Number, default: 0, required: true },
  nofavorite: { type: Number, default: 0, required: true },
  categoryId: { type: Types.ObjectId, ref: Category.modelName, required: true }
},
  { versionKey: false })

export default model('Post', schema)