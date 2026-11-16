import mongoose from 'mongoose'
import { isDeepStrictEqual } from 'node:util'

/** Add missing indexes while keeping compatible existing names and all legacy indexes. */
export async function initializeApiIndexes() {
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection()
    const existing = await model.collection.listIndexes().toArray()
    for (const [key, options] of model.schema.indexes()) {
      const compatible = existing.some(index => isDeepStrictEqual(index.key, key) &&
        Boolean(index.unique) === Boolean(options.unique) &&
        Boolean(index.sparse) === Boolean(options.sparse) &&
        isDeepStrictEqual(index.partialFilterExpression || {}, options.partialFilterExpression || {}) &&
        index.expireAfterSeconds === options.expireAfterSeconds &&
        isDeepStrictEqual(index.collation || {}, options.collation || {}))
      if (!compatible) await model.collection.createIndex(key as any, options)
    }
  }
}
