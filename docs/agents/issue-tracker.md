# Issue tracker: Local Markdown

需求、PRD 与实施任务暂存于 `.scratch/`。正式启动开发并建立 GitHub 仓库后，再迁移至 GitHub Issues。

## Conventions

- 每项功能一个目录：`.scratch/<feature-slug>/`
- PRD：`.scratch/<feature-slug>/PRD.md`
- 实施任务：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号
- 每个任务文件顶部使用 `Status:` 记录状态，状态值见 `triage-labels.md`
- 讨论记录追加在任务文件底部的 `## Comments` 下

## When a skill says "publish to the issue tracker"

在 `.scratch/<feature-slug>/` 下创建文件；目录不存在时一并创建。

## When a skill says "fetch the relevant ticket"

读取用户提供的路径或编号所对应的本地 Markdown 文件。

## Wayfinding operations

用于 `/wayfinder`。每张工作地图对应若干子任务文件。

- 地图：`.scratch/<effort>/map.md`
- 子任务：`.scratch/<effort>/issues/NN-<slug>.md`
- 类型：使用 `Type:` 记录 `research`、`prototype`、`grilling` 或 `task`
- 状态：使用 `Status:` 记录 `claimed` 或 `resolved`
- 阻塞：使用 `Blocked by: NN, NN`；所有依赖解决后任务才可领取
- 领取：开始工作前将状态设为 `claimed`
- 解决：在 `## Answer` 下记录结论，将状态设为 `resolved`，并向地图追加结论与链接
