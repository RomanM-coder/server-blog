import { Schema, model, Types } from 'mongoose'
import User from './User'

interface IAdminLog {
  _id: Types.ObjectId,
  adminId: string,
  what: string,
  time: Date, 
}

const schema = new Schema<IAdminLog>({
  adminId: { type: String, ref: User.modelName, required: true },
  what: { type: String, required: true },
  time: { type: Date, required: true, default: Date.now }
},
  { versionKey: false })

export default model('AdminLog', schema)