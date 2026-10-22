/**
 * Read only: the newest Gelato orders, and the full detail of one, to see the
 * product, size, files and shipping a sample should copy.
 *
 *   node --env-file=.env.local --env-file=.env scripts/gelato-orders.js            (list, then the newest in full)
 *   node --env-file=.env.local --env-file=.env scripts/gelato-orders.js <orderId>  (that one in full)
 */
import { gelatoOrders, gelatoOrder } from '../server/services/gelato.js'

const id = process.argv[2]
if (!id) {
  const orders = await gelatoOrders({ limit: 10 })
  for (const o of orders) console.log(o.id, o.orderReferenceId, o.fulfillmentStatus || o.status, o.country || '', o.createdAt)
  if (orders[0]) console.log(JSON.stringify(await gelatoOrder(orders[0].id), null, 2))
} else {
  console.log(JSON.stringify(await gelatoOrder(id), null, 2))
}
process.exit(0)
