# Requirements Document

## Introduction

GitTok 是一款以"抖音式短视频流"交互为核心的 GitHub 仓库发现应用。用户通过上下滑动的方式逐个浏览仓库卡片，每张卡片聚合展示仓库的关键信息（README 摘要、主语言、Star 数、最近活跃度等）。用户可以通过"点赞"、"收藏"、"关注作者"表达兴趣，或通过"减少推荐"表达不感兴趣。系统基于用户交互信号持续优化推荐算法，形成个性化的仓库发现流。

本需求文档聚焦于第一阶段的最小可用功能集：GitHub 账号授权、仓库卡片流浏览、用户交互反馈、GitHub 操作同步（Star/Watch/Follow）、基于反馈的推荐算法，以及基本的个人中心管理能力。

## Glossary

- **GitTok_App**: 本系统的客户端应用（移动端或 Web 端），负责展示仓库卡片流并采集用户交互。
- **Feed_Service**: 推荐流服务，负责生成用户的仓库卡片队列并接收反馈信号。
- **Recommendation_Engine**: 推荐算法模块，根据用户历史交互信号（点赞、收藏、关注、减少推荐、停留时长等）对候选仓库进行打分和排序。
- **GitHub_Integration**: 与 GitHub 官方 API 对接的模块，负责 OAuth 授权、拉取仓库元数据以及同步 Star/Watch/Follow 操作。
- **Card_Renderer**: 仓库卡片渲染模块，负责将仓库元数据组装为单张可滑动卡片。
- **Interaction_Logger**: 交互日志模块，记录用户对每张卡片的行为事件。
- **Repo_Card**: 单张仓库卡片，是 Feed 流中的最小展示单元，包含一个 GitHub 仓库的摘要信息。
- **Feed_Queue**: 当前用户待浏览的仓库卡片有序队列。
- **README_Summary**: 仓库 README 文件经摘要处理后的短文本，长度不超过 500 字符。
- **Activity_Score**: 最近活跃度评分，由近 90 天内的提交数、PR 数和 Issue 数综合计算得出的 0 到 100 的整数。
- **Interest_Signal**: 正向兴趣信号，包括点赞、收藏、关注作者、完整阅读 README、停留超过 5 秒等事件。
- **Disinterest_Signal**: 负向兴趣信号，包括点击"减少推荐"、停留不足 1 秒即划走等事件。
- **Dislike_Action**: 用户在卡片上点击"减少推荐"按钮的行为。

## Requirements

### Requirement 1: GitHub 账号授权

**User Story:** 作为新用户，我希望使用自己的 GitHub 账号登录 GitTok_App，以便让系统基于我的 GitHub 身份同步 Star、Watch、Follow 等操作。

#### Acceptance Criteria

1. WHEN 用户在登录页点击"使用 GitHub 登录"按钮, THE GitTok_App SHALL 跳转至 GitHub OAuth 授权页面。
2. WHEN 用户在 GitHub OAuth 页面完成授权并返回, THE GitHub_Integration SHALL 使用返回的授权码换取访问令牌并将其加密存储。
3. IF GitHub OAuth 授权失败或用户拒绝授权, THEN THE GitTok_App SHALL 返回登录页、将授权结果状态置为对应的失败类型（如"用户拒绝"、"网络错误"、"令牌交换失败"），并展示对应的失败原因。
4. WHEN 用户成功登录, THE GitTok_App SHALL 在 2 秒内跳转至 Feed 流主页并展示首批仓库卡片。
5. WHILE 访问令牌有效, THE GitHub_Integration SHALL 使用该令牌调用 GitHub API 执行需要授权的操作。
6. IF 访问令牌过期或失效, THEN THE GitHub_Integration SHALL 引导用户重新授权并暂停所有需要授权的操作。

### Requirement 2: 仓库卡片信息展示

**User Story:** 作为浏览者，我希望在每张卡片上快速看到仓库的核心信息，以便在几秒内判断是否对该仓库感兴趣。

#### Acceptance Criteria

1. THE Card_Renderer SHALL 在每张 Repo_Card 上展示以下字段：仓库全名（owner/name）、主编程语言、Star 数、Fork 数、README_Summary、Activity_Score、最近一次提交时间。
2. WHEN 仓库存在 README 文件, THE Card_Renderer SHALL 展示 README_Summary，且 README_Summary 长度不超过 500 字符。
3. IF 仓库不存在 README 文件或 README 为空, THEN THE Card_Renderer SHALL 在摘要区域展示"暂无 README 描述"提示文本。
4. WHEN 仓库主语言字段缺失, THE Card_Renderer SHALL 在语言区域展示"未知语言"。
5. THE Card_Renderer SHALL 在 Star 数和 Fork 数超过 1000 时以"1.2k"格式展示，超过 1000000 时以"1.2M"格式展示。
6. WHEN 用户查看一张 Repo_Card（无论是首次还是重复查看）, THE Card_Renderer SHALL 在 300 毫秒内完成首屏内容渲染。

