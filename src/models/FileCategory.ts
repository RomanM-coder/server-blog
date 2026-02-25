import { Schema, model, Types } from 'mongoose'
import Category from './Category'

const schema = new Schema({
  name: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  size: { type: Number, default: 0 },
  categoryId: { type: Types.ObjectId, ref: Category.modelName, required: true }
},
  { versionKey: false })

export default model('FileCategory', schema)