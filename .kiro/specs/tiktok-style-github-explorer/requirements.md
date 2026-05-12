# 需求文档

## 简介

本功能旨在构建一个"抖音风格"的 GitHub 仓库探索应用（TikTok-Style GitHub Explorer）。用户以全屏、纵向滑动的卡片流（Feed）方式逐个浏览 GitHub 仓库，每张卡片展示一个仓库的关键信息（名称、描述、主要语言、星标数、README 摘要等）。用户可通过正向反馈（点赞、收藏、关注）表达兴趣，通过负向反馈（不感兴趣、减少类似推荐）过滤不相关内容。系统基于用户行为构建兴趣画像，使用推荐算法持续推送更符合用户偏好的仓库，实现"越刷越懂你"的个性化发现体验。

## 术语表

- **Explorer_System**: 抖音风格 GitHub 仓库探索应用的整体系统。
- **Feed_Service**: 负责生成与管理仓库推荐 Feed 流的子系统。
- **Recommendation_Engine**: 基于用户兴趣画像计算候选仓库推荐顺序与权重的子系统。
- **Interest_Profile**: 描述单个用户兴趣的数据结构，包含编程语言偏好、主题（topic）偏好、作者偏好、仓库规模偏好及其权重。
- **Repository_Card**: Feed 流中单张仓库卡片，包含仓库元数据与操作按钮。
- **Feedback_Service**: 记录用户正向与负向反馈事件并将其转换为 Interest_Profile 更新的子系统。
- **Feedback_Event**: 单次用户交互记录，包含用户 ID、仓库 ID、反馈类型（like / favorite / follow / not_interested / skip / dwell）、时间戳、停留时长。
- **GitHub_Adapter**: 封装 GitHub REST / GraphQL API 调用的子系统，负责仓库元数据获取、认证、限流处理。
- **Auth_Service**: 负责用户登录及 GitHub OAuth 授权管理的子系统。
- **Dwell_Time**: 用户在单张 Repository_Card 上停留的毫秒数。
- **Candidate_Pool**: Recommendation_Engine 准备用于排序的候选仓库集合。
- **README_Summary**: 对仓库 README 内容进行裁剪后的摘要文本，长度受限。
- **Rate_Limit_Budget**: GitHub API 在当前时间窗口内剩余的可用请求次数。

## 需求

### 需求 1：Feed 流卡片浏览

**用户故事：** 作为一个开发者用户，我希望以全屏卡片流的方式连续浏览 GitHub 仓库，以便像刷抖音一样轻松发现感兴趣的项目。

#### 验收标准

1. WHEN 用户打开应用主页, THE Explorer_System SHALL 展示当前 Feed 流中的第一张 Repository_Card 并占据可视区域 100% 的高度。
2. WHEN 用户在 Repository_Card 上执行向上滑动手势, THE Feed_Service SHALL 切换到 Feed 流中的下一张 Repository_Card。
3. WHEN 用户在 Repository_Card 上执行向下滑动手势, THE Feed_Service SHALL 切换到 Feed 流中的上一张 Repository_Card。
4. WHILE 当前 Repository_Card 正在展示, THE Explorer_System SHALL 显示仓库名称、所属账号、主要编程语言、星标数量、Fork 数量、主要主题标签与 README_Summary。
5. WHERE 仓库包含 README 文档, THE Explorer_System SHALL 展示长度不超过 500 字符的 README_Summary。
6. WHEN 当前 Repository_Card 已显示给用户, THE Feedback_Service SHALL 开始计算本张卡片的 Dwell_Time。
7. WHEN 用户切换到下一张或上一张 Repository_Card, THE Feedback_Service SHALL 记录一条类型为 dwell 的 Feedback_Event，其中 Dwell_Time 为卡片展示起止之间的毫秒数。

### 需求 2：正向反馈交互

**用户故事：** 作为一个开发者用户，我希望能对感兴趣的仓库进行点赞、收藏、关注操作，以便保存喜欢的项目并让系统学习我的偏好。

#### 验收标准

