export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

export const copy = {
  en: {
    tagline: "Offer Tokens. Shape Your Fate.",
    temple: "Temple",
    rankings: "World Rankings",
    rankingsSoon: "World Rankings are coming soon",
    characterLocked: "Connect GitHub to unlock Character",
    goddess: "The Goddess",
    guidance: "Four points are yours. Choose how your story begins.",
    remaining: (count: number) => `${count} ${count === 1 ? "point" : "points"} remaining`,
    accept: "Accept Your Fate",
    confirmTitle: "Seal your fate?",
    confirmBody: "This initial allocation is irreversible.",
    cancel: "Go Back",
    confirm: "Seal My Fate",
    ready: "Your fate is sealed.",
    readyBody: "Your temporary character is ready to enter the Temple.",
    offeringHint: "Connect GitHub to make a real Offering.",
    offer: "Offer Tokens",
    loading: "The Goddess is preparing your character...",
    loadError: "The Goddess could not restore your temporary character.",
    settleError: "Your fate could not be sealed. Try again.",
    retry: "Try Again",
    attributes: {
      courage: "Courage",
      strength: "Strength",
      wisdom: "Wisdom",
      faith: "Faith"
    }
  },
  zh: {
    tagline: "献上 Token，塑造你的命运。",
    temple: "神殿",
    rankings: "世界榜",
    rankingsSoon: "世界榜即将开放",
    characterLocked: "绑定 GitHub 后解锁角色页",
    goddess: "女神",
    guidance: "四点由你分配。选择故事如何开始。",
    remaining: (count: number) => `剩余 ${count} 点`,
    accept: "接受命运",
    confirmTitle: "确认命运？",
    confirmBody: "初始分配确认后不可更改。",
    cancel: "返回调整",
    confirm: "确认命运",
    ready: "你的命运已定。",
    readyBody: "临时角色已准备好进入神殿。",
    offeringHint: "绑定 GitHub 后才能进行正式献礼。",
    offer: "献上 Token",
    loading: "女神正在准备你的角色……",
    loadError: "女神暂时无法恢复你的临时角色。",
    settleError: "命运暂时无法确认，请重试。",
    retry: "重试",
    attributes: {
      courage: "勇气",
      strength: "力量",
      wisdom: "智慧",
      faith: "信心"
    }
  }
} satisfies Record<Locale, unknown>;

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}
