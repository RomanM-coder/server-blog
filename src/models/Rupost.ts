import { Schema, model, Types, Document } from 'mongoose'
import Post from './Post'
import sectionPost from './SectionPost'

interface ISection {
  type: 'text' | 'image'
  content?: string
  path?: string
  alt?: string
  order: number
}

interface IRupost extends Document {
  title: string
  sections: ISection[] // Types.Array<ISection> // any[]
  postId: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IRupost>(
  {
    title: { type: String, required: true, unique: true },
    sections: [sectionPost],
    postId: {
      type: Schema.Types.ObjectId,
      ref: Post.modelName,
      required: true,
    },
  },
  {
    versionKey: false,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
)

export default model<IRupost>('Rupost', schema)
