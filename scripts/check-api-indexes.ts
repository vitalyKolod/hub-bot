import 'dotenv/config'
import mongoose from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import { PaymentModel } from '../src/models/Payment.js'
import { SupportTicketModel } from '../src/models/SupportTicket.js'
import { ProPresenterDeviceRequestModel } from '../src/models/ProPresenterDevice.js'

// Read only. Never creates, drops or repairs indexes in an existing database.
if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required')
await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false })
let issues = 0
try {
  for (const model of [PaymentModel, SupportTicketModel, ProPresenterDeviceRequestModel]) {
    const existing = await model.collection.listIndexes().toArray().catch((error: any) => { if (error.code === 26) return []; throw error })
    for (const [key, options] of model.schema.indexes().filter(([, options]) => options.unique)) {
      const matching = existing.find(index => isDeepStrictEqual(index.key, key))
      const valid = matching?.unique && isDeepStrictEqual(matching.partialFilterExpression || {}, options.partialFilterExpression || {})
      if (!valid) { issues++; console.log(`${model.collection.name}: ${JSON.stringify(key)} ${matching ? 'conflicting or non-unique index' : 'missing unique index'}`) }
    }
  }
  console.log(issues ? `Index audit found ${issues} issue(s); review before deployment. No changes applied.` : 'Required unique indexes match. No changes applied.')
  process.exitCode = issues ? 1 : 0
} finally { await mongoose.disconnect() }
