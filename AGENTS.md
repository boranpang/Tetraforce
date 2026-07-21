# 项目协作约定

- 使用中文简洁沟通，谨慎使用 Emoji。
- 遵循“Less, but better”：优先保证简单、稳定和可靠。
- 未澄清关键决策前不编码；超出现有设计能力时，先说明问题、方案与建议，等待确认。
- 工程任务默认由 Matt Pocock 技能体系主导；Matt 已有对应能力时，不重复调用同类 Superpowers 流程。
- 未经明确要求，不创建分支、提交或推送，也不执行耗时的完整构建。
- 本地文件以链接展示，避免展示项目绝对路径。

## Agent skills

### Issue tracker

需求、PRD 与任务暂存于本地 `.scratch/`；正式开发时迁移至 GitHub。详见 `docs/agents/issue-tracker.md`。

### Triage labels

采用 Matt 默认五状态标签。详见 `docs/agents/triage-labels.md`。

### Domain docs

采用单一上下文：根目录 `CONTEXT.md` 与 `docs/adr/`。详见 `docs/agents/domain.md`。
