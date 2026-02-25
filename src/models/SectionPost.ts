import { Schema, model, Document } from 'mongoose'

// interface ISection extends Document {
//   _id: false // ← ОТКЛЮЧАЕМ автоматическое создание _id
//   type: string //'text' | 'image'
//   content?: string // Необязательное, так как conditional required трудно выразить в TypeScript
//   path?: string // Необязательное, по той же причине
//   alt?: string
//   order?: number
// }

interface ISection {
  type: 'text' | 'image'
  content?: string
  path?: string
  alt?: string
  order: number
}

const sectionSchema = new Schema<ISection>(
  {
    type: {
      type: String,
      required: true,
      enum: ['text', 'image'],
    },
    content: {
      type: String,
      required: function () {
        return (this as any).type === 'text' // required только для type: 'text'
      },
    },
    path: {
      type: String,
      required: function () {
        return (this as any).type === 'image' // required только для type: 'image'
      },
    },
    alt: {
      type: String,
      required: function () {
        return (this as any).type === 'image' // required только для type: 'image'
      },
    },
    order: {
      type: Number,
    },
  },
  {
    _id: false, // ← ВОТ ЗДЕСЬ отключаем _id
    versionKey: false,
  }
)

// 3. Добавляем кастомную валидацию через pre-save hook
sectionSchema.pre('save', function (next) {
  if (this.type === 'text' && !this.content) {
    return next(new Error('Для текстовой секции необходимо указать content'))
  }
  if (this.type === 'image' && !this.path) {
    return next(new Error('Для секции с изображением необходимо указать path'))
  }
  next()
})

export default sectionSchema
