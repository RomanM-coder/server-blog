import { Schema, model, Types } from 'mongoose'
import Post from './Post'
import Comment from './Comment'

interface IUser {
  _id: Types.ObjectId,
  email: string,
  password: string,
  verified: boolean,
  role: string,
  block: boolean,
  createdAt: Date,
  lastLogin?: Date,
  votepost: Types.ObjectId[],
  votecomment: Types.ObjectId[],
  postsId: Types.ObjectId[]
}

const schema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  verified: { type: Boolean, required: true },
  role: { type: String},
  block: { type: Boolean },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, required: false },
  votepost: [{ type: Types.ObjectId, ref: Post.modelName }],
  votecomment: [{ type: Types.ObjectId, ref: 'Comment' }],
  postsId: [{ type: Types.ObjectId, ref: Post.modelName }]
},
  { versionKey: false })

export default model('User', schema)