1. WHEN 用户点击当前 Repository_Card 上的点赞按钮, THE Feedback_Service SHALL 记录一条类型为 like 的 Feedback_Event。
2. WHEN 用户点击当前 Repository_Card 上的收藏按钮, THE Feedback_Service SHALL 记录一条类型为 favorite 的 Feedback_Event 并将仓库加入用户的收藏列表。
3. WHEN 用户点击当前 Repository_Card 上的关注作者按钮且用户已完成 GitHub OAuth 授权, THE GitHub_Adapter SHALL 调用 GitHub API 以使授权用户关注该仓库作者。
4. WHEN 用户点击当前 Repository_Card 上的 Star 按钮且用户已完成 GitHub OAuth 授权, THE GitHub_Adapter SHALL 调用 GitHub API 以使授权用户为该仓库加星。
5. IF 用户点击关注作者或 Star 按钮但用户未完成 GitHub OAuth 授权, THEN THE Auth_Service SHALL 引导用户进入 GitHub OAuth 授权流程。
6. WHEN Feedback_Service 记录任一正向 Feedback_Event, THE Recommendation_Engine SHALL 在 2 秒内使用该事件更新当前用户的 Interest_Profile。
7. WHEN 用户对同一仓库重复点击点赞或收藏按钮以取消操作, THE Feedback_Service SHALL 将对应 Feedback_Event 的状态更新为已撤销并通知 Recommendation_Engine 回滚对应权重。

### 需求 3：负向反馈交互

**用户故事：** 作为一个开发者用户，我希望能对不感兴趣的仓库进行"不感兴趣"操作或直接快速划过，以便减少类似内容的推荐。

#### 验收标准

1. WHEN 用户点击当前 Repository_Card 上的"不感兴趣"按钮, THE Feedback_Service SHALL 记录一条类型为 not_interested 的 Feedback_Event。
2. WHEN Feedback_Service 记录一条 not_interested 事件, THE Feed_Service SHALL 立即切换到下一张 Repository_Card。
3. WHEN Feedback_Service 记录一条 not_interested 事件, THE Recommendation_Engine SHALL 降低该仓库的主要编程语言、主题标签和作者在 Interest_Profile 中的权重。
4. WHEN 用户在某张 Repository_Card 上的 Dwell_Time 小于 2000 毫秒且未产生任何正向反馈, THE Feedback_Service SHALL 将该展示记录为 skip 类型的 Feedback_Event。
5. WHERE 同一作者在最近 50 张 Repository_Card 中累计产生 3 条或以上 not_interested 事件, THE Recommendation_Engine SHALL 在后续 24 小时内不再推荐该作者的仓库。
6. WHEN Feedback_Service 记录一条 not_interested 事件, THE Recommendation_Engine SHALL 在该仓库之后的 Feed 流中的 30 天内不再推荐同一仓库。

### 需求 4：兴趣画像构建与维护

**用户故事：** 作为一个开发者用户，我希望系统根据我的反馈行为构建并维护我的兴趣画像，以便推荐结果随时间持续优化。

#### 验收标准

1. THE Recommendation_Engine SHALL 为每个已登录用户维护一个 Interest_Profile，包含语言、主题、作者、仓库规模四个维度的权重向量。
2. WHEN Feedback_Service 记录一条正向 Feedback_Event, THE Recommendation_Engine SHALL 按照事件类型增加对应维度的权重，其中 like 权重增量为 1、favorite 权重增量为 3、follow 权重增量为 5。
3. WHEN Feedback_Service 记录一条 not_interested 事件, THE Recommendation_Engine SHALL 将对应维度的权重减少 3。
4. WHEN Feedback_Service 记录一条 skip 事件, THE Recommendation_Engine SHALL 将对应维度的权重减少 0.5。
5. THE Recommendation_Engine SHALL 对 Interest_Profile 中所有权重维度每 24 小时应用一次衰减系数 0.98 以降低陈旧偏好的影响。
6. THE Recommendation_Engine SHALL 将 Interest_Profile 中任一维度的单个权重值限制在 -10 到 10 之间。
7. WHEN 用户首次登录且尚无任何 Feedback_Event, THE Recommendation_Engine SHALL 基于用户 GitHub 账号的 starred 仓库与 followed 用户初始化 Interest_Profile。
8. WHERE 用户未登录, THE Recommendation_Engine SHALL 使用基于设备本地存储的匿名 Interest_Profile 进行推荐。

### 需求 5：推荐算法与 Feed 生成

**用户故事：** 作为一个开发者用户，我希望每次打开应用或滑动时都能看到按我的兴趣排序的仓库，以便减少无关内容的干扰。

#### 验收标准

