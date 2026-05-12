# 需求文档

## 介绍

GitTok 是一款"抖音化"的 GitHub 仓库浏览应用。用户通过上下滑动的沉浸式单卡片信息流浏览 GitHub 仓库，并通过点赞、收藏、关注、"不感兴趣"等交互对推荐结果进行反馈。系统基于用户的历史行为（偏好的编程语言、主题标签、星标数量区间、仓库作者等特征）进行个性化推荐，形成"正反馈增强相似内容、负反馈降权同类内容"的闭环，持续优化推荐精准度。

本需求文档覆盖以下核心能力：

- GitHub 仓库数据获取与缓存
- 沉浸式卡片信息流浏览
- 用户交互反馈（点赞、收藏、关注、不感兴趣、查看详情、跳转）
- 个性化推荐算法（特征提取、评分、排序、多样性控制）
- 用户账户与偏好持久化
- 反馈闭环与冷启动处理

## 术语表

- **GitTok_App**：本应用的整体系统，包含前端、后端、推荐引擎
- **Feed_Service**：信息流服务，负责向客户端分批下发待浏览的仓库卡片
- **Repo_Card**：仓库卡片，单个 GitHub 仓库在信息流中的展示单元，包含仓库名称、作者、描述、主要编程语言、Star 数、Fork 数、主题标签（topics）、README 摘要等字段
- **GitHub_Client**：封装 GitHub REST/GraphQL API 调用、鉴权、限流处理的客户端模块
- **Recommendation_Engine**：推荐引擎，根据用户画像与仓库特征计算推荐评分并排序
- **User_Profile**：用户画像，包含用户偏好的语言、topics、Star 区间、作者、历史交互记录等特征向量
- **Interaction_Event**：用户交互事件，包含类型（like、favorite、follow、not_interested、view、open_external）、对象（仓库/作者）、时间戳、停留时长
- **Favorites_List**：用户的收藏夹，存储被收藏的仓库
- **Follow_List**：用户的关注列表，存储被关注的仓库或作者
- **Negative_Feedback**：负反馈，由"不感兴趣"或显著短于阈值的停留时长产生
- **Positive_Feedback**：正反馈，由点赞、收藏、关注、显著长于阈值的停留时长或跳转 GitHub 产生
- **Cold_Start_Strategy**：冷启动策略，当用户画像不足时用于产生初始推荐的规则
- **Session**：用户一次从打开到关闭 App 之间的连续使用周期

## 需求

### 需求 1：用户账户与登录

**用户故事：** 作为用户，我希望使用 GitHub 账号登录 GitTok，以便系统能够持久化保存我的偏好、收藏和关注。

#### 验收标准

1. WHEN 用户在登录页点击 "使用 GitHub 登录"，THE GitTok_App SHALL 跳转至 GitHub OAuth 授权页面
2. WHEN GitHub OAuth 授权回调返回有效授权码，THE GitTok_App SHALL 使用该授权码换取访问令牌并创建用户会话
3. IF GitHub OAuth 授权回调返回错误或用户取消授权，THEN THE GitTok_App SHALL 显示包含错误原因的提示并返回登录页
4. WHILE 用户处于已登录状态，THE GitTok_App SHALL 在每次应用启动时自动恢复会话，无需用户再次输入凭证
5. WHEN 用户点击"退出登录"，THE GitTok_App SHALL 清除本地会话令牌并返回登录页
6. WHERE 用户未登录，THE GitTok_App SHALL 以匿名模式提供基础信息流浏览，但 SHALL 禁用点赞、收藏、关注功能
7. IF 访问令牌过期或被撤销，THEN THE GitTok_App SHALL 引导用户重新进行 OAuth 授权

### 需求 2：GitHub 仓库数据获取

**用户故事：** 作为用户，我希望浏览到真实、最新的 GitHub 仓库信息，以便基于准确数据判断是否感兴趣。

#### 验收标准