### Requirement 3: 上下滑动浏览仓库卡片

**User Story:** 作为浏览者，我希望通过上下滑动切换不同的仓库卡片，以便获得类似短视频的沉浸式浏览体验。

#### Acceptance Criteria

1. WHEN 用户在 Feed 流页面执行向上滑动手势, THE GitTok_App SHALL 切换到 Feed_Queue 中的下一张 Repo_Card。
2. WHEN 用户在 Feed 流页面执行向下滑动手势, THE GitTok_App SHALL 切换到 Feed_Queue 中的上一张 Repo_Card。
3. THE GitTok_App SHALL 每次仅在屏幕上完整展示一张 Repo_Card。
4. WHEN 用户滑动至 Feed_Queue 中剩余卡片少于 3 张时, THE Feed_Service SHALL 向 Feed_Queue 追加新的 Repo_Card，并保证追加成功后 Feed_Queue 末尾实际新增至少 10 张新的 Repo_Card。
5. IF Feed_Service 因网络错误无法追加新卡片, THEN THE GitTok_App SHALL 在当前卡片底部展示"加载失败，点击重试"提示。
6. WHEN 用户在当前卡片停留时间达到 1 秒, THE Interaction_Logger SHALL 记录一条包含用户 ID、仓库 ID、停留开始时间、停留时长的浏览事件。

### Requirement 4: 正向兴趣反馈（点赞、收藏、关注）

**User Story:** 作为感兴趣的浏览者，我希望对喜欢的仓库进行点赞、收藏和关注作者，以便后续再次查看并让推荐算法推送更多类似仓库。

#### Acceptance Criteria

1. WHEN 用户在当前 Repo_Card 上点击"点赞"按钮, THE Interaction_Logger SHALL 记录一条 Interest_Signal 事件，事件类型为 like。
2. WHEN 用户在当前 Repo_Card 上点击"收藏"按钮, THE GitHub_Integration SHALL 在 2 秒内对该仓库执行 GitHub Star 操作。
3. WHEN GitHub_Integration 成功完成 Star 操作, THE GitTok_App SHALL 将该仓库加入用户的本地收藏列表并将收藏按钮置为高亮状态。
4. IF GitHub Star 操作因 API 错误失败, THEN THE GitTok_App SHALL 回滚在 API 失败检测前产生的任何局部 UI 更新，并展示"收藏失败，请稍后重试"提示，将按钮保持为未收藏状态。
5. WHEN 用户在当前 Repo_Card 上点击"关注作者"按钮, THE GitHub_Integration SHALL 在 2 秒内对仓库作者执行 GitHub Follow 操作。
6. WHEN 用户再次点击已点赞、已收藏或已关注的按钮, THE GitTok_App SHALL 针对该按钮对应的操作类型同时撤销本地状态与对应的 GitHub 同步状态（Star 或 Follow）。
7. WHERE 用户在一张 Repo_Card 上完整浏览 README_Summary 且停留超过 5 秒, THE Interaction_Logger SHALL 额外记录一条事件类型为 deep_view 的 Interest_Signal。

### Requirement 5: 负向兴趣反馈（减少推荐）

**User Story:** 作为不感兴趣的浏览者，我希望标记某张卡片为"减少推荐"，以便推荐算法减少同类仓库的推送。

#### Acceptance Criteria

1. WHEN 用户在当前 Repo_Card 上点击"减少推荐"按钮, THE Interaction_Logger SHALL 记录一条 Disinterest_Signal 事件，事件类型为 dislike，并附带仓库 ID、主语言、作者、话题标签。
2. WHEN Interaction_Logger 成功记录 dislike 事件, THE GitTok_App SHALL 在 500 毫秒内自动切换到下一张 Repo_Card。
3. WHEN 用户对某仓库执行"减少推荐", THE Feed_Service SHALL 尝试从当前 Feed_Queue 中移除同一仓库的所有剩余卡片。
4. IF Feed_Service 因服务暂不可用无法完成移除, THEN THE Feed_Service SHALL 将移除请求加入重试队列，并在服务恢复后按请求时间顺序重试。
5. WHEN 用户对某仓库执行"减少推荐", THE Recommendation_Engine SHALL 在未来 30 天内不再向该用户推送相同仓库。
6. WHEN 用户在 1 秒内连续对 3 张及以上的 Repo_Card 向上滑动, THE Interaction_Logger SHALL 为每张停留时长不足 1 秒且未触发任何 Interest_Signal 的卡片独立记录一条事件类型为 quick_skip 的 Disinterest_Signal，同一序列内其他卡片是否产生 Interest_Signal 不影响该记录。

### Requirement 6: 基于反馈的推荐算法

**User Story:** 作为持续使用的用户，我希望系统根据我过往的互动持续调整推荐内容，以便 Feed 流越来越贴合我的兴趣。

#### Acceptance Criteria

