import { Schema, model, Types } from 'mongoose'

const schema = new Schema({
  name: { type: String, required: true, unique: true },
  link: { type: String, required: true },
  description: { type: String, required: true }
},
  { versionKey: false })

export default model('Category', schema)

// Duplicate the ID field.
// schema.virtual('id').get(function(){
//   return this._id.toHexString();
// });

// Ensure virtual fields are serialised.
// schema.set('toJSON', {
//   virtuals: true
// });
//----------------------
// ServiceSchema.set('toObject', {
//   transform: function (doc, ret) {
//     delete ret.__v
//   }
// })