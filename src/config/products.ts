export type ProductConfig = {
  id: string
  name: string
  price: number | null // null = по договорённости
  groupId?: number // группа/чат, доступ в который выдаётся при активации
  cartable: boolean // можно ли добавлять в корзину
}

export const PRODUCTS: Record<string, ProductConfig> = {
  procontent: {
    id: 'procontent',
    name: 'ProContent',
    price: 1000,
    groupId: Number(process.env.CONTENT_GROUP_ID),
    cartable: true,
  },
  propresenter: {
    id: 'propresenter',
    name: 'Pro Presenter',
    price: 2000,
    cartable: false,
  },
  cmg: {
    id: 'cmg',
    name: 'CMG',
    price: 2000,
    cartable: true,
    groupId: Number(process.env.CMG_GROUP_ID),
  },
  sunday_screens: {
    id: 'sunday_screens',
    name: 'Sunday Screens',
    price: 2000,
    cartable: true,
    groupId: Number(process.env.SUNDAY_SCREENS_GROUP_ID),
  },
  cgs: {
    id: 'cgs',
    name: 'CGS',
    price: 2000,
    cartable: true,
    groupId: Number(process.env.CHURCH_GOOD_STUDIO_GROUP_ID),
  },
  storyloops: {
    id: 'storyloops',
    name: 'StoryLoops',
    price: 2000,
    cartable: true,
    groupId: Number(process.env.STORY_LOOP_GROUP_ID),
  },
  other: {
    id: 'other',
    name: 'Другое',
    price: null,
    cartable: false,
  },
  add_member: {
    id: 'add_member',
    name: 'Добавление участника',
    price: 250,
    cartable: false,
  },
}

export function getProduct(id: string): ProductConfig | undefined {
  return PRODUCTS[id]
}

export function getCartableProducts(): ProductConfig[] {
  return Object.values(PRODUCTS).filter((p) => p.cartable)
}
