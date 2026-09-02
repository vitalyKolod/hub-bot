export type ProductConfig = {
  id: string
  name: string

  priceRub: number | null
  priceUsd: number | null

  groupId?: number
  cartable: boolean
}

export const PRODUCTS: Record<string, ProductConfig> = {
  procontent: {
    id: 'procontent',
    name: 'ProContent',

    priceRub: 500,
    priceUsd: 5,

    groupId: Number(process.env.CONTENT_GROUP_ID),
    cartable: true,
  },

  propresenter: {
    id: 'propresenter',
    name: 'Pro Presenter',

    priceRub: 2000,
    priceUsd: 20,

    cartable: false,
  },

  cmg: {
    id: 'cmg',
    name: 'CMG',

    priceRub: 500,
    priceUsd: 5,

    cartable: true,
    groupId: Number(process.env.CMG_GROUP_ID),
  },

  sunday_screens: {
    id: 'sunday_screens',
    name: 'Sunday Screens',

    priceRub: 1600,
    priceUsd: 16,

    cartable: true,
    groupId: Number(process.env.SUNDAY_SCREENS_GROUP_ID),
  },

  cgs: {
    id: 'cgs',
    name: 'CGS',

    priceRub: 350,
    priceUsd: 3.5,

    cartable: true,
    groupId: Number(process.env.CHURCH_GOOD_STUDIO_GROUP_ID),
  },

  storyloops: {
    id: 'storyloops',
    name: 'StoryLoops',

    priceRub: 725,
    priceUsd: 7.25,

    cartable: true,
    groupId: Number(process.env.STORY_LOOP_GROUP_ID),
  },

  other: {
    id: 'other',
    name: 'Другое',

    priceRub: null,
    priceUsd: null,

    cartable: false,
  },

  add_member: {
    id: 'add_member',
    name: 'Добавление участника',

    priceRub: 250,
    priceUsd: 2.5,

    cartable: false,
  },
}

export function getProduct(id: string): ProductConfig | undefined {
  return PRODUCTS[id]
}

export function getCartableProducts(): ProductConfig[] {
  return Object.values(PRODUCTS).filter((p) => p.cartable)
}

export type Currency = 'rub' | 'usd'

export function getProductPrice(product: ProductConfig, currency: Currency): number | null {
  return currency === 'rub' ? product.priceRub : product.priceUsd
}
