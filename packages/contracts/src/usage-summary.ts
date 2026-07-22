export const USAGE_AGENTS = ["claude-code", "codex"] as const;
export type UsageAgent = (typeof USAGE_AGENTS)[number];

export const USAGE_SUMMARY_KEYS = [
  "summaryKey",
  "agent",
  "utcHour",
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "collectorVersion",
  "sourceLogFormatVersion"
] as const;

export type UsageSummary = {
  summaryKey: string;
  agent: UsageAgent;
  utcHour: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  collectorVersion: string;
  sourceLogFormatVersion: string;
};

export const USAGE_SUMMARY_FIELDS = [
  {
    key: "summaryKey",
    label: { en: "Device-scoped summary key", zh: "设备范围摘要键" },
    description: {
      en: "A stable key scoped to one connected device; it is not a raw session identifier.",
      zh: "仅在一台已连接设备内稳定使用的键；它不是原始会话 ID。"
    }
  },
  {
    key: "agent",
    label: { en: "Agent", zh: "Agent" },
    description: {
      en: "The supported Agent that produced the usage: Claude Code or Codex.",
      zh: "产生用量的受支持 Agent：Claude Code 或 Codex。"
    }
  },
  {
    key: "utcHour",
    label: { en: "UTC hour", zh: "UTC 小时" },
    description: {
      en: "The hourly bucket in UTC, without a precise session or request time.",
      zh: "按 UTC 聚合的小时桶，不包含精确会话或请求时间。"
    }
  },
  {
    key: "inputTokens",
    label: { en: "Cumulative input Token", zh: "累计输入 Token" },
    description: {
      en: "The cumulative input Token count for this Agent and UTC hour.",
      zh: "该 Agent 在此 UTC 小时内的累计输入 Token 数。"
    }
  },
  {
    key: "outputTokens",
    label: { en: "Cumulative output Token", zh: "累计输出 Token" },
    description: {
      en: "The cumulative output Token count for this Agent and UTC hour.",
      zh: "该 Agent 在此 UTC 小时内的累计输出 Token 数。"
    }
  },
  {
    key: "cacheReadTokens",
    label: { en: "Cumulative cache-read Token", zh: "累计缓存读取 Token" },
    description: {
      en: "The cumulative cache-read Token count for this Agent and UTC hour.",
      zh: "该 Agent 在此 UTC 小时内的累计缓存读取 Token 数。"
    }
  },
  {
    key: "cacheWriteTokens",
    label: { en: "Cumulative cache-write Token", zh: "累计缓存写入 Token" },
    description: {
      en: "The cumulative cache-write Token count for this Agent and UTC hour.",
      zh: "该 Agent 在此 UTC 小时内的累计缓存写入 Token 数。"
    }
  },
  {
    key: "collectorVersion",
    label: { en: "Collector version", zh: "Collector 版本" },
    description: {
      en: "The Tetraforce Collector version that created the summary.",
      zh: "生成该摘要的 Tetraforce Collector 版本。"
    }
  },
  {
    key: "sourceLogFormatVersion",
    label: { en: "Source-log format version", zh: "源日志格式版本" },
    description: {
      en: "The parser version for the supported Agent's local log format.",
      zh: "用于解析受支持 Agent 本地日志格式的版本。"
    }
  }
] as const satisfies readonly {
  key: (typeof USAGE_SUMMARY_KEYS)[number];
  label: { en: string; zh: string };
  description: { en: string; zh: string };
}[];

export type UsageSummaryField = (typeof USAGE_SUMMARY_FIELDS)[number];

export function assertUsageSummary(value: unknown): asserts value is UsageSummary {
  if (!value || typeof value !== "object") {
    throw new Error("Usage Summary must be an object.");
  }

  const summary = value as Record<string, unknown>;
  const keys = Object.keys(summary);
  if (
    keys.length !== USAGE_SUMMARY_KEYS.length ||
    !keys.every((key, index) => key === USAGE_SUMMARY_KEYS[index])
  ) {
    throw new Error("Usage Summary fields do not match the approved allowlist.");
  }

  if (!USAGE_AGENTS.includes(summary.agent as UsageAgent)) {
    throw new Error("Usage Summary Agent is invalid.");
  }

  if (
    typeof summary.utcHour !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:00Z$/.test(summary.utcHour) ||
    Number.isNaN(Date.parse(summary.utcHour))
  ) {
    throw new Error("Usage Summary UTC hour is invalid.");
  }

  for (const key of [
    "inputTokens",
    "outputTokens",
    "cacheReadTokens",
    "cacheWriteTokens"
  ] as const) {
    if (!Number.isSafeInteger(summary[key]) || Number(summary[key]) < 0) {
      throw new Error(`Usage Summary ${key} must be a non-negative safe integer.`);
    }
  }

  for (const key of ["summaryKey", "collectorVersion", "sourceLogFormatVersion"] as const) {
    if (typeof summary[key] !== "string" || summary[key].length === 0) {
      throw new Error(`Usage Summary ${key} is required.`);
    }
  }
}
