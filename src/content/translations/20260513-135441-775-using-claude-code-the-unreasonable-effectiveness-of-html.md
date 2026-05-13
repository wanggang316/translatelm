---
title: "在 Claude Code 中使用 HTML：一种被低估的高效格式"
originalTitle: "Using Claude Code: The Unreasonable Effectiveness of HTML"
date: 2026-05-13
originalUrl: https://x.com/trq212/status/2052809885763747935
lang: zh
---

Markdown 已经成为 agent 与我们交流时占主导地位的文件格式。它简单、可移植、具备一定的富文本表达能力，而且便于人工编辑。Claude 甚至在 Markdown 文件中使用 ASCII 绘制图表方面也表现得出奇地好。

但随着 agent 越来越强大，我感到 Markdown 开始成为一种限制。我发现自己很难读完一份超过一百行的 Markdown 文件。我希望看到更丰富的可视化、颜色和图表，也希望能够轻松地把它们分享出去。

我也越来越少自己去编辑这些文件，更多是把它们当作 spec、参考文件、头脑风暴的产物等。即使要修改，我通常也是让 Claude 来改，这就抹掉了 Markdown 原本最大的优势之一。

我开始更偏好用 HTML 作为输出格式，而不是 Markdown。我也越来越多地看到 Claude Code 团队的其他成员也在这么做。原因就在下面。