1. WHEN Feed_Service 需要获取候选仓库，THE GitHub_Client SHALL 通过 GitHub 官方 API 拉取仓库数据
2. THE GitHub_Client SHALL 为每个 Repo_Card 获取包含仓库全名、作者、描述、主要编程语言、Star 数、Fork 数、topics、默认分支、最近更新时间字段的数据
3. WHEN Repo_Card 被展示，THE GitTok_App SHALL 额外显示仓库 README 的前 500 个字符作为摘要
4. IF GitHub API 返回 403 且响应头包含 `X-RateLimit-Remaining: 0`，THEN THE GitHub_Client SHALL 停止后续请求，直至 `X-RateLimit-Reset` 指示的时间到达后再恢复
5. IF GitHub API 返回 5xx 错误，THEN THE GitHub_Client SHALL 采用指数退避策略重试，最多重试 3 次，初始间隔 1 秒
6. WHEN 同一仓库在 24 小时内被重复请求，THE GitHub_Client SHALL 从本地缓存返回数据而不再调用 GitHub API
7. IF 获取仓库数据失败且重试已耗尽，THEN THE Feed_Service SHALL 跳过该仓库并记录错误日志

### 需求 3：沉浸式卡片信息流浏览

**用户故事：** 作为用户，我希望像刷抖音一样上下滑动浏览 GitHub 仓库，以便以轻松的方式发现新项目。

#### 验收标准

1. THE GitTok_App SHALL 以全屏单卡片形式展示当前 Repo_Card
2. WHEN 用户在信息流页面执行向上滑动手势，THE GitTok_App SHALL 切换至下一张 Repo_Card
3. WHEN 用户在信息流页面执行向下滑动手势，THE GitTok_App SHALL 切换回上一张 Repo_Card（若存在）
4. WHEN 当前展示的 Repo_Card 在未浏览队列中剩余不超过 3 张，THE Feed_Service SHALL 预加载下一批 Repo_Card
5. WHILE 下一张 Repo_Card 的数据尚未加载完成，THE GitTok_App SHALL 显示加载占位符而不是阻塞界面
6. WHEN 用户在同一张 Repo_Card 上停留时长达到 1 秒及以上，THE GitTok_App SHALL 记录一条带停留时长的浏览型 Interaction_Event
7. IF 用户在同一张 Repo_Card 上的停留时长短于 1 秒即切走，THEN THE GitTok_App SHALL 记录一条带停留时长的"快速跳过"型 Interaction_Event
8. THE Repo_Card SHALL 同时展示仓库名称、作者、语言、Star 数、Fork 数、topics、描述与 README 摘要

### 需求 4：正向交互反馈

**用户故事：** 作为用户，我希望对感兴趣的仓库进行点赞、收藏和关注操作，以便保存它们并向系统表达偏好。

#### 验收标准

1. WHEN 已登录用户在 Repo_Card 上点击"点赞"按钮，THE GitTok_App SHALL 将该仓库标记为已点赞并记录一条 like 类型的 Interaction_Event
2. WHEN 已登录用户再次点击已点赞的 Repo_Card 的"点赞"按钮，THE GitTok_App SHALL 取消点赞状态并记录一条 unlike 类型的 Interaction_Event
3. WHEN 已登录用户在 Repo_Card 上点击"收藏"按钮，THE GitTok_App SHALL 将该仓库加入 Favorites_List 并记录一条 favorite 类型的 Interaction_Event
4. WHEN 已登录用户在 Repo_Card 上点击"关注作者"按钮，THE GitTok_App SHALL 将该仓库的作者加入 Follow_List 并记录一条 follow 类型的 Interaction_Event
5. WHEN 已登录用户点击"在 GitHub 打开"按钮，THE GitTok_App SHALL 在外部浏览器中打开该仓库的 GitHub 页面并记录一条 open_external 类型的 Interaction_Event
6. THE GitTok_App SHALL 在每张 Repo_Card 上显示当前用户对该仓库的点赞、收藏、关注状态
7. IF 用户触发正向交互但本地网络不可用，THEN THE GitTok_App SHALL 将该 Interaction_Event 暂存至本地队列，并在网络恢复后同步至后端
8. WHEN Interaction_Event 同步成功，THE Recommendation_Engine SHALL 将其纳入下一次推荐计算的输入

