import { Schema, model, Types, Document } from 'mongoose'
import Category from './Category'
import User from './User'
import sectionPost from '../models/SectionPost'

interface ISection {
  type: string //'text' | 'image'
  content?: string // Необязательное, так как conditional required трудно выразить в TypeScript
  path?: string // Необязательное, по той же причине
  alt?: string
  order: number
}

interface IPost {
  title: string
  sections: ISection[] // Types.Array<ISection> // [sectionPost]
  favorite: number
  nofavorite: number
  views: number
  createdAt: Date
  updatedAt?: Date
  categoryId: Types.ObjectId
  userId: Types.ObjectId
}

const schema = new Schema<IPost>(
  {
    title: { type: String, required: true, unique: true },
    sections: [sectionPost],
    favorite: { type: Number, default: 0, required: true },
    nofavorite: { type: Number, default: 0, required: true },
    views: { type: Number, default: 0, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: Category.modelName,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    versionKey: false,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
)

// ✅ Индексы для производительности
schema.index({ createdAt: -1 })

export default model<IPost>('Post', schema)