1. WHEN 当前用户的 Feed 队列剩余未查看 Repository_Card 数量小于或等于 5, THE Feed_Service SHALL 触发 Recommendation_Engine 生成新的一批推荐。
2. WHEN Recommendation_Engine 被触发生成推荐, THE Recommendation_Engine SHALL 基于当前 Interest_Profile 从 Candidate_Pool 中按评分排序返回不少于 20 个仓库。
3. THE Recommendation_Engine SHALL 为每个候选仓库计算评分，评分由该仓库的语言、主题、作者、规模在 Interest_Profile 中的权重加权求和得出。
4. WHERE 两个候选仓库的评分差小于 0.01, THE Recommendation_Engine SHALL 将 GitHub 星标数较高的仓库排在前面。
5. THE Recommendation_Engine SHALL 在每批 20 个推荐中包含至少 2 个来自用户当前 Interest_Profile 权重最低维度的"探索型"仓库，以避免过滤气泡。
6. IF Candidate_Pool 在生成推荐时为空, THEN THE Recommendation_Engine SHALL 回退到按 GitHub Trending 的仓库列表生成 Feed。
7. THE Feed_Service SHALL 保证同一仓库在 7 天内不会在同一用户的 Feed 中重复出现，除非该仓库被用户主动收藏并从收藏列表中重新打开。

### 需求 6：仓库数据获取与 GitHub API 集成

**用户故事：** 作为一个开发者用户，我希望看到的仓库信息是最新且准确的，以便做出是否感兴趣的判断。

#### 验收标准

1. WHEN Feed_Service 请求一个仓库的详细信息且该信息不在缓存中, THE GitHub_Adapter SHALL 调用 GitHub API 获取仓库元数据与 README 内容。
2. WHEN GitHub_Adapter 成功获取仓库元数据, THE Explorer_System SHALL 将该元数据在缓存中保留 6 小时。
3. WHILE Rate_Limit_Budget 小于 100, THE GitHub_Adapter SHALL 仅从缓存返回仓库信息且暂停对 GitHub API 的新请求。
4. IF GitHub_Adapter 调用 GitHub API 时收到 HTTP 状态码 403 或 429, THEN THE GitHub_Adapter SHALL 根据响应头 `X-RateLimit-Reset` 指定的时间延迟下一次请求。
5. IF GitHub_Adapter 调用 GitHub API 时收到 HTTP 状态码 404, THEN THE Feed_Service SHALL 从 Feed 队列中移除该仓库并标记为不可用。
6. WHEN GitHub_Adapter 获取到仓库的 README 原始内容, THE Explorer_System SHALL 生成长度不超过 500 字符的 README_Summary。
7. FOR ALL 仓库元数据对象, 执行 序列化 再 反序列化 SHALL 得到与原对象等价的数据结构（往返属性）。

### 需求 7：无限滚动与预加载

**用户故事：** 作为一个开发者用户，我希望在滑动浏览时不会看到加载等待，以便获得顺畅的刷流体验。

#### 验收标准

1. WHEN 当前用户的 Feed 队列剩余未查看 Repository_Card 数量小于或等于 3, THE Feed_Service SHALL 预取下一张 Repository_Card 所需的全部元数据与 README_Summary。
2. WHEN 用户切换到下一张 Repository_Card 且该卡片所需数据已预取完成, THE Explorer_System SHALL 在 100 毫秒内完成卡片渲染。
3. IF Feed_Service 无法在用户到达 Feed 队列末尾前准备好新的 Repository_Card, THEN THE Explorer_System SHALL 显示一个加载状态指示器直到新的 Repository_Card 就绪。
4. WHILE 用户处于离线状态, THE Explorer_System SHALL 允许用户继续浏览已缓存的 Repository_Card。
5. WHERE 设备可用存储低于 50 MB, THE Explorer_System SHALL 将缓存的 Repository_Card 数量限制在 20 张以内。

### 需求 8：用户认证与 GitHub OAuth 授权

**用户故事：** 作为一个开发者用户，我希望使用 GitHub 账号登录，以便让点赞、Star、关注等操作同步到我真实的 GitHub 账号。

#### 验收标准

1. WHEN 用户点击登录按钮, THE Auth_Service SHALL 将用户重定向至 GitHub OAuth 授权页面。
2. WHEN GitHub OAuth 回调成功返回授权码, THE Auth_Service SHALL 使用该授权码换取访问令牌并持久化存储于安全存储中。
3. THE Auth_Service SHALL 在访问令牌即将在 5 分钟内过期时刷新令牌。
4. IF Auth_Service 检测到访问令牌已被撤销, THEN THE Auth_Service SHALL 清除本地令牌并将用户状态置为未登录。
5. WHEN 用户主动点击退出登录, THE Auth_Service SHALL 清除本地令牌并保留匿名 Interest_Profile 数据。
6. WHERE 用户未登录, THE Explorer_System SHALL 允许用户浏览 Feed 并记录本地反馈，但 SHALL 禁用 Star 与关注作者按钮。

### 需求 9：收藏列表管理

**用户故事：** 作为一个开发者用户，我希望查看并管理我收藏过的仓库，以便日后回顾感兴趣的项目。