### 需求 5：负向交互反馈

**用户故事：** 作为用户，我希望对不感兴趣的仓库标记"不感兴趣"，以便减少同类内容的推荐。

#### 验收标准

1. WHEN 用户在 Repo_Card 上点击"不感兴趣"按钮，THE GitTok_App SHALL 记录一条 not_interested 类型的 Interaction_Event 并立即切换到下一张 Repo_Card
2. WHEN not_interested 类型的 Interaction_Event 被记录，THE Recommendation_Engine SHALL 对该仓库的主要编程语言、topics、作者这三类特征进行负向权重调整
3. THE GitTok_App SHALL 在"不感兴趣"按钮被点击后的 7 天内，不再向同一用户推荐同一仓库
4. WHEN 用户对同一作者的仓库累计标记"不感兴趣"达到 3 次，THE Recommendation_Engine SHALL 将该作者的全部仓库降权至推荐评分下限并在 30 天内不主动推荐
5. WHEN 用户对同一 topic 的仓库累计标记"不感兴趣"达到 5 次，THE Recommendation_Engine SHALL 将该 topic 的推荐权重降低至不超过该用户全部 topic 平均权重的 20%
6. IF 用户在 Repo_Card 上的停留时长短于 1 秒，THEN THE Recommendation_Engine SHALL 将该事件视为弱负反馈并对对应特征施加一个低于 not_interested 权重的负向调整

### 需求 6：个性化推荐

**用户故事：** 作为用户，我希望信息流中的仓库越来越贴合我的兴趣，以便高效发现值得关注的项目。

#### 验收标准

1. WHEN Feed_Service 生成下一批 Repo_Card，THE Recommendation_Engine SHALL 基于当前用户的 User_Profile 对候选仓库进行评分与排序后返回
2. THE Recommendation_Engine SHALL 使用包含编程语言偏好、topics 偏好、Star 数区间偏好、作者偏好这四类特征的 User_Profile 进行评分
3. WHEN Positive_Feedback 发生，THE Recommendation_Engine SHALL 提升对应特征在 User_Profile 中的权重
4. WHEN Negative_Feedback 发生，THE Recommendation_Engine SHALL 降低对应特征在 User_Profile 中的权重
5. THE Recommendation_Engine SHALL 在每批下发的 Repo_Card 中保留不低于 20% 的"探索性"仓库，这些仓库的特征不完全匹配当前 User_Profile 的最高权重项
6. WHERE 用户的累计 Interaction_Event 少于 10 条，THE Recommendation_Engine SHALL 使用 Cold_Start_Strategy 生成推荐
7. THE Cold_Start_Strategy SHALL 基于 GitHub 全站近 7 天高 Star 增速仓库与当前热门编程语言生成初始候选集
8. THE Recommendation_Engine SHALL 在单个 Session 内不向同一用户重复下发同一 Repo_Card
9. WHEN User_Profile 中针对某一特征值的权重发生变化，THE Recommendation_Engine SHALL 在下一次生成推荐时使用更新后的权重

### 需求 7：收藏夹与关注列表管理

**用户故事：** 作为用户，我希望查看和管理我收藏的仓库与关注的作者，以便随时回看喜欢的项目。

#### 验收标准

1. THE GitTok_App SHALL 提供一个"收藏夹"页面，展示当前用户 Favorites_List 中的全部仓库
2. THE GitTok_App SHALL 提供一个"关注"页面，展示当前用户 Follow_List 中的全部作者与仓库
3. WHEN 用户在收藏夹页面对某条收藏执行"移除"操作，THE GitTok_App SHALL 将该仓库从 Favorites_List 中删除并记录一条 unfavorite 类型的 Interaction_Event
4. WHEN 用户在关注页面对某个作者执行"取消关注"操作，THE GitTok_App SHALL 将该作者从 Follow_List 中删除并记录一条 unfollow 类型的 Interaction_Event
5. WHEN 用户在收藏夹或关注页面点击某条记录，THE GitTok_App SHALL 跳转至该仓库的 Repo_Card 详情视图
6. THE Favorites_List 与 Follow_List SHALL 按用户操作时间倒序展示

