---
title: "Open Knowledge Format 如何改善数据共享"
originalTitle: "How the Open Knowledge Format can improve data sharing"
date: 2026-06-25
originalUrl: https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/
lang: zh
---

> Sam McVeety —— Tech Lead, Data Analytics, Engineering, Data Cloud, Google Cloud
>
> Amir Hormati —— Tech Lead, BigQuery, Engineering, Data Cloud, Google Cloud

随着基础模型不断进步，缺乏相关上下文往往成为它们能力的瓶颈，在被用来构建智能体（agentic）系统时尤其如此。这些模型虽然可以帮你写代码、总结文档或分析数据集，但它们仍然需要正确的信息，才能产出准确、可落地的结果。

正因如此，我们今天推出 Open Knowledge Format（OKF）——一份开放规范，把 [LLM-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 模式正式固化为一种可移植、可互操作的格式。它是一套厂商中立、对智能体与人类都友好的标准，用于表达现代 AI 系统所需的元数据、上下文与经过整理的知识。

按照发布版本，**OKF v0.1** 把知识表示为一个由带 YAML frontmatter 的 markdown 文件组成的目录，并辅以一小套约定俗成的规范——让不同生产者编写的 wiki 无需翻译即可被不同的智能体消费。

就这么简单。没有复杂的压缩方案，没有新的运行时，也不需要任何 SDK。一组 OKF 文档具备以下特性：

-   **只是 markdown** —— 可在任何编辑器中阅读，可在 GitHub 上渲染，可被任何搜索工具索引

-   **只是文件** —— 可作为 tarball 分发，可托管在任何 git 仓库中，可挂载到任何文件系统上

-   **只是 YAML frontmatter** —— 仅用于那一小部分需要可查询的结构化字段：type、title、description、resource、tags 与 timestamp

如果你用过 Obsidian、Notion、Hugo，或者过去一年里涌现出的任何一种 LLM wiki 模式，这种形态会让你倍感熟悉。OKF 所做的，是把让这些模式之间得以互操作所需的那一小套约定正式确立下来。

下面我们来看看 OKF 能为你的组织解决什么问题、它如何运作、如何上手，以及接下来会怎样。

### 支离破碎的上下文格局

在大多数组织里，基础模型所使用的信息，绝大部分都是内部知识：一张表的 schema、某个指标在你业务语境中的含义、一次事故的处理手册（runbook）、两个系统之间的连接路径（join path）、某个旧 API 的弃用通知，等等。

如今，这些知识的"原子"散落在各种高度割裂的系统中：

-   各有其 API 的元数据目录（catalog）

-   wiki、第三方系统，或共享盘

-   代码注释、docstring，或 notebook 单元格

-   少数几位资深工程师的脑子里

当一个 AI 智能体需要回答"如何从我们的事件流中计算周活跃用户？"时，它必须从这些分散、彼此互不兼容的载体中拼凑出答案。每家厂商都提供自己的目录、自己的 SDK、自己的知识图谱 schema，而这些知识没有一份能轻松地在不同产品或组织之间移植。

结果就是：每一个智能体构建者都在从零重复解决同一个上下文拼装问题，每一个目录厂商都在重新发明同一套数据模型，而知识本身则被锁死在最初创建它的那个载体背后。

### 把知识当作一座活的 wiki

开发团队正在改变构建 AI 智能体的方式。与其反复用模型在相同的文档里搜寻相同的事实，不如给你的智能体一座共享的 markdown 知识库，让它随时间推移越用越有价值。这样一来，智能体可以接手阅读和更新自己文件这类繁琐活儿，而你的团队负责整理内容、像管理代码一样管理它。

著名 AI 研究者与教育者 Andrej Karpathy 在他的 [LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 中，把这个想法表达得最为精炼。"LLM 不会觉得无聊，不会忘记更新某条交叉引用，还能在一次处理中改动 15 个文件，"他写道。那些让人类放弃个人 wiki 的记账式杂活，恰恰是 LLM 所擅长的。

类似的"知识即 wiki"模式正以不同的名字反复出现：接入编码智能体的 [Obsidian vault](https://obsidian.md/help/vault)、AGENTS.md / CLAUDE.md 这一类约定文件、塞满了 index.md 与 log.md 工件（智能体在真正动手前会先查阅）的仓库，以及数据团队内部"元数据即代码（metadata as code）"的仓库。

这种模式既引人入胜又强大，但每一个实例都是定制的。Karpathy 的 wiki、你团队的 wiki、某厂商导出的目录，看起来可能都长得差不多（markdown、frontmatter、交叉链接），但它们没有一个是被刻意设计成能彼此协作的。对于"每份文档应该携带哪些字段"或"什么文件名代表什么含义"，并不存在一个约定俗成的答案。结果，编码进各类 wiki 的知识仍被困在最初的团队内部，每当要构建一个新智能体时，都会带来重复的劳动。

### 缺的是一种格式，而不是又一项服务

这个问题的答案不是再来一项知识服务。你需要的是一种**格式**，一种这样表示知识的方式：

-   任何人都能生产，不需要 SDK

-   任何人都能消费，不需要做集成

-   能在系统、组织与工具之间迁移而不失真

-   与它所描述的代码一起存活在版本控制中

-   既能被人类阅读，又能被智能体解析：同一份文件，没有翻译层

OKF 在设计上正是这样一种格式。

### OKF 如何运作：一屏看懂的设计

一个 OKF **bundle** 是一个由 markdown 文件组成的目录，这些文件表示**概念（concept）**：任何你想要捕捉的东西，包括表、数据集、指标、playbook、runbook 和 API。每个概念对应一个文件。文件路径就是该概念的身份标识：

```
sales/
├── index.md
├── datasets/
│   ├── index.md
│   └── orders_db.md
├── tables/
│   ├── index.md
│   ├── orders.md
│   └── customers.md
└── metrics/
    ├── index.md
    └── weekly_active_users.md
```

每个概念文档都有一小块用于结构化字段的 YAML frontmatter，以及一段用于承载其余一切的 markdown 正文：

```markdown
---
type: BigQuery Table
title: Orders
description: One row per completed customer order.
resource: https://console.cloud.google.com/bigquery?p=acme&d=sales&t=orders
tags: [sales, revenue]
timestamp: 2026-05-28T14:30:00Z
---
# Schema
| Column        | Type      | Description                              |
|---------------|-----------|------------------------------------------|
| `order_id`    | STRING    | Globally unique order identifier.        |
| `customer_id` | STRING    | FK to [customers](/tables/customers.md). |
# Joins
Joined with [customers](/tables/customers.md) on `customer_id`.
```

概念之间用普通的 markdown 链接相互连接，从而把整个目录变成一张**关系图（graph）**——它比文件系统所隐含的父/子链接要丰富得多。bundle 还可以选择性地包含 index.md 文件（用于在智能体浏览层级结构时做渐进式披露）和 log.md 文件（用于记录变更的时间顺序历史）。

完整的 v0.1 规范（包括一致性判定标准、交叉链接规则，以及为数不多的保留文件名）一页纸就能写完。

### 设计背后的三条原则

**1. 极简的主张。** OKF 对每个概念只强制要求一件事：一个 type 字段。其余一切（例如有哪些 type、还要包含哪些字段、正文里有哪些章节）都交给生产者决定。规范定义的是互操作的接口面，而不是内容模型。

**2. 生产者/消费者相互独立。** OKF 把"谁来写知识"和"谁来消费知识"干净地分开。一个由人手工撰写的 bundle 可以被 AI 智能体消费；一个由元数据导出流水线生成的 bundle 可以在可视化工具里浏览；一个由某个 LLM 合成的 bundle 可以被另一个 LLM 查询。格式即契约；两端的工具链则可以各自独立替换。

**3. 是格式，不是平台。** OKF 不与任何特定的云、数据库、模型提供商或智能体框架绑定。它永远不会要求一个专有账号或 SDK 才能读、写或提供服务。我们把它作为开放标准发布，是因为一种知识格式的价值来自于有多少方在"说"它，而不是来自于谁拥有它。

### 我们随规范一并交付的东西

为了让这种格式变得具体，我们在生产端和消费端都发布了**参考实现（reference implementation）**：

-   一个**富化智能体（enrichment agent）**，它会遍历一个 BigQuery 数据集，为每张表和视图起草一份 OKF 概念文档，然后再跑第二轮 LLM——爬取权威文档，并用引用、schema 与连接路径来富化每个概念。

-   一个**静态 HTML 可视化工具**，能把任意 OKF bundle 变成一个交互式图视图，全部装进单个自包含文件里；没有后端，浏览端无需安装，也没有任何数据离开页面。

-   **三套可直接浏览的示例 bundle**：[GA4 电商](https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset)、[Stack Overflow](https://console.cloud.google.com/bigquery?ws=!1m4!1m3!3m2!1sbigquery-public-data!2sstackoverflow) 与 [Bitcoin 公共数据集](https://cloud.google.com/blog/topics/public-datasets/bitcoin-in-bigquery-blockchain-analytics-on-public-data?e=48754805)，由参考智能体生成并提交到仓库中，作为符合 OKF 规范的活样例。

这些都是刻意做成的概念验证（proof of concept）。该智能体演示的只是生产 OKF 的一种方式；格式本身并不要求任何特定的智能体框架或 LLM。该可视化工具演示的只是消费 OKF 的一种方式；格式本身并不要求 HTML 或图视图。我们预期（也希望！）生产者与消费者的生态会远远超出我们已交付的范围。

### 接下来我们走向何方

OKF v0.1 是一个起点，而非一份已完成的标准。随着更多生产者和消费者的出现，以及我们集体逐渐弄清智能体在实践中究竟需要什么样的知识表示，这种格式会不断演进。

我们从第一天起就公开发布，因为唯有如此，一种知识格式才配得上它的名字——无论你是在构建一个知识目录、一条富化流水线、一座面向 AI 智能体定制的 wiki，还是 AI 知识领域里的任何东西。

从这里出发，我们鼓励你：

-   **读一读规范**（它很短！）

-   **写一个生产者**，对接你的源系统、你的数据库、你的文档站点

-   **写一个消费者**：一个查看器、一个搜索索引，或一个能在 bundle 之上进行推理的智能体

-   **拿你自己的数据试一试参考实现**

-   **提 issue、发 PR，或提出扩展提案**：规范带版本管理，并且明确为向后兼容的演进而设计

仓库、规范与示例 bundle 都已发布在 [GitHub](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) 上。我们也已更新 Google Cloud 的 [Knowledge Catalog](https://cloud.google.com/blog/products/data-analytics/introducing-the-google-cloud-knowledge-catalog)，使其能够摄取 Open Knowledge Format 并将其提供给我们的智能体。相关代码与示例可在 [这里](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/toolbox/mdcode/demo) 找到。

真正的贡献是格式本身。我们交付的工具，存在的意义是让它落地为现实，并降低试用它的成本。无论你今天的知识呈现为何种形态，OKF 的设计目标都是成为那门"通用语（lingua franca）"——让知识在明天得以被交换。

---

本文由 Google Cloud Data Cloud 团队发布。Open Knowledge Format 是一份开放规范；我们明确欢迎各类贡献、替代实现，以及在 Google 产品之外的采用。

除作者之外，这项工作还凝结了 Google 内部许多其他人的关键想法，我们感谢他们的贡献。