#### 验收标准

1. THE Explorer_System SHALL 提供一个收藏列表页面，展示当前用户所有类型为 favorite 且未撤销的 Feedback_Event 对应的仓库。
2. THE 收藏列表 SHALL 按收藏时间倒序排列。
3. WHEN 用户在收藏列表中点击某个仓库条目, THE Explorer_System SHALL 打开对应的 Repository_Card 详情视图。
4. WHEN 用户在收藏列表中对某个仓库执行移除操作, THE Feedback_Service SHALL 将对应的 favorite 事件标记为已撤销并从列表中移除。
5. THE 收藏列表 SHALL 支持按主要编程语言进行筛选。

### 需求 10：反馈数据持久化与隐私

**用户故事：** 作为一个开发者用户，我希望我的反馈历史被安全地保存且可由我自己控制，以便在多设备间保持一致的推荐并保护隐私。

#### 验收标准

1. WHEN Feedback_Service 记录一条 Feedback_Event, THE Explorer_System SHALL 将该事件持久化到用户数据存储中。
2. WHERE 用户已登录, THE Explorer_System SHALL 在用户下次在任意设备登录时恢复其 Interest_Profile 与收藏列表。
3. WHEN 用户请求清除历史数据, THE Explorer_System SHALL 删除该用户的全部 Feedback_Event 与 Interest_Profile 数据。
4. THE Explorer_System SHALL 向用户展示一个隐私设置页面，允许用户查看已收集的反馈事件类别。
5. FOR ALL Interest_Profile 对象, 执行 序列化 再 反序列化 SHALL 得到与原对象等价的数据结构（往返属性）。
6. THE Explorer_System SHALL 仅在用户明确同意后将反馈数据上传至云端。

### 需求 11：错误处理与降级

**用户故事：** 作为一个开发者用户，我希望在网络异常或服务故障时仍能获得可用的体验，以便不因偶发问题中断使用。

#### 验收标准

1. IF Explorer_System 在 5 秒内未能获取下一张 Repository_Card 的数据, THEN THE Explorer_System SHALL 展示一个可重试的错误提示。
2. IF Recommendation_Engine 在生成推荐时发生内部错误, THEN THE Feed_Service SHALL 回退到按 GitHub Trending 生成的 Feed。
3. IF GitHub_Adapter 连续三次调用 GitHub API 均失败, THEN THE GitHub_Adapter SHALL 进入熔断状态并在 60 秒内仅从缓存响应请求。
4. WHEN 用户在熔断状态下仍进行正向或负向反馈操作, THE Feedback_Service SHALL 在本地排队保存 Feedback_Event 并在服务恢复后批量上传。
5. IF 本地 Feedback_Event 排队数量超过 1000 条, THEN THE Feedback_Service SHALL 丢弃最旧的 skip 类型事件以释放空间。

## 正确性属性

以下性质应在设计与实现阶段通过基于属性的测试（Property-Based Testing）加以验证：

1. **仓库元数据往返性质（Round-Trip）**：对于任意合法的仓库元数据对象 `r`，`deserialize(serialize(r))` 与 `r` 等价（对应需求 6.7）。
2. **Interest_Profile 往返性质（Round-Trip）**：对于任意 Interest_Profile 对象 `p`，`deserialize(serialize(p))` 与 `p` 等价（对应需求 10.5）。
3. **权重幂等（Idempotence）**：对 Interest_Profile 应用一次 24 小时衰减与连续两次应用同一轮衰减相比，二者之间的差异仅由衰减系数本身决定，而非由应用次数的副作用引入（对应需求 4.5）。
4. **权重边界不变量（Invariant）**：在任意数量的 Feedback_Event 处理之后，Interest_Profile 中每个权重值始终位于区间 `[-10, 10]`（对应需求 4.6）。
5. **去重不变量（Invariant）**：同一仓库在任意 7 天滑动窗口内至多在同一用户的 Feed 中出现一次，除非来自收藏列表的主动打开（对应需求 5.7）。
6. **排序确定性（Invariant）**：给定相同的 Interest_Profile 与 Candidate_Pool，Recommendation_Engine 两次生成的推荐顺序应完全一致（对应需求 5.3、5.4）。
7. **撤销对称性（Metamorphic）**：先记录一条正向 Feedback_Event 再将其撤销，对 Interest_Profile 产生的净影响为零（对应需求 2.7）。
8. **负向反馈单调性（Metamorphic）**：在其他条件不变的情况下，增加一条关于某作者的 not_interested 事件后，该作者在下一批推荐中的期望出现概率不应高于事件记录前（对应需求 3.3、3.5）。
