import { Schema, model, Types } from 'mongoose'
import User from './User'
//  name: { type: String, required: true, unique: true },
const schema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    size: { type: Number, default: 0 },
    userId: { type: Types.ObjectId, ref: User.modelName, required: true },
  },
  { versionKey: false }
)

export default model('File', schema)