（如果你想先看一些例子，可以从这里开始：[https://thariqs.github.io/html-effectiveness](https://thariqs.github.io/html-effectiveness/)，看完别忘了回来读一下背后的原因）

# 为什么选 HTML？

## **信息密度**

![](https://pbs.twimg.com/media/HHz_q48aAAAaCfW.jpg)

与 Markdown 相比，HTML 能承载丰富得多的信息。它当然可以表达像标题和格式这样的简单文档结构，但还可以表达各种其他形式的信息，比如：

-   用 table 表达表格数据
-   用 CSS 表达设计数据
-   用 SVG 表达插图
-   用 script 标签表达代码片段
-   用 HTML 元素配合 javascript + CSS 表达交互
-   用 SVG 和 HTML 表达工作流
-   用绝对定位和 canvas 表达空间数据
-   用 image 标签表达图片

我甚至想说，几乎不存在 Claude 能读懂、却无法用 HTML 较高效表达的信息。这使得 HTML 成为模型向你传达深度信息、以及你回看这些信息的高效媒介。

我发现，当模型没法这样表达时，它就会在 Markdown 里做一些低效的事，比如画 ASCII 图，或者——我最喜欢的——用 unicode 字符去“估计”颜色，就像下面这张 Claude Code 的截图一样。

![](https://pbs.twimg.com/media/HH0CDc6a8AAy1bv.png)

## **视觉清晰度与阅读舒适度**

![](https://pbs.twimg.com/media/HH0AgqJbcAAaEcZ.jpg)

随着 Claude 能完成更复杂的工作，它写出来的 spec 和方案也越来越长。在实际工作中，我发现自己很少真正读完一份超过 100 行的 Markdown 文件，也基本没法让团队里的其他人读完。

但 HTML 文档读起来就轻松很多。Claude 可以在视觉层面组织结构，用 tab、插图、链接等让导航变得顺手。它甚至可以做成响应式的，让你在不同屏幕尺寸下都能舒服地阅读。

## **易于分享**

Markdown 文件相对不好分享，因为大多数浏览器并不原生地渲染它。你常常得把它当作附件加进邮件或消息里。

而 HTML 只要把文件上传到某个地方（比如 S3），就能把链接发出去。同事可以在任何想看的地方打开它，轻松引用。

如果你的 spec、报告或者 PR 说明是 HTML 格式，别人真的去读它的概率会高得多。

## **双向交互**

![](https://pbs.twimg.com/media/HH0Ao0tbYAAOF9e.jpg)

HTML 可以让你与文档本身交互。比如你可以让它加一些 slider 或旋钮来调整设计，或者让你在算法里调不同选项看看效果。你甚至可以让它把这些改动复制成一段 prompt，再粘贴回 Claude Code 里。

更多双向交互的例子可以看我之前那篇 playgrounds 的文章：[https://x.com/trq212/status/2017024445244924382](https://x.com/trq212/status/2017024445244924382)

**数据摄取**

为什么要用 Claude Code 来生成 HTML 文件，而不是用 ClaudeAI 或 Claude Design 之类？最重要的原因之一，是 Claude Code 能摄取的上下文非常丰富。

举个例子，写这篇文章时，我让 Claude Code 翻了一遍我的代码目录，找出我之前生成的所有 HTML 文件，按类型分组归类，然后做出一份包含每一类对应示意图的 HTML 文件。你在本文里看到的那些图，就是这样直接生成的。

除了本地文件系统，Claude Code 还可以通过你的各种 MCP（比如 Slack、Linear 等）、你的浏览器（配合 Claude in Chrome）、你的 git 历史等渠道获取更多上下文。

## **它令人愉悦**

用 Claude 来生成 HTML 文档本身就更有趣，让我对创造过程更投入、参与感更强——光这一点就已经足够。

## 如何开始

我有点担心，有人读完这篇文章会把它做成一个 `/html` skill 之类的东西。这可能有一定价值，但我想强调的是：让 Claude 这么做，其实并不需要做太多事情。你只要让它“做一个 HTML 文件”或者“做一个 HTML artifact”就行。

关键在于你知道自己想让这个 artifact 做什么，以及你打算怎么用它。随着时间推移，你或许会沉淀出一个 skill，但现在我更建议从零开始 prompt，先在不同场景里把感觉摸出来。

# 使用场景

为了让这件事更具体，我已经针对不同场景做了大量 HTML 文件。你可以在这里看全部：[https://thariqs.github.io/html-effectiveness/](https://thariqs.github.io/html-effectiveness/)，下面是一份概览。

## Spec、规划与探索

HTML 是一块丰富的画布，方便 Claude 深入一个问题。我在开始处理某个问题时，不再期待一份简单的 Markdown 计划，而是会做出一张由多份 HTML 文件组成的网。比如，我可能先让 Claude Code 头脑风暴并对不同方案做一些探索；然后让它对其中某个方向展开，做出 mockup 或代码片段；最后等我感觉差不多了，再让它写一份实现计划。等我对计划满意之后，我会开一个新的会话，把所有这些文件传进去让它去实现。

在做验证时，我也会让验证 agent 把这些文件读进去，这样它对所需上下文的把握会全面得多。

![](https://pbs.twimg.com/media/HH0BFWLbMAEk_7T.jpg)

**示例 prompt：**

-   我还拿不准 onboarding 界面该往哪个方向走。请生成 6 个明显不同的方案——在布局、风格和密度上都做出区分——把它们排成网格放进同一份 HTML 文件，方便我并排对比。每个方案标注它在做的取舍。
-   写一份完整的实现计划，放到一份 HTML 文件里。务必加上一些 mockup、展示数据流，以及我可能想看的关键代码片段。整体要易读、易消化。

**使用场景：**

-   探索代码里某件事的不同实现方式
-   探索多种视觉设计

## 代码评审与理解

代码在 Markdown 文件里往往不太好读。但用 HTML，我们可以渲染 diff、批注、流程图、模块等。可以用它来理解 agent 写的代码、做 code review，或者向 review 你 PR 的同事解释代码。我发现这通常比默认的 Github diff 视图更好用，现在我每个 PR 都会附上一份 HTML 代码讲解。

![](https://pbs.twimg.com/media/HH0BRSQbMAAuuof.png)

**示例 prompt：**

帮我 review 这个 PR：做一份 HTML artifact 来描述它。我对其中 streaming / 反压相关的逻辑不太熟，请重点讲那部分。请把实际 diff 渲染出来，在边距上加 inline 批注，按严重程度对发现的问题做颜色编码，必要时再加上其他能更好传达概念的元素。

**使用场景：**

-   创建 PR
-   评审 PR
-   理解代码中的某个主题

## 设计与原型

Claude Design 基于 HTML，因为 HTML 在设计表达方面极其有力，即使你最终要交付的不是 HTML。Claude 可以先用 HTML 把设计画出来，再把它转写成你想要的语言，比如 React、Swift 等。

你也可以用它来做交互的原型，比如动画、动作等。可以让 Claude 加上 slider、旋钮等，把你想要的效果一点一点调出来。

![](https://pbs.twimg.com/media/HH0BXqjboAAHGsw.jpg)

**示例 prompt：**

我想给一个新的 checkout 按钮做原型：点击时先播放一段动画，然后快速变成紫色。请做一个 HTML 文件，提供若干 slider 和选项，让我能尝试不同的动画参数，最后给我一个复制按钮，把效果好的那组参数复制出来。

**适合用来做：**

-   生成设计系统相关的 artifact
-   调整组件
-   可视化组件库
-   为令人愉悦的动画做原型

## 报告、研究与学习

Claude Code 非常擅长跨多个数据源整合信息，并把它整理成可读性很好的报告。你可以让 Claude 去搜你的 Slack、代码库、git 历史、互联网等等，再用这些信息给你自己、你的 leadership、你的团队等生成阅读体验极佳的报告。

形式上可以是一份较长的 HTML 文档、一个可交互的讲解页，甚至是幻灯片/演示文稿。让 Claude 用 SVG 画图，能帮你把内容可视化。

举个例子，为了我那几篇关于 prompt caching 的文章，我让 Claude 在读完 git 历史之后，针对 prompt caching 的所有改动准备了一份深度研究的 HTML 文件，给我自己阅读。

![](https://pbs.twimg.com/media/HH0Bp86bUAAJDyZ.jpg)

**示例 prompt：**
我没搞懂我们的限流器到底是怎么工作的。请读一下相关代码，做出一份 HTML 讲解页：包含一张 token-bucket 流程图、3–4 段带批注的关键代码片段，以及底部一节“gotchas”。整体优化目标是让人一次就能读懂。

**适合用来做：**

-   总结某个功能是怎么工作的
-   向我解释一个概念
-   给老板的周报
-   给 leadership 的事故复盘
-   SVG 插图、流程图、技术示意图等

# 自制编辑界面

有时候，你想要的东西很难只靠一个文本框描述清楚。这种情况下，我会让 Claude 给我搭一个用完即弃的编辑器，就为我当前手头这件事服务——不是产品，也不是通用工具，而是一份纯粹为这一份数据而生的 HTML 文件。

诀窍是：最后一定要留一个导出按钮，比如“复制为 JSON”或“复制为 prompt”，把我在 UI 里做的事情转回成可以粘贴回 Claude Code 的内容。

![](https://pbs.twimg.com/media/HH0FbKebUAAsRPr.jpg)

**示例 prompt：**

-   我要把这 30 条 Linear 工单重新排优先级。请给我一个 HTML 文件，把每条工单做成可在 Now / Next / Later / Cut 四列之间拖拽的卡片。先按你的最佳猜测预排好。再加一个“复制为 Markdown”按钮，把最终的排序导出，并为每一列附上一行简短理由。
-   这是我们的 feature flag 配置。请基于表单做一个编辑器：按区域分组，展示 flag 之间的依赖关系；当我打开一个其前置 flag 仍处于关闭状态的 flag 时，给我警告。再加一个“复制 diff”按钮，只输出有改动的 key。
-   我在调一段 system prompt。请做一个左右并排的编辑器：左边是可编辑的 prompt，变量插槽高亮显示；右边是三组示例输入，会实时渲染填充后的模板。再加上字符 / token 计数器和一个复制按钮。

**适合用来做：**

-   对任何东西做重新排序、分流或归桶（工单、测试用例、反馈）
-   编辑带约束的结构化配置（feature flag、环境变量、JSON / YAML）
-   带实时预览地调 prompt、模板或文案
-   整理数据集，批准 / 拒绝某些行，给样例打标签，再把选择导出来
-   对文档、转写或 diff 做批注，并把批注导出
-   选取那些用文本表达很痛苦的值：颜色、缓动曲线、裁切区域、cron 时刻表、正则表达式

## 常见问题

我已经把“我已经转向 HTML”这件事告诉了很多人，有几个问题被反复问到。

**这样不是更不节省 token 吗？**
Markdown 通常确实用的 token 更少，但我发现 HTML 多出来的表达力，再加上我读它的概率高得多，整体反而能让我得到更好的产出。在 Opus 4.7 的 1MM 上下文窗口下，多出来的那点 token 占比在上下文里基本感觉不到。

**那现在你什么时候还会用 markdown？**
说实话，对几乎所有事情我都不再用 markdown 了，但我大概本来就站在 HTML 极端主义那一头。

**怎么查看 HTML 文件？**
我一般就直接在本地浏览器里打开（可以让 Claude 帮你打开），或者上传到 S3 拿一个可分享的链接。

**这样生成不是比 markdown 慢吗？**
确实更慢！HTML 可能要花 markdown 的 2–4 倍时间，但我觉得结果值得。

**版本管理怎么办？**
老实说，这是 HTML 最大的劣势之一：HTML 的 diff 噪声大，相对 Markdown 难以 review。

**怎么让 Claude 的风格符合我的审美 / 别做得很丑？**
frontend design 插件能帮 Claude 把 HTML 文件做得更好看。如果想贴合你们公司自己的风格，可以让 Claude 阅读你们的代码库，从中提炼出一份单一的 design system HTML 文件。之后做其他 HTML 文件时，把它作为参考文件即可。

## 保持在循环之中

以上所有内容归结为一句话：我用 HTML 的真正原因，是因为我感觉自己更深地处在与 Claude 协作的循环里。我曾经担心，自己不再深入阅读计划，意味着只能任由 Claude 自己做决定。

但事实是，我反而觉得自己比以前任何时候都更在循环之中。希望你也会有同样的体会。
