import { Api } from '@/helpers'
import { EcommerceTransaction } from '@/types'

type T = EcommerceTransaction
export const ECOMMERCE_TRANSACTIONS_ENDPOINT = '/ecommerce/transactions'
export const ECOMMERCE_TRANSACTIONS_EVENT = 'account_${account_id}_ecommerce_transactions'

export class EcommerceTransactionsService extends Api<T> {}