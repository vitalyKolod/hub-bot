export const RUB_PAYMENT = {
    card: {
      mastercard: '5536 9141 0822 8812',
      mir: {
        'Т-Банк': '2200 7021 4013 1603',
        Озон: '2204 3201 4460 6359',

        'Альфа-Банк': '2200 1537 3537 8276',
      },
    },
    sbp: {
      phone: '+7(924) 370 92-91', // номер один для всех
      banks: ['Т-Банк', 'Озон', 'Альфа-Банк'],
    },
  } as const

export const CRYPTO_WALLETS = {
  trc20: 'TMFTta1wyguMMr8gHn8hxVbTYGSWoLuzma',
  erc20: '0x4b88017585132400e1afebeb8d1a3e522ebe7d5a',
  ton: 'UQBAQvGg6hJiGPkQsysC3ZrkuqFcC2-B7vX4D4MGHAjK_vOZ',
  bybit: '210547658',
} as const

export function getPaymentOptions() {
  const recipient = process.env.PAYMENT_RECEIVER_NAME || ''
  const cards = [
    { id: 'rub_card_mastercard', label: 'Mastercard', details: RUB_PAYMENT.card.mastercard },
    ...Object.entries(RUB_PAYMENT.card.mir).map(([bank, details], index) => ({ id: `rub_card_mir_${index}`, label: `МИР · ${bank}`, details })),
  ].map(option => ({ ...option, currency: 'rub', recipient, configured: Boolean(option.details && recipient) }))
  const sbp = RUB_PAYMENT.sbp.banks.map((bank, index) => ({ id: `rub_sbp_${index}`, label: `СБП · ${bank}`, details: RUB_PAYMENT.sbp.phone, currency: 'rub', recipient, configured: Boolean(recipient) }))
  const crypto = Object.entries(CRYPTO_WALLETS).map(([network, details]) => ({ id: `crypto_${network}`, label: network.toUpperCase(), details, currency: 'usd', recipient: null, configured: Boolean(details) }))
  return [...cards, ...sbp, ...crypto]
}
