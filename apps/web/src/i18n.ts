export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

export const copy = {
  en: {
    tagline: "Offer Tokens. Shape Your Fate.",
    temple: "Temple",
    rankings: "World Rankings",
    rankingsSoon: "World Rankings are coming soon",
    characterLocked: "Connect GitHub to unlock Character",
    characterComingSoon: "Character page opens in the next stage",
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
    binding: {
      connectTitle: "Connect GitHub",
      connectBody: "Bind a verified GitHub identity before creating your persistent Character.",
      connectAction: "Continue with GitHub",
      unavailable: "GitHub binding is not configured in this environment.",
      authenticationError: "GitHub connection failed. Try connecting again.",
      completeTitle: "Complete GitHub binding",
      completeBody: "Choose your public Game Name and accept the current legal versions.",
      publicDisclosure: "Your persistent Character will be public.",
      publicFields: [
        "Game Name, preset badge, and GitHub-verified indicator",
        "Attributes and ranks",
        "Total Tokens Offered, rank, last Offering time, and Offering count",
        "Claude Code and Codex offered-Token share when available",
        "Your GitHub username and profile link stay private."
      ],
      gameName: "Game Name",
      gameNameHelp: "3-16 characters: letters, numbers, or underscore.",
      acceptTerms: "I accept the current Terms effective July 22, 2026:",
      acceptPrivacy: "I accept the current Privacy effective July 22, 2026:",
      terms: "Terms",
      privacy: "Privacy",
      create: "Create Character",
      creating: "Creating...",
      taken: "That Game Name is already taken.",
      failure: "Character binding could not be completed. Check the Game Name and try again.",
      verified: "GitHub verified",
      persistentReady: "Your persistent Character is ready.",
      collectorLater: "Connect a Collector before your first Offering."
    },
    collector: {
      title: "Connect Collector",
      body: "Create a short-lived, one-time code. Enter it only in the official Tetraforce Collector.",
      create: "Create Device Code",
      creating: "Creating...",
      codeLabel: "One-time Device Code",
      expires: (date: Date) =>
        `Expires at ${date.toLocaleTimeString("en", {
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short"
        })}.`,
      command: (origin: string) =>
        `Then run: TETRAFORCE_API_URL=${origin} npx tetraforce init`,
      limit:
        "Five active devices are already connected. Run npx tetraforce unlink on one connected device, then try again.",
      failure: "A Device Code could not be created. Try again."
    },
    sync: {
      title: "Collector status",
      eligible: "Eligible Tokens",
      connection: "Connection",
      connected: "Connected",
      disconnected: "Not connected",
      lastSync: "Last data sync",
      never: "No data synced yet",
      stale: "Collector data is more than 90 minutes old. Run npx tetraforce sync.",
      unavailable: "Collector status is temporarily unavailable.",
      ready: "Eligible Tokens are ready for a future Offering."
    },
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
    characterComingSoon: "角色页将在下一阶段开放",
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
    binding: {
      connectTitle: "绑定 GitHub",
      connectBody: "创建持久角色前，需要绑定一个经过验证的 GitHub 身份。",
      connectAction: "使用 GitHub 继续",
      unavailable: "当前环境尚未配置 GitHub 绑定。",
      authenticationError: "GitHub 连接失败，请重新尝试绑定。",
      completeTitle: "完成 GitHub 绑定",
      completeBody: "选择公开游戏昵称，并同意当前法律版本。",
      publicDisclosure: "你的持久角色将公开展示。",
      publicFields: [
        "游戏昵称、预设徽章和 GitHub 已验证标记",
        "四项属性及排名",
        "累计献礼 Token、排名、最近献礼时间和献礼次数",
        "存在数据时的 Claude Code 与 Codex 献礼 Token 占比",
        "GitHub 用户名和个人主页链接不会公开。"
      ],
      gameName: "游戏昵称",
      gameNameHelp: "3–16 个字符，仅限字母、数字或下划线。",
      acceptTerms: "我同意 2026 年 7 月 22 日生效的当前条款：",
      acceptPrivacy: "我同意 2026 年 7 月 22 日生效的当前隐私说明：",
      terms: "条款",
      privacy: "隐私说明",
      create: "创建角色",
      creating: "正在创建……",
      taken: "该游戏昵称已被使用。",
      failure: "暂时无法完成角色绑定，请检查游戏昵称后重试。",
      verified: "GitHub 已验证",
      persistentReady: "你的持久角色已准备就绪。",
      collectorLater: "完成 Collector 连接后才能进行首次献礼。"
    },
    collector: {
      title: "连接 Collector",
      body: "生成短时一次性设备码，并且只在官方 Tetraforce Collector 中输入。",
      create: "生成设备码",
      creating: "正在生成……",
      codeLabel: "一次性设备码",
      expires: (date: Date) =>
        `有效期至 ${date.toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short"
        })}。`,
      command: (origin: string) =>
        `然后运行：TETRAFORCE_API_URL=${origin} npx tetraforce init`,
      limit:
        "已连接五台活跃设备。请先在一台已连接设备上运行 npx tetraforce unlink，再重试。",
      failure: "暂时无法生成设备码，请重试。"
    },
    sync: {
      title: "Collector 状态",
      eligible: "有效 Token",
      connection: "连接状态",
      connected: "已连接",
      disconnected: "未连接",
      lastSync: "最后数据同步",
      never: "尚未同步数据",
      stale: "Collector 数据已超过 90 分钟未更新，请运行 npx tetraforce sync。",
      unavailable: "暂时无法读取 Collector 状态。",
      ready: "有效 Token 可用于后续献礼。"
    },
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
