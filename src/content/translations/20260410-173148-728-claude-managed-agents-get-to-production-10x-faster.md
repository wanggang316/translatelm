---
title: "Claude Managed Agents：让生产部署速度提升 10 倍"
originalTitle: "Claude Managed Agents: get to production 10x faster"
date: 2026-04-10
originalUrl: https://claude.com/blog/claude-managed-agents
lang: zh
---

今天，我们正式发布 Claude Managed Agents，这是一套可组合的 API，用于构建和部署云端托管的 AI Agent，并支持规模化运行。

在此之前，构建 Agent 意味着要耗费大量开发周期在安全基础设施、状态管理、权限控制，以及为每一次模型升级重新设计 Agent 循环上。Managed Agents 将针对性能调优的 Agent 工具链与生产级基础设施相结合，让从原型到上线的时间从数月缩短到数天。

无论你构建的是单一任务执行器还是复杂的多 Agent 管道，都可以专注于用户体验，而无需操心运维负担。

Managed Agents 已在 Claude Platform 上以公开测试版的形式正式发布。

## 构建和部署 Agent 速度提升 10 倍

要将一个生产级 Agent 交付使用，需要沙箱代码执行、检查点（checkpoint）管理、凭证管理、细粒度权限控制以及端到端追踪。这些在用户看到任何成果之前就需要数月的基础设施工作。

Managed Agents 处理了这些复杂性。你只需定义 Agent 的任务、工具和防护栏，其余由我们在我们的基础设施上运行。内置的编排工具链负责决定何时调用工具、如何管理上下文以及如何从错误中恢复。

<figure style="padding-bottom:56.206088992974244%" class="w-richtext-align-fullwidth w-richtext-figure-type-video"><div><iframe src="https://www.youtube.com/embed/I1BvAHOsjBU" title="Introducing Claude Managed Agents" scrolling="no" frameborder="0" allowfullscreen="true"></iframe></div></figure>

Managed Agents 包含：

- **生产级 Agent**——安全沙箱、身份验证和工具执行均由平台处理。
- **长时间运行的会话**——可自主运行数小时，即使在断连情况下进度和输出也会持久保存。
- **多 Agent 协调**——Agent 可以并行启动并指挥其他 Agent 来分解复杂工作（处于 *研究预览* 阶段，可在此申请访问）。
- **可信治理**——为 Agent 配备真实系统的访问权限，包含细粒度权限控制、身份管理和执行追踪。

![](https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/69d53a1b570fa207204f0111_Claude-Blog-Managed-Agents-Diagram-NoBorder.png)

*Claude Managed Agents 架构图*

## 为充分利用 Claude 而设计

Claude 模型本身是为 Agent 工作而构建的。Managed Agents 专为 Claude 度身打造，用更少的精力就能获得更好的 Agent 效果。

使用 Managed Agents，你只需定义结果和成功标准，Claude 就会自我评估并迭代直到达成目标（处于 *研究预览* 阶段，可在此申请访问）。它也支持传统的提示-响应工作流，当你需要更精确的控制时可以使用。

在内部测试中，围绕结构化文件生成的任务，Managed Agents 将目标任务的完成率比标准提示循环提高了最多 10 个百分点，其中最难的问题提升最为显著。

会话追踪、集成分析和故障排查指导直接内置于 Claude Console 中，你可以检查每一次工具调用、决策和失败模式。

## 团队正在用它构建什么

已有多个团队通过 Managed Agents 将生产级 Agent 快速交付，部署速度提升 10 倍。编码 Agent 可以阅读代码库、规划修复方案并提交 PR；生产力 Agent 可以加入项目、领取任务并与团队其他成员协作交付工作；财务和法律 Agent 可以处理文档并提取关键信息。在每个案例中，几天内完成交付意味着更快地为用户创造价值。

<figure style="padding-bottom:75%" class="w-richtext-align-fullwidth w-richtext-figure-type-video"><div><iframe src="https://www.youtube.com/embed/45hPRdfDEsI" title="How Notion built with Claude Managed Agents" scrolling="no" frameborder="0" allowfullscreen="true"></iframe></div></figure>

- [**Notion**](https://claude.com/customers/notion-qa) 让团队可以直接在工作空间中向 Claude 分配任务（目前在 Notion Custom Agents 私人预览版中可用）。工程师用它来交付代码，知识工作者用它来生成网站和演示文稿。数十个任务可以并行运行，整个团队共同协作产出。
- [**Rakuten**](https://claude.com/customers/rakuten-qa) 在产品、销售、营销和财务领域部署了企业级 Agent，无缝接入 Slack 和 Teams，员工可以直接分配任务并获得电子表格、幻灯片和应用程序等交付物。每个专业 Agent 在一周内就完成了部署。
- [**Asana**](https://claude.com/customers/asana-qa) 构建了 AI Teammates——可以与 Asana 项目中的人类协同工作的协作式 AI Agent，承担任务并起草交付物。团队借助 Managed Agents 以惊人的速度添加高级功能。
- [**Vibecode**](https://claude.com/customers/vibecode) 帮助客户从提示词到已部署应用，使用 Managed Agents 作为默认集成方式，驱动新一代 AI 原生应用。用户现在可以至少 10 倍的速度启动相同的基础设施。
- [**Sentry**](https://claude.com/customers/sentry) 将 Seer（他们的调试 Agent）与一个能编写补丁并提交 PR 的 Claude 驱动的 Agent 配对，让开发者从发现 bug 到收到可审查的修复方案只需一个流程。集成在 Managed Agents 上几周就完成了交付，而原本需要数月。

- [**Atlassian**](https://claude.com/customers/atlassian) 帮助企业在人类和 Agent 之间协调工作。借助 Claude Managed Agents，他们可以在几周内将面向开发者的 Agent 构建到团队已在使用的 Jira 工作流中，客户可以直接从 Jira 分配任务。Managed Agents 处理了沙箱、会话和细粒度权限等复杂部分，工程师可以将更多时间花在构建功能上而非基础设施上。

- [**General Legal**](https://claude.com/customers/general-legal) 构建了一个系统，可以从用户的文档和往来通信中提取信息，回答用户提出的任何问题——即使我们没有为该数据构建特定的检索工具。借助 Managed Agents，Agent 可以随时编写任何需要的工具，将开发时间缩短 10 倍，从而专注于用户体验和接入更多数据源。

- [**Blockit**](https://claude.com/customers/blockit) 使用 Claude Managed Agents 将会议准备 Agent 的构建速度提升了 3 倍，从想法到交付只用了几天。Agent 在会议前研究每位参与者，找出推动对话进展的关键信息。定制工具让我们可以接入自己的日历和联系人数据，MCP 使连接外部系统（如会议记录工具、CRM 等）变得简单，而托管工具链处理了沙箱执行和内置搜索等重活，让我们专注于构建产品而非基础设施。

## 开始使用

Managed Agents 按用量计费。标准 Claude Platform token 费率适用，活跃运行时另加 $0.08/会话小时。完整定价信息请参阅[文档](https://platform.claude.com/docs/en/about-claude/pricing#claude-managed-agents-pricing)。

Managed Agents 现已在 Claude Platform 上可用。阅读我们的[文档](https://platform.claude.com/docs/en/managed-agents/overview)了解更多，访问 [Claude Console](https://platform.claude.com/workspaces/default/agent-quickstart)，或使用新的 CLI 部署你的第一个 Agent。

开发者也可以使用最新版本的 Claude Code 和内置的 claude-api Skill 来构建 Managed Agents。只需说"start onboarding for managed agents in Claude API"即可开始。
