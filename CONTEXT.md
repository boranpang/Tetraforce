# Tetraforce

一个面向全球 Vibe Coding 用户的公开角色养成游戏。玩家献上真实消耗的 Token，在女神的祝福与诅咒中塑造角色，并参与全站排行榜。

## Language

**玩家（Player）**：
参与献上 Token、养成角色及全站排名的人。
_Avoid_: 用户、成员

**临时角色（Guest Character）**：
访客首次进入网站时自动生成、尚未绑定持久身份的试玩角色；可以完成初始分配并浏览游戏，但不能进行正式献礼或进入全站排行榜。新 GitHub 身份绑定后继承该状态，已有角色则覆盖它。
_Avoid_: 游客账号、匿名账号

**角色（Character）**：
玩家拥有的唯一持久游戏身份，承载属性、技能与排名成绩；MVP 中由一个 GitHub 账号绑定一个角色。
_Avoid_: 虚拟角色、Avatar、账号

**游戏昵称（Game Name）**：
玩家在 Tetraforce 公开展示的全站唯一名称，与 GitHub 用户名及角色稳定 ID 相互独立。
_Avoid_: 用户名、GitHub 名称、Display Name

**属性（Attribute）**：
衡量角色成长的非负整数，固定按勇气（Courage）、力量（Strength）、智慧（Wisdom）、信心（Faith）的顺序展示；角色创建时每项均为 1，最低为 0，MVP 不设上限。
_Avoid_: 能力值、Stats

**初始分配（Initial Allocation）**：
角色开始正式流程前必须完成的一次四点自由分配；特定的全投分配会触发隐藏结果。
_Avoid_: 新手加点、首次加点

**女神（Goddess）**：
Tetraforce 世界中掌管 Token 的女神。玩家向她献上 Token，她以祝福或诅咒回应。
_Public name_: 女神 / The Goddess

**献礼（Offering）**：
玩家向女神献上服务端当前全部有效 Token，并触发一次结果判定。首次绑定采集器时，每台设备最多纳入当前 UTC 小时与此前 23 个小时桶。
_Avoid_: 献上、提交 Token、兑换

**有效 Token（Eligible Tokens）**：
由受支持 Agent 产生、通过基础校验、且尚未被任何成功献礼消费的 Token 用量；等于所有摘要累计值与已消费值之间的正差额，不使用价格或缓存权重。
_Avoid_: 当日 Token、Token 余额

**用量摘要（Usage Summary）**：
采集器按设备、Agent 与 UTC 小时在本地聚合的累计计量记录，仅包含摘要键、Agent、UTC 小时、各类 Token 累计值及解析版本，不包含精确会话时间、模型标识、费用或任何对话和项目内容。
_Avoid_: 日志、会话数据、遥测

**祝福（Blessing）**：
献礼可能产生的正向结果，为玩家授予 1 至 3 个可分配点数；常态基础概率为 80%，且诅咒后的下一次献礼必定获得祝福。
_Avoid_: 奖励、中奖

**诅咒（Curse）**：
献礼可能产生的负向结果，从所有大于 0 的属性中随机选择一项并扣除 1 点；常态基础概率为 20%，同一玩家不会连续两次获得诅咒。
_Avoid_: 惩罚、失败

**女神的怜悯（Goddess's Mercy）**：
当角色四项属性意外全部为 0 时触发的安全兜底，授予 4 个必须立即分配的点数；正常游戏规则下不应出现。
_Avoid_: 保底祝福、新手补偿

**可分配点数（Unallocated Points）**：
祝福授予但尚未分配到四项属性的临时成长资源；玩家必须在继续游戏前分配完毕，不能长期囤积。
_Avoid_: 自由点数、属性点

**冷却期（Cooldown）**：
从服务端成功创建献礼结果时开始计算的 12 小时滚动等待窗口，不按自然日重置。

**受支持 Agent（Supported Agent）**：
其本地日志可被官方采集工具解析并用于献礼的 Coding Agent；MVP 仅包含 Claude Code 与 Codex。
_Avoid_: 平台、模型

**采集器（Collector）**：
安装在玩家设备上的官方 CLI，负责读取受支持 Agent 的本地日志、生成最小用量摘要并后台同步至持久角色。
_Avoid_: 客户端、插件、Agent

**设备授权码（Device Code）**：
网页为绑定采集器生成的短时一次性凭证，不可作为长期登录令牌。
_Avoid_: API Key、访问令牌

**技能（Skill）**：
未来版本可能加入、用于改变游戏体验的角色能力；不属于 MVP。

**全站排行榜（Global Leaderboard）**：
所有符合展示资格的持久角色共同参与的永久累计排名，包含累计献礼 Token 与四项属性五个榜单，不按赛季清零。
_Avoid_: 小组排行榜、公开排名

**公开角色页（Public Character Profile）**：
展示角色公开身份、成长数值及排名的可分享页面，不公开玩家的 GitHub 身份或单次献礼明细。
_Avoid_: 用户主页、个人中心

**神殿（Temple）**：
Tetraforce 的首页与核心游戏场景，承载女神、角色、献礼、冷却、结果反馈及加点流程。
_Avoid_: 仪表盘、控制台、首页 Dashboard

**世界榜（World Rankings）**：
用于浏览五个全站排行榜、查看自身名次并进入其他公开角色页的主要页面。
_Avoid_: Leaderboard 页面、排名中心

**隐藏角色（Hidden Character）**：
因明显异常或管理决定而退出排行榜、公开角色页与分享的持久角色；玩家仍可登录并继续游戏。
_Avoid_: 封禁账号、封号
