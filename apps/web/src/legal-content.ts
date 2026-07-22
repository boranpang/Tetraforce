import type { Locale } from "./i18n";

export type LegalDocument = "privacy" | "terms" | "contact";

type LegalSection = {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
};

type LegalPageContent = {
  title: string;
  summary: string;
  updated: string;
  sections: readonly LegalSection[];
};

export const legalContent: Record<Locale, Record<LegalDocument, LegalPageContent>> = {
  en: {
    privacy: {
      title: "Privacy",
      summary: "What Tetraforce receives, what becomes public, and how participation data is handled.",
      updated: "Effective July 22, 2026",
      sections: [
        {
          id: "controller",
          title: "Who handles your data",
          paragraphs: [
            "The Tetraforce operator determines how data is used to run the game. We do not sell personal data or use it for advertising or marketing profiles."
          ]
        },
        {
          id: "usage-summary",
          title: "Usage Summary upload allowlist",
          paragraphs: [
            "The Collector may upload only the fields below. Token counts are cumulative for one device, Agent, and UTC hour. Token categories are treated equally for gameplay."
          ]
        },
        {
          id: "prohibited",
          title: "Content the Collector must never upload",
          bullets: [
            "Prompts, responses, code, tool calls, and commands",
            "Project names, repositories, file paths, Git branches, and operating-system usernames",
            "Raw session IDs and precise session, request, or call timestamps",
            "Device or computer names, model identifiers, costs, and cost estimates"
          ]
        },
        {
          id: "public-fields",
          title: "Public character fields",
          paragraphs: [
            "A persistent Character is public after GitHub binding. Players who do not want public participation may remain temporary or delete their persistent Character."
          ],
          bullets: [
            "Game Name, preset image or badge, and a GitHub-verified indicator without the GitHub username or profile link",
            "Courage, Strength, Wisdom, and Faith values and ranks",
            "Total Tokens Offered and rank, last successful Offering time, and successful Offering count",
            "The offered Token share between Claude Code and Codex when the total is greater than zero"
          ]
        },
        {
          id: "processors",
          title: "Processors",
          bullets: [
            "Vercel hosts the Web application and API.",
            "Supabase provides authentication, the database, and managed backups.",
            "GitHub provides identity during binding; the public Character never shows the GitHub username.",
            "Sentry receives scrubbed exception and release context. Request bodies, device codes, identity mappings, and Usage Summaries are excluded."
          ]
        },
        {
          id: "retention-deletion",
          title: "Retention and deletion",
          bullets: [
            "Usage Summaries and other linkable records are retained while the persistent Character exists so the service can calculate Eligible Tokens and settle Offerings. Unoffered Token does not expire.",
            "Deleting a Character immediately removes its public page and ranking eligibility, then deletes identity mappings, Game Name, attributes, Unallocated Points, Offering records, Usage Summaries, device credentials, consent records, and other linkable player data.",
            "After deletion, only a one-way GitHub identity digest and its recreate-after time remain for seven days. Irreversible global aggregates that cannot be linked to a player may remain.",
            "Operational logs and managed backups follow the access controls and retention settings of the processors above; they are not used for advertising or gameplay profiling."
          ]
        },
        {
          id: "requests",
          title: "Your choices",
          paragraphs: [
            "Use the Contact page for privacy or deletion questions. Character deletion itself will be available from the player's Character page and will require fresh GitHub authentication plus a second confirmation."
          ]
        }
      ]
    },
    terms: {
      title: "Terms",
      summary: "The simple rules for participating in Tetraforce.",
      updated: "Effective July 22, 2026",
      sections: [
        {
          id: "entertainment",
          title: "Entertainment only",
          paragraphs: [
            "Tetraforce is an entertainment game. It is not a financial product, employment record, accounting service, or certified measurement system."
          ]
        },
        {
          id: "accuracy",
          title: "No accuracy guarantee",
          paragraphs: [
            "Usage, rankings, availability, and game results are provided as-is. Local Agent formats, network failures, copied logs, and other limitations can make Token totals incomplete or duplicated. We do not guarantee uninterrupted service or exact accounting."
          ]
        },
        {
          id: "rewards",
          title: "No real-world reward",
          paragraphs: [
            "No Token, attribute, rank, or Offering has monetary value. Tetraforce grants no cash, prize, ownership right, or entitlement outside the game."
          ]
        },
        {
          id: "abuse",
          title: "Fair participation",
          bullets: [
            "Do not fabricate, roll back, replay, or manipulate usage counters or credentials.",
            "Do not disrupt the service, evade limits, probe other players' private data, or exploit security defects.",
            "Do not impersonate Tetraforce, the operator, an administrator, the Goddess, or another player.",
            "Do not use the service for unlawful, abusive, or harassing activity."
          ]
        },
        {
          id: "moderation",
          title: "Operator moderation",
          paragraphs: [
            "The operator may hide or restore a Character when obvious anomalies, abuse, or a moderation decision requires it. A hidden Character can continue playing but disappears from rankings, its public page, and sharing. The operator may reject invalid data or restrict access needed to protect the service."
          ]
        },
        {
          id: "changes",
          title: "Changes and contact",
          paragraphs: [
            "The current Terms and Privacy versions must be accepted before a first real Offering. Material changes will be reflected by an updated effective date. Use the Contact page to request moderation review or report a concern."
          ]
        }
      ]
    },
    contact: {
      title: "Contact",
      summary: "One support channel for privacy, moderation, and security concerns.",
      updated: "Updated July 22, 2026",
      sections: [
        {
          id: "privacy-requests",
          title: "Privacy requests",
          paragraphs: [
            "Email support with the subject “Privacy request”. Describe the request and the Game Name involved. Do not send local Agent logs, prompts, code, device credentials, or a GitHub password."
          ]
        },
        {
          id: "moderation-review",
          title: "Moderation review",
          paragraphs: [
            "Email support with the subject “Moderation review” and include the Game Name plus a short explanation. Review does not guarantee that public visibility will be restored."
          ]
        },
        {
          id: "security-reports",
          title: "Security reports",
          paragraphs: [
            "Email support with the subject “Security report”. Include affected URLs, reproducible steps, and potential impact. Avoid accessing other players' data or disrupting the service while investigating."
          ]
        }
      ]
    }
  },
  zh: {
    privacy: {
      title: "隐私说明",
      summary: "说明 Tetraforce 接收哪些数据、哪些信息会公开，以及参与数据如何处理。",
      updated: "2026 年 7 月 22 日生效",
      sections: [
        {
          id: "controller",
          title: "数据处理方",
          paragraphs: [
            "Tetraforce 运营者决定如何使用数据来运行游戏。我们不会出售个人数据，也不会将其用于广告或营销画像。"
          ]
        },
        {
          id: "usage-summary",
          title: "Usage Summary 上传白名单",
          paragraphs: [
            "Collector 只允许上传以下字段。Token 数量按一台设备、一个 Agent 和一个 UTC 小时累计；所有 Token 类别在游戏中等价。"
          ]
        },
        {
          id: "prohibited",
          title: "Collector 严禁上传的内容",
          bullets: [
            "Prompt、回复、代码、工具调用与命令文本",
            "项目名、仓库、文件路径、Git 分支与操作系统用户名",
            "原始会话 ID，以及精确的会话、请求或调用时间",
            "设备或电脑名称、模型标识、费用与费用估算"
          ]
        },
        {
          id: "public-fields",
          title: "公开角色字段",
          paragraphs: [
            "绑定 GitHub 后，持久角色会公开。若玩家不希望公开参与，可以保持临时角色，或删除持久角色。"
          ],
          bullets: [
            "游戏昵称、预设形象或徽章，以及不含 GitHub 用户名和主页链接的 GitHub 已验证标识",
            "勇气、力量、智慧、信心的数值与排名",
            "累计献礼 Token 与排名、最近一次成功献礼时间、成功献礼次数",
            "累计献礼 Token 大于零时，Claude Code 与 Codex 的献礼 Token 占比"
          ]
        },
        {
          id: "processors",
          title: "服务处理方",
          bullets: [
            "Vercel 托管 Web 应用与 API。",
            "Supabase 提供身份验证、数据库和托管备份。",
            "GitHub 在绑定时提供身份；公开角色不会显示 GitHub 用户名。",
            "Sentry 只接收经过清理的异常与发布上下文；请求正文、设备授权码、身份映射和 Usage Summary 均会排除。"
          ]
        },
        {
          id: "retention-deletion",
          title: "保留与删除",
          bullets: [
            "持久角色存在期间，Usage Summary 与其他可关联记录会被保留，用于计算有效 Token 和结算献礼；尚未献礼的 Token 不会过期。",
            "删除角色会立即移除公开角色页和排名资格，随后删除身份映射、游戏昵称、属性、可分配点数、献礼记录、Usage Summary、设备凭证、同意记录及其他可关联的玩家数据。",
            "删除后只保留 GitHub 身份的单向摘要与七天后的可重建时间；无法再关联玩家的不可逆全局汇总可以保留。",
            "运营日志与托管备份遵循上述处理方的访问控制和保留设置；它们不会用于广告或游戏画像。"
          ]
        },
        {
          id: "requests",
          title: "你的选择",
          paragraphs: [
            "如有隐私或删除问题，请使用联系页面。角色删除功能将位于玩家自己的角色页，并要求重新通过 GitHub 验证及再次明确确认。"
          ]
        }
      ]
    },
    terms: {
      title: "条款",
      summary: "参与 Tetraforce 时需要遵守的简单规则。",
      updated: "2026 年 7 月 22 日生效",
      sections: [
        {
          id: "entertainment",
          title: "仅供娱乐",
          paragraphs: [
            "Tetraforce 是娱乐游戏，不是金融产品、工作记录、会计服务或经认证的计量系统。"
          ]
        },
        {
          id: "accuracy",
          title: "不保证准确性",
          paragraphs: [
            "用量、排名、可用性和游戏结果均按现状提供。本地 Agent 格式、网络故障、复制日志及其他限制可能造成 Token 总量遗漏或重复。我们不保证服务不中断，也不保证精确计量。"
          ]
        },
        {
          id: "rewards",
          title: "无现实奖励",
          paragraphs: [
            "任何 Token、属性、排名或献礼都不具有货币价值。Tetraforce 不授予游戏之外的现金、奖品、所有权或权益。"
          ]
        },
        {
          id: "abuse",
          title: "公平参与",
          bullets: [
            "不得伪造、回退、重放或操纵用量计数及凭证。",
            "不得干扰服务、规避限制、探查其他玩家的私有数据或利用安全缺陷。",
            "不得冒充 Tetraforce、运营者、管理员、女神或其他玩家。",
            "不得将服务用于违法、滥用或骚扰行为。"
          ]
        },
        {
          id: "moderation",
          title: "运营者审核权限",
          paragraphs: [
            "出现明显异常、滥用或审核决定时，运营者可以隐藏或恢复角色。隐藏角色仍可继续游戏，但会从排名、公开角色页和分享中消失。为保护服务，运营者也可以拒绝无效数据或采取必要的访问限制。"
          ]
        },
        {
          id: "changes",
          title: "变更与联系",
          paragraphs: [
            "首次正式献礼前，玩家必须接受当前版本的条款与隐私说明。重大变更会通过更新生效日期体现。如需审核复查或报告问题，请使用联系页面。"
          ]
        }
      ]
    },
    contact: {
      title: "联系",
      summary: "通过同一支持渠道处理隐私、审核与安全问题。",
      updated: "2026 年 7 月 22 日更新",
      sections: [
        {
          id: "privacy-requests",
          title: "隐私请求",
          paragraphs: [
            "请发送邮件至支持邮箱，主题写明“隐私请求”，并说明请求内容及相关游戏昵称。请勿发送本地 Agent 日志、Prompt、代码、设备凭证或 GitHub 密码。"
          ]
        },
        {
          id: "moderation-review",
          title: "审核复查",
          paragraphs: [
            "请发送邮件至支持邮箱，主题写明“审核复查”，并附上游戏昵称和简短说明。提交复查不保证恢复公开可见性。"
          ]
        },
        {
          id: "security-reports",
          title: "安全报告",
          paragraphs: [
            "请发送邮件至支持邮箱，主题写明“安全报告”，并附上受影响 URL、可复现步骤与潜在影响。调查期间请避免访问其他玩家的数据或干扰服务。"
          ]
        }
      ]
    }
  }
};
