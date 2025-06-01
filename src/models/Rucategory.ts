import { Schema, model, Types } from 'mongoose'
import Category from './Category'

const schema = new Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  categoryId: { type: Types.ObjectId, ref: Category.modelName, required: true }
},
  { versionKey: false })

export default model('Rucategory', schema)