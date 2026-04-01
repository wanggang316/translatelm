---
title: "Harness Engineering：在大模型原生的世界中利用 Codex"
originalTitle: "Harness engineering: leveraging Codex in an agent-first world"
date: 2026-04-01
originalUrl: https://openai.com/index/harness-engineering
lang: zh
---

过去的五个月，我们团队一直在做一个实验：用 **0 行手动编写的代码**构建并发布一个软件的内部 beta 版。

这个产品有每日内部用户和外部 alpha 测试者。它会发布、部署、出问题、然后被修复。不同的是，代码的每一行——应用逻辑、测试、CI 配置、文档、可观测性工具、内部工具——都是 Codex 写的。我们估计，用这种方式构建这个产品只花了手写代码所需时间的约 1/10。

**人类掌舵。Agents 执行。**

我们有意选择了这个约束条件，这样我们就必须构建那些能将工程速度提升数量级的必要基础设施。我们有几周时间要交付最终达百万行代码的产品。要做到这一点，我们需要理解：当一个软件工程团队的主要工作不再是写代码，而是设计环境、明确意图、构建反馈循环来让 Codex Agents 完成可靠的工作时，什么会发生变化。

这篇文章是关于我们用一支 agent 团队构建一个全新产品的经验——什么坏了、什么加剧了、以及如何最大化我们唯一真正稀缺的资源：人类的时间和注意力。

## 我们从一个空的 git 仓库开始

对一个空仓库的第一次提交发生在 2025 年 8 月底。

初始脚手架——仓库结构、CI 配置、格式化规则、包管理器设置和应用框架——由 Codex CLI 使用 GPT‑5 生成，由一组现有的模板指导。甚至指导 agents 如何在仓库中工作的初始 AGENTS.md 文件本身也是由 Codex 编写的。

没有预先存在的、由人类编写的代码来锚定系统。从一开始，仓库就由 agent 塑造。

五个月后，仓库包含了约百万行代码，涵盖应用逻辑、基础设施、工具、文档和内部开发者工具。在此期间，大约 1500 个 pull requests 被打开并合并，而驱动 Codex 的只有三名工程师。这意味着每位工程师每天平均吞吐量 3.5 个 PR，而且随着团队扩展到现在的七名工程师，这个吞吐量竟然还在**提升**。重要的是，这不是为了产出而产出：该产品已被数百名内部用户使用，包括每日活跃的内部高级用户。

在整个开发过程中，人类从未直接贡献过任何代码。这成为了团队的核心哲学：**不手动写代码**。

## 重新定义工程师的角色

缺乏亲自动手的编码**引入了一种不同类型的工程工作，专注于系统、脚手架和杠杆效应**。

早期进展比我们预期的慢，不是因为 Codex 无能，而是因为环境描述不足。Agent 缺乏在高级目标方向上取得进展所需的工具、抽象和内部结构。我们工程团队的主要工作变成了让 agents 能够做有用的工作。

在实践中，这意味着深度优先工作：将更大的目标分解为更小的构建块（设计、代码、审查、测试等），提示 agent 构建这些块，然后用它们解锁更复杂的任务。当某件事失败时，修复方法几乎从来不是"再试试"。因为取得进展的唯一方法是让 Codex 完成工作，所以人类工程师总是深入任务问自己："缺少什么能力，我们如何让它对 agent 既清晰又可执行？"

