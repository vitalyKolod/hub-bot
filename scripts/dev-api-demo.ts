import { createDemo } from './api-demo.js'

const demo = await createDemo(Number(process.env.API_PORT || 3001))
console.log(`\nHUB API DEMO: http://127.0.0.1:${(demo.server.address() as any).port}`)
console.log('Temporary MongoDB; all Telegram deliveries are simulated. No production access.')
console.log('Authorization: dev 1001 (owner), dev 1002 (member), dev 9001 (superadmin), dev 9002 (consultant), dev 9003 (support)')
console.log(`Team: ${demo.teamId}; pending payment: ${demo.paymentId}`)
console.log('Contract: /api/openapi.json; profile: /api/me; user sync: /api/sync; admin sync: /api/admin/sync')
let stopping = false
const close = async () => { if (stopping) return; stopping = true; await demo.close(); process.exit(0) }
process.once('SIGINT', close); process.once('SIGTERM', close)
