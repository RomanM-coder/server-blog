import { Schema, model, Types } from 'mongoose'
import User from './User'

const schema = new Schema({
  name: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  size: { type: Number, default: 0 },
  userId: { type: Types.ObjectId, ref: User.modelName, required: true }
},
  { versionKey: false })

export default model('File', schema)