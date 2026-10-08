export type ProductConfig = {
  id: string
  name: string
  description: string
  cover: string

  priceRub: number | null
  priceUsd: number | null

  groupId?: number
  cartable: boolean
  customEmojiId?: string
}

export const PRODUCTS: Record<string, ProductConfig> = {
  procontent: {
    customEmojiId: '5251299351375937406',
    id: 'procontent',
    name: 'ProContent',
    description: 'Готовый медиаконтент для церковных экранов и служений.',
    cover: '/media/procontent.png',

    priceRub: 500,
    priceUsd: 5,

    groupId: Number(process.env.CONTENT_GROUP_ID),
    cartable: true,
  },

  propresenter: {
    customEmojiId: '5251272469175631339',
    id: 'propresenter',
    name: 'Pro Presenter',
    description: 'Доступ к ProPresenter для подготовки и проведения служений.',
    cover: '/media/propres.jpg',

    priceRub: 4000,
    priceUsd: 40,

    cartable: false,
  },

  cmg: {
    customEmojiId: '5310127020213043624',
    id: 'cmg',
    name: 'Church Motion Graphics',
    description: 'Коллекция визуальных материалов Church Motion Graphics.',
    cover: '/media/cmg.png',

    priceRub: 500,
    priceUsd: 5,

    cartable: true,
    groupId: Number(process.env.CMG_GROUP_ID),
  },

  sunday_screens: {
    customEmojiId: '5291749654017381020',
    id: 'sunday_screens',
    name: 'Sunday Screens',
    description: 'Современные фоны и визуальные материалы для воскресных служений.',
    cover: '/media/sunday-screens.png',

    priceRub: 1600,
    priceUsd: 16,

    cartable: true,
    groupId: Number(process.env.SUNDAY_SCREENS_GROUP_ID),
  },

  cgs: {
    customEmojiId: '5190419001703963847',
    id: 'cgs',
    name: 'Church Goods Studio',
    description: 'Медиаресурсы Church Graphics Studio для вашей команды.',
    cover: '/media/sgc.png',

    priceRub: 350,
    priceUsd: 3.5,

    cartable: true,
    groupId: Number(process.env.CHURCH_GOOD_STUDIO_GROUP_ID),
  },

  storyloops: {
    customEmojiId: '5190877553887323413',
    id: 'storyloops',
    name: 'Story Loop',
    description: 'Анимированные фоны и видеолоопы для экранов.',
    cover: '/media/StoryLoop.png',

    priceRub: 725,
    priceUsd: 7.25,

    cartable: true,
    groupId: Number(process.env.STORY_LOOP_GROUP_ID),
  },

  other: {
    id: 'other',
    name: 'Другое',
    description: 'Другие продукты и помощь команды HUB.',
    cover: '/media/others.jpg',

    priceRub: null,
    priceUsd: null,

    cartable: false,
  },

  yandex_360: {
    id: 'yandex_360', name: 'Яндекс 360', description: 'Яндекс 360', cover: '',
    priceRub: null, priceUsd: null, cartable: false,
    customEmojiId: '5310051278464778081',
  },

  add_member: {
    customEmojiId: '5258362837411045098',
    id: 'add_member',
    name: 'Добавление участника',
    description: 'Дополнительное место для участника вашей команды.',
    cover: '/media/add-volunteer.png',

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
