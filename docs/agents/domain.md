# Domain Docs

本项目采用单一上下文领域文档布局。

## Before exploring, read these

- 根目录的 `CONTEXT.md`（如存在）
- `docs/adr/` 中与当前工作相关的 ADR（如存在）

文件不存在时继续工作，无需提前创建。`domain-modeling` 在术语或重要决策真正确定时按需创建。

## File structure

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

## Use the glossary's vocabulary

Issue、方案、测试与代码中的领域概念应采用 `CONTEXT.md` 定义的标准术语。若所需概念尚未定义，应判断它是无必要的新说法，还是需要通过领域建模补充的真实缺口。

## Flag ADR conflicts

若新方案与现有 ADR 冲突，必须明确指出冲突及重新考虑该决策的理由，不得静默覆盖。