### 需求 8：数据持久化与同步

**用户故事：** 作为用户，我希望我的偏好、收藏、关注在不同设备之间保持一致，以便获得连续的使用体验。

#### 验收标准

1. THE GitTok_App SHALL 将 User_Profile、Favorites_List、Follow_List 与 Interaction_Event 持久化至后端存储
2. WHEN 用户在新设备上使用同一 GitHub 账号登录，THE GitTok_App SHALL 从后端拉取该用户的 User_Profile、Favorites_List、Follow_List
3. IF 本地暂存的 Interaction_Event 与后端已有记录在时间戳与事件类型上均相同，THEN THE GitTok_App SHALL 视为重复事件并丢弃本地副本
4. WHEN 后端成功持久化一条 Interaction_Event，THE GitTok_App SHALL 将本地队列中对应的事件标记为已同步
5. WHILE 用户处于离线状态，THE GitTok_App SHALL 允许继续浏览已缓存的 Repo_Card 并在本地记录 Interaction_Event
6. WHEN 网络从离线恢复至在线，THE GitTok_App SHALL 按事件时间戳升序将本地队列中的 Interaction_Event 批量同步至后端

### 需求 9：推荐解释与透明度

**用户故事：** 作为用户，我希望知道某个仓库为什么被推荐给我，以便理解并信任推荐结果。

#### 验收标准

1. THE Repo_Card SHALL 显示一行"推荐理由"文本，指出触发该推荐的关键特征（如"因为你喜欢 Rust 项目"或"因为你关注了该作者"）
2. WHEN 用户点击"推荐理由"，THE GitTok_App SHALL 展开显示参与评分的主要特征及其对当前推荐的贡献排序
3. THE GitTok_App SHALL 在"设置"页面提供"重置推荐偏好"入口
4. WHEN 用户在"设置"页面确认执行"重置推荐偏好"，THE GitTok_App SHALL 清空当前用户的 User_Profile 中由交互累积得到的权重，并在下一次信息流请求时回退至 Cold_Start_Strategy

### 需求 10：性能与限流

**用户故事：** 作为用户，我希望信息流流畅、不卡顿，以便获得顺滑的浏览体验。

#### 验收标准

1. WHEN 用户触发翻页手势，THE GitTok_App SHALL 在 200 毫秒内完成下一张 Repo_Card 的视图切换
2. WHEN Feed_Service 接收到信息流请求，THE Feed_Service SHALL 在 1 秒内返回不少于 10 张 Repo_Card 的候选集
3. THE GitHub_Client SHALL 将对 GitHub API 的请求速率限制在每分钟不超过 50 次
4. IF 连续 3 次信息流请求均超过 3 秒未返回，THEN THE GitTok_App SHALL 向用户显示"网络缓慢，请稍后重试"的提示
5. THE GitTok_App SHALL 在本地保留最多 100 张最近浏览过的 Repo_Card 数据以支持回看

### 需求 11：内容安全与过滤

**用户故事：** 作为用户，我希望不在信息流中看到已归档、已删除或明显无内容的仓库，以避免浪费浏览时间。

#### 验收标准

1. IF 候选仓库在 GitHub 上被标记为 archived，THEN THE Feed_Service SHALL 将该仓库从本次下发结果中排除
2. IF 候选仓库在 GitHub 上返回 404，THEN THE Feed_Service SHALL 将该仓库从后续候选集合中永久移除
3. IF 候选仓库的 Star 数低于 5 且最近一次提交时间早于 1 年前，THEN THE Feed_Service SHALL 将该仓库从本次下发结果中排除
4. WHERE 用户在"设置"页面启用了"屏蔽 fork 仓库"选项，THE Feed_Service SHALL 将所有 fork 属性为 true 的仓库从下发结果中排除
5. THE GitTok_App SHALL 在"设置"页面允许用户维护一个屏蔽语言列表
6. WHERE 某候选仓库的主要编程语言位于用户屏蔽语言列表中，THE Feed_Service SHALL 将该仓库从下发结果中排除
