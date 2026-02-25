import { Schema, model, Types } from 'mongoose'
import Post from './Post'
import Comment from './Comment'

interface IUser {
  _id: Types.ObjectId
  email: string
  avatar: string
  firstName?: string
  lastName?: string
  bio?: string
  password: string
  confirmed: boolean
  role: string
  blocked: boolean
  createdAt: Date
  lastLogin?: Date
  votepost: Types.ObjectId[]
  votecomment: Types.ObjectId[]
  commentsCount: number
  postsPublishedId: Types.ObjectId[]
}

const schema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    avatar: { type: String, default: 'default-avatar.svg' },
    password: { type: String, required: true },
    firstName: { type: String, maxlength: 30, trim: true },
    lastName: { type: String, maxlength: 30, trim: true },
    bio: { type: String, maxlength: 100 },
    confirmed: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ['user', 'admin', 'moderator'],
      default: 'user',
    },
    blocked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date },
    votepost: [{ type: Types.ObjectId, ref: Post.modelName }],
    votecomment: [{ type: Types.ObjectId, ref: 'Comment' }],
    commentsCount: { type: Number, default: 0, min: 0 },
    postsPublishedId: [{ type: Types.ObjectId, ref: Post.modelName }],
  },
  { versionKey: false },
)
// ✅ Индексы для производительности
schema.index({ blocked: 1, confirmed: 1 })
schema.index({ createdAt: -1 })
schema.index({ postsPublishedId: 1 })

export default model<IUser>('User', schema)