1. THE Recommendation_Engine SHALL 基于用户历史的 Interest_Signal 和 Disinterest_Signal 为每个候选仓库计算 0 到 1 的兴趣匹配分。
2. THE Recommendation_Engine SHALL 在计算兴趣匹配分时综合考虑以下维度：编程语言、话题标签、作者、Star 数量级、Activity_Score。
3. WHEN Feed_Service 生成新的 Feed_Queue, THE Recommendation_Engine SHALL 按兴趣匹配分从高到低排序候选仓库，并取前 20 个作为结果。
4. WHERE 用户的兴趣匹配分最高维度为某一编程语言, THE Recommendation_Engine SHALL 在每 10 张 Repo_Card 中至少保证 5 张属于该语言。
5. THE Recommendation_Engine SHALL 在每 10 张 Repo_Card 中预留至少 2 张为探索型卡片，探索型卡片的兴趣匹配分不作为排序依据。
6. WHEN 用户累计交互事件数少于或等于 20 条, THE Recommendation_Engine SHALL 使用基于 GitHub Trending 的默认排序策略生成 Feed_Queue。
7. IF Recommendation_Engine 因计算错误无法给出匹配分, THEN THE Feed_Service SHALL 回退到 GitHub Trending 默认排序策略生成 Feed_Queue。

### Requirement 7: 个人中心与收藏管理

**User Story:** 作为已登录用户，我希望在个人中心查看并管理我点赞过和收藏过的仓库，以便随时回到这些仓库继续了解。

#### Acceptance Criteria

1. WHEN 用户在主界面点击"个人中心"入口, THE GitTok_App SHALL 跳转至个人中心页并展示用户头像、用户名、收藏数、关注作者数。
2. THE GitTok_App SHALL 在个人中心提供"我的收藏"、"我的点赞"、"关注的作者"三个列表入口。
3. WHEN 用户点击"我的收藏"列表中的某个仓库, THE GitTok_App SHALL 跳转至该仓库的详情页。
4. WHEN 用户在"我的收藏"列表中对任一仓库执行取消收藏操作（无论该仓库最初是在 GitTok_App 内还是在 GitHub 外部被 Star）, THE GitHub_Integration SHALL 同步取消该仓库的 GitHub Star 状态。
5. WHEN 用户在个人中心点击"退出登录", THE GitTok_App SHALL 强制退出当前会话并返回登录页，同时尝试清除本地访问令牌、收藏缓存和交互日志缓存；即便清除过程失败，仍需完成退出登录并在日志中记录清除失败信息。

### Requirement 8: 交互事件埋点与反馈闭环

**User Story:** 作为产品运营方，我希望系统完整记录用户交互事件，以便推荐算法持续优化并支撑后续的数据分析。

#### Acceptance Criteria

1. THE Interaction_Logger SHALL 为每个用户交互事件记录以下字段：用户 ID、仓库 ID、事件类型、事件时间戳、客户端版本。
2. WHEN Interaction_Logger 产生一条事件, THE Interaction_Logger SHALL 在 3 秒内将事件上报至 Feed_Service。
3. IF 某条实际产生的用户交互事件在上报时因网络错误失败, THEN THE Interaction_Logger SHALL 将该事件缓存在本地并在网络恢复后按时间顺序补报；无实际交互事件发生时不进行任何缓存。
4. THE Interaction_Logger SHALL 在本地最多缓存 1000 条未上报事件，超过上限时按时间顺序丢弃最早的事件并记录丢弃日志。
5. WHEN Feed_Service 接收到新的交互事件, THE Feed_Service SHALL 在 10 秒内将事件特征更新至 Recommendation_Engine 的用户画像。

### Requirement 9: 数据隐私与授权范围

**User Story:** 作为重视隐私的用户，我希望清楚知晓 GitTok_App 会访问哪些 GitHub 数据，以便放心授权使用。

#### Acceptance Criteria

1. WHEN 用户首次进入 GitHub OAuth 授权流程, THE GitTok_App SHALL 在跳转前展示明确的授权范围说明，说明至少包含读取公开仓库信息、读取用户资料、修改 Star 状态、修改 Follow 状态四项。
2. THE GitHub_Integration SHALL 仅请求与上述说明一致的 OAuth scope，不得请求额外权限。
3. WHEN 用户在个人中心点击"撤销授权", THE GitTok_App SHALL 调用 GitHub API 撤销访问令牌并删除本地存储的所有用户数据。
4. THE GitTok_App SHALL 在隐私政策页说明 Interaction_Logger 所收集的事件类型、存储时长与使用目的。
5. WHERE 用户未完成 GitHub 授权, THE GitTok_App SHALL 允许用户浏览基于 GitHub Trending 的匿名 Feed_Queue，并禁用点赞、收藏、关注、减少推荐功能。
6. WHERE 用户已完成 GitHub 授权, THE GitTok_App SHALL 同时提供个性化 Feed_Queue 入口与匿名 GitHub Trending Feed 入口，允许用户在两者之间自由切换。
7. IF 系统无法提供匿名 GitHub Trending Feed, THEN THE GitTok_App SHALL 允许用户继续浏览并保留点赞、收藏、关注、减少推荐等交互功能。