人类与系统的交互几乎完全通过 prompts：工程师描述一个任务，运行 agent，然后让它打开一个 pull request。为了推动一个 PR 完成，我们指导 Codex 在本地审查自己的更改，在本地和云端都请求额外的特定 agent 审查，响应任何来自人类或 agent 的反馈，并在一个循环中迭代，直到所有 agent 审查者都满意（实际上这就是一个 [Ralph Wiggum Loop⁠(opens in a new window)](https://ghuntley.com/loop/)）。Codex 直接使用我们的标准开发工具（gh、本地脚本和仓库嵌入的 skills）来收集上下文，而无需人类复制粘贴到 CLI。

人类可以审查 pull requests，但并非必须。随着时间推移，我们已将几乎所有审查工作推向了 agent 对 agent 处理。

## 提高应用的可读性

随着代码吞吐量增加，我们的瓶颈变成了人类 QA 能力。由于固定约束一直是人类的时间和注意力，我们通过让应用的 UI、日志和应用指标本身对 Codex 直接可读，来为 agent 添加更多能力。

例如，我们使应用能够按 git worktree 启动，这样 Codex 就能为每个更改启动并驱动一个实例。我们还将 Chrome DevTools Protocol 接入 agent 运行时，并创建了用于处理 DOM 快照、截图和导航的 skills。这使得 Codex 能够复现 bug、验证修复、并直接推理 UI 行为。

![Diagram titled "Codex drives the app with Chrome DevTools MCP to validate its work." Codex selects a target, snapshots the state before and after triggering a UI path, observes runtime events via Chrome DevTools, applies fixes, restarts, and loops re-running validation until the app is clean.](https://images.ctfassets.net/kftzwdyauwt9/1Gu58eNlqDEuITmbqJDmq9/1e2e62f7e15fb16d2da0da5407240564/fig_1__codex_drives_the_app_.png?w=3840&q=90&fm=webp)

我们对可观测性工具也做了同样的处理。日志、指标和 traces 通过一个本地可观测性堆栈暴露给 Codex，该堆栈对于任何给定 worktree 都是临时的。Codex 在该应用的一个完全隔离的版本上工作——包括其日志和指标，这些在任务完成后会被拆除。Agents 可以使用 LogQL 查询日志，使用 PromQL 查询指标。有了这个上下文，像"确保服务启动在 800ms 内完成"或"这四个关键用户旅程中的 span 都不超过两秒"这样的 prompts 就变得可处理了。

![Diagram titled "Giving Codex a full observability stack in local dev." An app sends logs, metrics, and traces to Vector, which fans out data to an observability stack containing Victoria Logs, Metrics, and Traces, each queried via LogQL, PromQL, or TraceQL APIs. Codex uses these signals to query, correlate, and reason, then implements fixes in the codebase, restarts the app, re-runs workloads, tests UI journeys, and repeats in a feedback loop.](https://images.ctfassets.net/kftzwdyauwt9/4Xr18TZ5G4Bh8zIgsTFIVK/f7ae689ddd8c31664e39d809b0973425/OAI_Harness_engineering_Giving_Codex_a_full_observability_stack_desktop-light__1_.svg?w=3840&q=90)

我们经常看到单个 Codex 运行在单个任务上工作超过六个小时（通常是在人类睡觉的时候）。

## 我们让仓库知识成为系统中的正式记录

上下文管理是在大型复杂任务中让 agents 有效的最大挑战之一。我们最早学到的教训很简单：**给 Codex 一张地图，而不是一本 1000 页的说明书。**

我们尝试过"一个大 AGENTS.md"的方法。它以可预见的方式失败了：

- **上下文是一种稀缺资源。**一个巨大的指令文件挤占了任务、代码和相关文档——所以 agent 要么错过关键约束，要么开始为错误的约束优化。
- **太多的指导变成了** ***无指导****。**当一切都"重要"时，就没有重要的了。Agents 最终会在本地进行模式匹配而不是有意识地导航。
- **它立即腐烂。**一个整体手册变成了过时规则的坟墓。Agents 无法判断什么仍然是对的，人类停止维护它，而这个文件悄悄地成为一个有吸引力的麻烦。
- **它难以验证。**一个单独的庞然大物不适合机械检查（覆盖率、新鲜度、所有权、交叉链接），所以漂移是不可避免的。

所以我们不把 AGENTS.md 当作百科全书，而是把它当作**目录**。

仓库的知识库存在于一个结构化的 docs/ 目录中，被视为正式记录。一份简短的 AGENTS.md（约 100 行）被注入上下文，主要作为地图，指向其他地方更深的真实来源。

#### Plain Text

```snippet
AGENTS.md
ARCHITECTURE.md
docs/
├── design-docs/
│ ├── index.md
│ ├── core-beliefs.md
│ └── ...
├── exec-plans/
│ ├── active/
│ ├── completed/
│ └── tech-debt-tracker.md
├── generated/
│ └── db-schema.md
├── product-specs/
│ ├── index.md
│ ├── new-user-onboarding.md
│ └── ...
├── references/
│ ├── design-system-reference-llms.txt
│ ├── nixpacks-llms.txt
│ ├── uv-llms.txt
│ └── ...
├── DESIGN.md
├── FRONTEND.md
├── PLANS.md
├── PRODUCT_SENSE.md
├── QUALITY_SCORE.md
├── RELIABILITY.md
└── SECURITY.md
```

仓库内知识存储布局。

设计文档被编目和索引，包括验证状态和定义 agent 优先操作原则的核心信念。[架构文档⁠(opens in a new window)](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html)提供了域和包层级的顶层地图。一份质量文档对每个产品域和架构层级进行评分，并跟踪随时间推移的差距。

计划被视为一等公民。临时的轻量计划用于小更改，而复杂工作被捕获到带有进度和决策日志的执行计划中，这些日志被 check in 到仓库。活跃计划、已完成计划和已知技术债务都被版本化并放在一起，允许 agents 在不依赖外部上下文的情况下操作。

这实现了**渐进式披露**：agents 从一个小的、稳定的入口开始，被教导下一步去哪里，而不是一开始就不知所措。

我们通过机械方式强制执行此操作。专门的 linters 和 CI 作业验证知识库是最新的、交叉链接的且结构正确的。一个 recurring 的"文档园丁"agent 扫描过时或过时的文档（不反映真实代码行为）并打开修复 pull requests。

## Agent 可读性是目标

随着代码库的演变，Codex 的设计决策框架也需要演变。

因为仓库完全是 agent 生成的，它首先为 **Codex 的可读性**优化。就像团队旨在提高新工程师入职时代码的可导航性一样，我们人类工程师的目标是让 agent 能够**直接从仓库本身**推理整个业务领域。

从 agent 的角度来看，任何在运行时无法在上下文中访问的东西实际上都不存在。存在于 Google Docs、聊天话题或人们脑海中的知识对系统是不可访问的。仓库本地的、版本化的产物（如代码、markdown、schemas、可执行计划）是它所能看到的全部。

![Diagram titled "The limits of agent knowledge: What Codex can't see doesn't exist." Codex's knowledge is shown as a bounded bubble. Below it are examples of unseen knowledge—Google Docs, Slack messages, and tacit human knowledge. Arrows indicate that to make this information visible to Codex, it must be encoded into the codebase as markdown.](https://images.ctfassets.net/kftzwdyauwt9/7uWHsJIC6o3uQPsnQ2Avz9/8be3e321892054bd215afb2b250a176a/OAI_Harness_engineering_The_limits_of_agent_knowledge_desktop-light.png?w=3840&q=90&fm=webp)

我们了解到，随着时间推移，我们需要将越来越多的上下文推入仓库。那个让团队在架构模式上达成一致的 Slack 讨论？如果 agent 无法发现它，它就如同一个三个月后入职的新人不知道一样不可读。

给 Codex 更多上下文意味着组织和暴露正确的信息，以便 agent 能够对其进行推理，而不是用临时指令将其淹没。就像你会向新队友介绍产品原则、工程规范和团队文化（包括 emoji 偏好）一样，给 agent 这些信息会带来更好对齐的输出。

这个框架澄清了许多权衡。我们倾向于可以被完全内化并在仓库内推理的依赖和抽象。通常被称为"无聊"的技术对 agents 来说更容易建模，因为它们的可组合性、API 稳定性以及在训练集中的代表性。在某些情况下，让 agent 重新实现功能子集比围绕公共库的 opaque 上游行为工作更便宜。例如，我们没有引入通用的 `p-limit` 风格包，而是实现了我��自己的 map-with-concurrency helper：它与我们的 OpenTelemetry 仪器紧密集成，有 100% 的测试覆盖率，并且行为与我们的运行时预期完全一致。

将更多系统拉入 agent 可以检查、验证和直接修改的形式会增加杠杆效应——不仅对 Codex，对其他在代码库上工作的 agents（如 [Aardvark](https://openai.com/index/introducing-aardvark/)）也是如此。

## 强制执行架构和品味

仅靠文档无法保持完全由 agent 生成的代码库一致。**通过强制不变量而不是微观管理实现，我们让 agents 能够快速发布而不损害基础。**例如，我们要求 Codex [在边界解析数据形状⁠(opens in a new window)](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)，但不规定这如何发生（模型似乎喜欢 Zod，但我们没有指定那个特定的库）。

Agents 在具有严格边界和可预测结构的环境中最为有效，所以我们围绕一个严格的架构模型构建应用。每个业务域被划分为一组固定的层级，具有严格验证的依赖方向和有限数量的允许边。这些约束通过自定义 linters（当然是 Codex 生成的！）和结构测试机械地强制执行。

下图显示了该规则：在每个业务域内（如应用设置），代码只能"向前"依赖一组固定的层级（Types → Config → Repo → Service → Runtime → UI）。横切关注点（auth、连接器、遥测、功能开关）通过一个单一的显式接口进入：Providers。其他一切都被禁止并机械地强制执行。

![Diagram titled "Layered domain architecture with explicit cross-cutting boundaries." Inside the business logic domain are modules: Types → Config → Repo, and Providers → Service → Runtime → UI, with App Wiring + UI at the bottom. A Utils module sits outside the boundary and feeds into Providers.](https://images.ctfassets.net/kftzwdyauwt9/4Rlip1H3T9apPlSmWs7Wr8/7708c176bfbe11951e06ad8e2b83bf01/OAI_Harness_engineering_Layered_domain_architecture_with_explicit_cross-cutting_boundries_desktop-light.png?w=3840&q=90&fm=webp)

这是一种你通常会推迟到有数百名工程师时才做的架构。有了 coding agents，这就是早期的先决条件：约束是允许快速前进而不衰减或架构漂移的东西。

在实践中，我们通过自定义 linters 和结构测试以及一小套"品味不变量"来强制执行这些规则。例如，我们静态强制执行结构化日志、schemas 和类型的命名约定、文件大小限制，以及具有自定义 lint 的平台特定可靠性要求。因为 lints 是自定义的，我们编写错误消息是为了将修复指令注入 agent 上下文。

在人类优先的工作流中，这些规则可能看起来迂腐或约束性。对于 agents，它们变成了乘数：一旦编码，它们立即应用于所有地方。

同时，我们明确指出约束在哪里重要在哪里不重要。这类似于领导一个大型工程平台组织：在中心强制执行边界，在本地允许自主。你深刻关心边界、正确性和可重复性。在这些边界内，你允许团队——或 agents——在表达解决方案方面有显著的灵活性。

结果代码并不总是符合人类风格偏好，这没关系。只要输出是正确的、可维护的、对未来 agent 运行可读的，它就达到了标准。

人类品味被持续反馈到系统中。审查评论、重构 pull requests 和面向用户的 bug 被捕获为文档更新或直接编码到工具中。当文档不足时，我们将规则提升为代码。

## 吞吐量改变了合并哲学

随着 Codex 的吞吐量增加，许多传统工程规范变得适得其反。

仓库以最小的阻塞合并门控运作。Pull requests 存活期很短。测试 flaky 通常通过后续运行来解决，而不是无限期地阻塞进度。在一个 agent 吞吐量远远超过人类注意力的系统中，修正很便宜，等待很昂贵。

在低吞吐量环境中这是不负责任的。在这里，这通常是正确的权衡。

## "Agent 生成"实际意味着什么

当我们说代码库是由 Codex agents 生成的，我们意思是代码库中的所有东西。

Agents 生产：

- 产品代码和测试
- CI 配置和发布工具
- 内部开发者工具
- 文档和设计历史
- 评估工具
- 审查评论和响应
- 管理仓库本身的脚本
- 生产 dashboard 定义文件

人类始终保持在循环中，但工作在一个与以往不同的抽象层级上。我们优先排序工作，将用户反馈转化为验收标准，并验证结果。当 agent 努力时，我们将其视为信号：识别缺少什么——工具、护栏、文档——然后通过让 Codex 本身编写修复来将其反馈到仓库中。

Agents 直接使用我们的标准开发工具。它们拉取审查反馈，内联响应，推送更新，并且经常自行 squash 和合并它们的 pull requests。

## 提高自主性层级

随着更多开发循环被直接编码到系统中——测试、验证、审查、反馈处理和恢复——仓库最近跨越了一个有意义的门槛：Codex 可以端到端驱动一个新功能。

给定一个单一的 prompt，agent 现在可以：

- 验证代码库的当前状态
- 复现报告的 bug
- 录制展示失败的视频
- 实现修复
- 通过驱动应用验证修复
- 录制展示解决的第二个视频
- 打开一个 pull request
- 响应 agent 和人类反馈
- 检测并修复构建失败
- 仅在需要判断时才上报给人类
- 合并更改

这种行为高度依赖于这个仓库的特定结构和工具，不应假设它在没有类似投入的情况下可以推广——至少目前还不行。

## 熵和垃圾回收

**完全 agent 自主也引入了新问题。** Codex 复制仓库中已存在的模式——即使是 uneven 或次优的。随着时间推移，这不可避免地导致漂移。

最初，人类手动处理这个问题。我们的团队过去每周五（20% 的工作时间）都花在清理"AI slop"上。不出所料，这无法扩展。

相反，我们开始将我们所谓的"黄金原则"直接编码到仓库中，并建立了一个 recurring 的清理过程。这些原则是有主见的、机械的规则，保持代码库对未来 agent 运行的可读性和一致性。例如：（1）我们更喜欢共享工具包而不是手写的 helpers，以保持不变量集中；（2）我们不会 YOLO 式地探测数据——我们验证边界或依赖类型化 SDK，这样 agent 就不会在猜测的形状上意外构建。定期地，我们有一组后台 Codex 任务扫描偏差、更新质量评分，并打开有针对性的重构 pull requests。这些大多数可以在不到一分钟内审查完并自动合并。

这就像垃圾回收。技术债务就像高息贷款：几乎总是以小增量持续偿还比让它复合并痛苦地一次性处理更好。人类品味被捕获一次，然后持续地在每行代码上强制执行。这也让我们能够每天捕捉并解决不良模式，而不是让它们在代码库中传播数天或数周。

## 我们仍在学习的

到目前为止，这个策略在 OpenAI 的内部发布和采用方面运作良好。为真实用户构建真实产品帮助我们将投资锚定在现实中，并引导我们走向长期可维护性。

我们还不知道在完全由 agent 生成的系统中，架构一致性如何在数年内演变。我们仍在学习人类判断在哪里增加最多的杠杆，以及如何编码这些判断使其复合。我们也不知道这个系统随着模型在时间推移中继续变得更加有能力将如何演变。

越来越清楚的是：构建软件仍然需要纪律，但纪律更多地体现在脚手架而不是代码中。保持代码库一致的 tooling、抽象和反馈循环越来越重要。

**我们最困难的挑战现在集中在设计环境、反馈循环和控制系统上**，帮助 agents 实现我们的目标：大规模构建和维护复杂、可靠的软件。

随着像 Codex 这样的 agents 承担软件生命周期中更大的部分，这些问题将变得更加重要。我们希望分享一些早期经验教训能帮助你推理在哪里投入你的努力，这样[你就可以只管构建东西](https://openai.com/codex/)。
