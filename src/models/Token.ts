import { Schema, model, Types } from 'mongoose'
import User from './User'

const tokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: User.modelName,
      required: true,
    },
    token: { type: String, required: true },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 3600, // ← автоматически удалит документ через 1 час
    },
  },
  { versionKey: false }
)

export default model('Token', tokenSchema)
