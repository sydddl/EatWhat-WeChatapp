# 是啊吃什么 (EatWhat)

一个给固定饭搭子使用的微信小程序：大家一起维护餐厅池，用偏好代币和加权概率抽出今天吃什么，再把最终结果沉淀到历史记录里。

项目名“是啊吃什么”来自《新三国》的梗。App 头像和抽卡音效也延续了这个玩梗方向：看起来是在严肃决策，实际是在用抽卡仪式回答每天最难的问题。

## 界面预览

> 截图占位：把小程序截图放到 `docs/screenshots/` 后替换下面路径即可。

| 首页与小组 | 餐厅池 | 抽卡仪式 |
| --- | --- | --- |
| ![首页截图](docs/screenshots/home.png) | ![餐厅池截图](docs/screenshots/restaurants.png) | ![抽卡页截图](docs/screenshots/draw.png) |

| 历史记录 | 概率设置 | 成员资料 |
| --- | --- | --- |
| ![历史页截图](docs/screenshots/history.png) | ![概率设置截图](docs/screenshots/probability.png) | ![成员页截图](docs/screenshots/members.png) |

## 功能概览

### 固定饭搭子小组

- 创建、加入、切换和退出固定小组。
- 分享路径携带 `groupId`，群成员从分享卡片进入同一个小组。
- 最后一名成员退出时，小组自动解散。
- 首页展示当前小组、成员头像、餐厅数量和最近小组。

### 成员资料

- 小组成员列表。
- 昵称和头像设置。
- 抽卡投票状态展示。
- 头像通过微信 `chooseAvatar` 选择后上传到云存储。

### 餐厅池管理

- 查看、添加、编辑、启用和禁用餐厅。
- 支持价格、位置、标签、基础权重、备注和来源链接。
- 禁用餐厅会保留在列表中，但不会参与抽卡。
- 支持餐厅池导出和导入，方便在小组之间迁移配置。

### 大众点评分享解析

- 添加餐厅时可以粘贴大众点评分享文本。
- 本地启发式解析店名、地址或位置文本、来源链接。
- 不接入大众点评 API。

### 抽卡与投票

- 按标签、价格、位置筛选候选餐厅。
- 一轮抽出多个候选，成员可以投票或弃权。
- 结束本轮后，最终结果写入历史。
- 预览抽卡不会触发“最近吃过”惩罚，只有最终确认会写入记录。
- 抽卡时播放本地音效：`assets/audio/draw.mp3`。

### 偏好与概率

- 每个用户在一个小组内有 2 个加值代币和 2 个减值代币。
- 同一个用户在同一家餐厅最多放 1 个代币。
- 代币全组可见，并影响抽卡概率。
- 概率设置支持调整加值、减值、最近吃过惩罚、惩罚窗口和 softmax 温度。
- 抽卡结果展示最终概率和触发因素，例如基础权重、偏好代币、最近吃过惩罚。

### 历史统计

- 月历视图展示确认吃过的记录。
- 展开日期可查看当天记录。
- 展示餐厅出现频次排行。
- 历史记录保存餐厅快照，后续编辑餐厅不会改掉旧结果。

## 概率模型

候选餐厅先经过筛选，再计算得分：

```text
score_i = ln(baseWeight_i) + sum(delta_i)
P_i = exp(score_i / T) / sum(exp(score_j / T))
```

默认参数：

- 加值偏好代币：`+0.5`
- 减值偏好代币：`-0.5`
- 最近吃过惩罚：`-2`
- 最近吃过窗口：`2` 天
- Softmax 温度：`1`

概率设置页会预览单项参数变化在 2、5、10、20、50 个候选餐厅下的概率影响。

## 云开发资源

### 数据库集合

在微信云开发中创建以下集合：

- `groups`
- `members`
- `restaurants`
- `draws`
- `preferenceTokens`
- `drawSessions`

### 云函数

当前实现的云函数：

- `createGroup`
- `joinGroup`
- `leaveGroup`
- `updateMemberProfile`
- `addRestaurant`
- `listRestaurants`
- `drawRestaurant`
- `drawSessionAction`
- `listDraws`
- `listMyGroups`
- `setPreferenceToken`
- `getProbabilityConfig`
- `updateProbabilityConfig`
- `exportRestaurantPool`
- `importRestaurantPool`

每个云函数目录都有独立的 `package.json`。在微信开发者工具中，需要为变更过的函数安装依赖并上传。

## 分享路径

分享路径会携带小组 ID：

```text
/pages/index/index?groupId=<groupId>
```

从微信群分享卡片进入时，小程序会调用 `joinGroup` 并进入同一个小组。

## 本地开发

1. 用微信开发者工具打开本目录。
2. 启用云开发，并确认 `cloudfunctionRoot` 为 `cloudfunctions/`。
3. 创建上面列出的数据库集合。
4. 为 `cloudfunctions/*` 中需要部署的函数安装依赖并上传。
5. 编译运行小程序。

可选的 TypeScript 检查：

```bash
npm install
npm run typecheck
```

## 备注

- 项目主要面向固定小组长期使用，不是一次性随机转盘。
- 白色页面保持干净轻量；抽卡页保留更强的仪式感样式。
- 如果历史页提示云函数不存在，优先检查 `listDraws` 是否已经上传。
