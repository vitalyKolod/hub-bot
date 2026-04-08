import mongoose from 'mongoose'

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URL!)
    console.log('✅ MongoDB подключена')
  } catch (err) {
    console.error('❌ Ошибка подключения к MongoDB', err)
    process.exit(1)
  }
}
