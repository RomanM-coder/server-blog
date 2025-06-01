import { Schema, model, Types } from 'mongoose'
import User from './User'

const tokenSchema = new Schema({
  userId: {type: Schema.Types.ObjectId, ref: User.modelName, required: true},
  token: {type: String, required: true}
},
{ versionKey: false })

export default model('Token', tokenSchema)
