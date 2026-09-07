---
title: "Agent Harness Engineering：模型之外的工程"
originalTitle: "Agent Harness Engineering"
date: 2026-04-19
originalUrl: https://addyosmani.com/blog/agent-harness-engineering/
lang: zh
---

*一个 coding agent，就是模型加上你围绕它搭建的一切。Harness engineering 把这层脚手架当作真正的工件来对待，而且每当 Agent 出一次错，它就收紧一格。*

---

粗略地说：每当你发现 Agent 犯了一个错，你就花时间设计一个解决方案，让 Agent 再也不会犯同样的错。

过去两年我们一直在争论模型。哪个最聪明，哪个写的 React 最干净，哪个幻觉更少。这场讨论本身没问题，但它漏掉了系统的另一半。模型只是一个运行中的 Agent 的一个输入。其余的部分是 *harness*：包裹在模型周围的 prompt、工具、上下文策略、hooks、沙箱、subagent、反馈回路和恢复路径，正是它们让模型真正能把一件事做完。

**一个不错的模型配上一个出色的 harness，胜过一个出色的模型配上一个糟糕的 harness。** 我在自己的工作中一次又一次地看到这一点。而且越来越多地，有意思的工程不在于挑选模型，而在于设计围绕它的脚手架。

这门学问现在有了名字。Viv Trivedy 创造了 *harness engineering* 这个术语，他的[《Anatomy of an Agent Harness》](https://x.com/Vtrivedy10/status/2031408954517971368)一文是对 harness 到底是什么、每一部分为何存在最清晰的推导。[Dex Horthy](https://x.com/dexhorthy/status/1985699548153467120) 一直在追踪这个模式的浮现。[HumanLayer](https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents) 把大多数 Agent 失败归结为“skill issue”（技能问题），根源在配置而不是模型权重。[Anthropic 的工程团队](https://www.anthropic.com/engineering/harness-design-long-running-apps)发表了我认为是公开资料中关于如何为长时间运行的工作设计 harness 的最佳拆解。而 [Birgitta Böckeler](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html) 从使用者的视角给出了一个很好的概览。

这篇文章是我把这些线索汇拢到一起的尝试。

---

## Harness 到底是什么？

Viv 的一句话已经说明了大半：

> Agent = Model + Harness。如果你不是模型，那你就是 harness。

Harness 是除模型本身之外的每一段代码、每一项配置和每一条执行逻辑。一个裸模型不是 Agent。只有当 harness 赋予它状态、工具执行、反馈回路和可强制执行的约束之后，它才成为 Agent。

![Agent harness 的解剖图。模型位于中央；harness 环绕着它，提供上下文注入、控制流、行动、持久化和观测。](https://addyosmani.com/assets/images/harness-anatomy.jpeg)

具体来说，一个 harness 包括：

- System prompt、`CLAUDE.md`、`AGENTS.md`、skill 文件和 subagent prompt
- 工具、skill、MCP server 及其描述
- 捆绑的基础设施（文件系统、沙箱、浏览器）
- 编排逻辑（spawn subagent、交接、模型路由）
- 用于确定性执行的 hooks 和中间件（compaction、续跑、lint 检查）
- 可观测性（日志、trace、成本与延迟计量）

[Simon Willison](https://simonwillison.net/2025/Sep/30/designing-agentic-loops/) 把循环这部分归结到本质：Agent 就是一个*“在循环中运行工具以达成目标”*的系统。功夫在于工具和循环两者的设计。

如果这听起来涉及面很大，那确实如此。而且这是*你的*涉及面，不是模型供应商的。Claude Code、Cursor、Codex、Aider、Cline：这些全都是 harness。**底下的模型有时是同一个，但你体验到的行为，主要由 harness 做了什么决定。**

```
coding agent = AI model(s) + harness
```

这个由 Viv 提出、HumanLayer 附和的等式，就是工作真正发生的地方。关于左边的争论很响亮。而大部分真正的杠杆都在右边。

---

## “skill issue” 的重新定义

我看到工程师们常常陷入一种模式。Agent 做了件蠢事，工程师怪模型，然后这笔账被归档到“等下一个版本”里。

Harness engineering 的思维方式拒绝这种默认。失败通常是可读的。Agent 不知道某条约定，那你就把它加进 `AGENTS.md`。Agent 跑了一条破坏性命令，那你就加一个 hook 拦住它。Agent 在一个 40 步的任务里迷了路，那你就把它拆成一个 planner 和一个 executor。Agent 不停地把坏掉的代码当作“完成”，那你就把 typecheck 的反压（back-pressure）信号接进循环里。

HumanLayer 说：*“这不是模型问题。这是配置问题。”* 当你认真对待这句话，得到的就是 harness engineering。

Viv 的文章和 HumanLayer 的文章里都出现了一个惊人的数据点。在 Terminal Bench 2.0 上，在 Claude Code 里运行的 Claude Opus 4.6，得分远低于同一个模型在一个定制 harness 里的表现。Viv 的团队只改 harness，就把一个 coding agent 从前 30 名推进到了前 5 名。模型在后训练阶段会与它被训练时所用的 harness 耦合在一起。把它们挪进一个不同的 harness，配上更适合你代码库的工具、更紧凑的 prompt 和更锐利的反压，能解锁原 harness 白白丢在地上的能力。

这与“等 GPT-6 就好了”的叙事截然相反。**今天的模型能做到什么，和你看到它们做到了什么，二者之间的差距，很大程度上是 harness 的差距。**

---

## 棘轮：每个错误都变成一条规则

Harness engineering 里最重要的习惯，是把 Agent 的错误当作永久的信号。不是拿来笑一笑的一次性故事，也不是重试一下就好的“坏运行”。是信号。

如果 Agent 提交了一个带着被注释掉的测试的 PR，而我不小心合并了它，那就是一个输入。我的 `AGENTS.md` 的下一个版本会写上“绝不注释掉测试；要么删掉，要么修好”。我的 pre-commit hook 的下一个版本会在 diff 里 grep `.skip(` 和 `xit(`。我的 reviewer subagent 的下一个版本会把被注释掉的测试标为阻塞项。

只有当你见过一次真实的失败时，才添加约束。只有当一个足够强的模型让它变得多余时，才移除它。**一份好的 `AGENTS.md` 里的每一行，都应该能追溯到某件具体出过的错。**

这也是为什么 harness engineering 是一门学问而不是一个框架。适合你代码库的 harness，由你的失败史塑造。你下载不到它。

---

## 从行为倒推

在我真正设计 harness 时，Viv 的框架里最有用的一点是：从你想要的行为出发，推导出能交付这个行为的 harness 组件。他的模式是：*我们想要（或想修复）的行为 → 帮助模型达成它的 harness 设计。*

![每一项 harness 特性都源自一种模型自身无法交付的行为。“持久地处理真实数据”对应文件系统和 git。“编写并执行代码”对应 bash 和代码执行。“安全执行加默认配置”对应沙箱环境和工具链。“记住新知识”对应记忆文件、网页搜索和 MCP。“长上下文下的性能”对应 compaction、工具卸载和 skill。“长程工作”对应 Ralph loop、规划和验证。](https://addyosmani.com/assets/images/harness-behavior-mapping.jpeg)

这样推导的好处是，每一个 harness 组件都有一个具体的职责。**如果你说不出一个组件是为了交付哪种行为而存在，它多半就不该在那里。**

本节剩下的部分大致按 Viv 的顺序过一遍各个组件，附上我认为值得偷师的具体模式。

### 文件系统与 Git：持久状态

文件系统是最基础的原语，也因为它太无聊而往往被低估。模型只能直接操作放得进上下文的东西。没有文件系统，你就是在往聊天窗口里复制粘贴，那不是一个工作流。

一旦有了文件系统，Agent 就有了一个读取数据、代码和文档的工作区；一个卸载中间成果而不必攥在上下文里的地方；以及一个多个 Agent 和人类可以通过共享文件协作的界面。再叠上 Git，你就免费获得了版本管理，Agent 可以跟踪进度、回滚错误、分支实验。

其他大多数 harness 原语最终都会为了某件事指向文件系统。

### Bash 与代码执行：通用工具

如今主要的 Agent 循环是一个 ReAct 循环：模型推理，通过工具调用采取行动，观察结果，然后重复。但 harness 只能执行它有逻辑支持的工具。你可以试着为每一种可能的行动预先构建一个工具，或者，你可以给 Agent 一个 bash，让它随用随造自己需要的工具。

Willison 对此的看法是，Agent 本来就擅长 shell 命令；大多数任务最终都能收敛成几条精心挑选的 CLI 调用。Harness 仍然会提供专用工具，但 bash 加代码执行已经成为自主解决问题的默认通用策略。这就是教人使用一件厨房小家电和直接把整个厨房交给他的区别。

### 沙箱与默认工具链

Bash 只有在一个安全的地方运行才有用。在你的笔记本上运行 Agent 生成的代码是有风险的，而且单个本地环境也无法扩展到许多并行的 Agent。

沙箱为 Agent 提供一个隔离的运行环境。Harness 不在本地执行，而是连接到一个沙箱去运行代码、检查文件、安装依赖、验证工作。你可以对命令设白名单、强制网络隔离、按需启动新环境，并在任务完成后销毁它们。

一个好的沙箱自带好的默认配置：预装的语言运行时和包、Git 和测试 CLI、用于网页交互的 headless 浏览器。浏览器、日志、截图和测试运行器，正是让 Agent 观察自己的工作、闭合自我验证回路的东西。

模型不会配置自己的执行环境。决定 Agent 在哪里运行、有什么可用、如何验证输出，这些全都是 harness 层面的决策。

### 记忆与搜索：持续学习

模型除了权重和当前上下文里的内容之外没有任何额外知识。在无法修改权重的情况下，添加知识的唯一途径就是上下文注入。

文件系统再次成为原语。Harness 支持像 `AGENTS.md` 这样的记忆文件标准，每次启动时注入。当 Agent 编辑这个文件时，harness 会重新加载它，于是一个会话里的知识就带到了下一个会话。这是一种粗糙但有效的持续学习。

对于训练时还不存在的知识（新的库版本、当前的文档、今天的数据），网页搜索和 Context7 这样的 MCP 工具可以弥合知识截止点。这些原语值得直接内置进 harness，而不是留给用户去操心。

### 对抗 context rot

Context rot（上下文腐化）指的是：随着上下文窗口被填满，模型的推理和完成任务的能力会变差。上下文是稀缺的，而 harness 在很大程度上就是良好 context engineering 的交付机制。

有三种技术反复出现：

**Compaction。** 当窗口接近满载时，总得有所取舍。让 API 报错对生产级 harness 来说不是选项，所以 harness 会智能地总结并卸载较早的上下文，让 Agent 能继续工作。

**工具调用卸载。** 大体积的工具输出（想想 2,000 行的日志文件）会塞满上下文却增加不了多少信号。Harness 保留超过阈值部分的头尾 token，把完整输出卸载到文件系统，Agent 需要时再去读。

**带渐进式披露的 skill。** 启动时就把每个工具和 MCP 都加载进上下文，会在 Agent 采取第一个行动之前就拖垮性能。Skill 让 harness 只在任务真正需要时才展开指令和工具。

Anthropic 的 harness 文章为真正的长任务补充了一种技术：完全的上下文重置，harness 把会话拆掉，再从一个精简的交接文件重建它。他们明确指出，对长任务来说*仅靠 compaction 是不够的*；有时你需要带着一份结构化的简报从头开始。这更接近人类给新工程师做 onboarding 的方式，而不是我们通常理解的“记忆”。

### 长程执行：Ralph Loop、规划、验证

自主的长程工作是圣杯，也是最难做对的事。今天的模型受困于过早停止、对复杂问题的拆解不佳，以及工作跨越多个上下文窗口时的不连贯。Harness 必须围绕所有这些问题来设计。

我之前在 [self-improving agents](https://addyosmani.com/blog/self-improving-agents/) 和我的 [2026 趋势文章](https://beyond.addy.ie/2026-trends/)里写过 Ralph Loop 这类自主编码循环，但在这个框架下值得再讲一遍：一个 hook 拦截模型试图退出的动作，把原始 prompt 重新注入一个全新的上下文窗口，迫使 Agent 朝着完成目标继续。每次迭代都干净地开始，但通过文件系统读取上一轮的状态。这是一个出奇简单的技巧，把单会话 Agent 变成了多会话 Agent，而它正是那种你永远无法从“用一个更聪明的模型就行”推导出来的原语。

**规划**是模型把目标拆解成一系列步骤，通常写进磁盘上的一个计划文件。Harness 通过 prompt 和关于如何使用计划文件的提醒来支持它。每一步之后，Agent 通过自我验证检查自己的工作：hooks 运行一套预定义的测试并把失败连同错误文本回灌给模型，或者模型对照明确的标准审视自己的输出。

**Planner / generator / evaluator 拆分。** Anthropic 关于长时间运行 harness 的工作明确指出，把生成和评估拆到不同的 Agent 里，效果优于自我评估，因为 Agent 给自己打分时可靠地偏向乐观。这是散文版的 GAN。相关的模式是 **sprint contract**（冲刺契约）：在写代码之前，generator 和 evaluator 先协商好“完成”到底意味着什么。在我自己的工作流里，开工前先写下完成条件，抓住的范围漂移比我做过的任何 prompt 改动都多。

### Hooks：强制执行层

Hooks 是把“我告诉过 Agent 要做 X”和“系统强制执行 X”区分开的东西。

Hook 是在特定生命周期节点运行的脚本：工具调用之前、文件编辑之后、提交之前、会话开始时。它们是安放那些 Agent 永远不该忘却经常忘的事情的正确位置。每次编辑后运行 typecheck、lint 和测试并暴露失败。拦截破坏性的 bash（`rm -rf`、`git push --force`、`DROP TABLE`）。在开 PR 或推送到 `main` 之前要求审批。写入时自动格式化，这样 Agent 就不会把 token 浪费在空白字符上。

HumanLayer 强调、而我也逐渐认同的原则是：**成功保持沉默，失败大声喧哗。** 如果 typecheck 通过，Agent 什么也听不到。如果失败，错误文本被注入循环，Agent 自我纠正。这让反馈回路在常见情况下几乎免费，在出问题时又直接可操作。

### `AGENTS.md` 与工具选择

仓库根目录那份扁平的 markdown 规则手册，仍然是杠杆最高的单一配置点，因为它每一轮都会进入 system prompt。约定放在这里：包管理器、测试框架、格式化、“绝不碰 `/legacy`”、“始终用我们的 logger”。两条来之不易的教训：

保持简短。HumanLayer 把他们的控制在 60 行以内。每一行都在争夺注意力，规则越多，每条规则的分量就越轻。**是飞行员的检查清单，不是风格指南。**

每一行都要挣来。规则应该能追溯到一次具体的过往失败，或一条硬性的外部约束。否则就是噪音。要像棘轮一样一格一格地推进，而不是头脑风暴。

同样的纪律也适用于工具。每个工具的名称、描述和 schema 每次请求都会被盖进 prompt。十个专注的工具胜过五十个互相重叠的工具，因为模型能把这份菜单装进脑子里。HumanLayer 还指出了这里一个真实的安全隐患：工具描述会填充进 prompt，所以你安装的任何 MCP server 都是模型会读的受信文本。一个草率或恶意的 MCP，可以在你敲下任何字之前就对你的 Agent 进行 prompt injection。

### 在生产环境里长什么样

我见过的关于一个成熟 harness 最清晰的公开图景，是 Fareed Khan 对 [Claude Code 架构](https://levelup.gitconnected.com/building-claude-code-with-harness-engineering-d2e8c0da85f0)的（推测性）拆解，值得花一分钟盯着那张图看看。

![Claude Code 架构，按层标注：输入层包含用户界面、会话管理器和权限门；知识层包含 skill 注册表、上下文压缩器、任务图和记忆存储；集成层包含 MCP 运行时和外部 server；执行层包含工具分发、流式运行时和 prompt 缓存；输出层返回经过验证的任务结果；可观测层包含事件总线和后台执行器；多 Agent 层包含 subagent spawn、队友邮箱、FSM 协议、自主看板和 worktree 隔离器。主 Agent 循环位于图的中央，箭头从每一层汇入。](https://addyosmani.com/assets/images/claude-code-architecture.jpeg)

上一节里几乎每一个概念都作为具名组件出现在这张图上。上下文注入就是知识层。循环状态活在记忆存储和 worktree 隔离器里。破坏性操作的 hooks 坐在权限门后面。Subagent 的上下文防火墙就是整个多 Agent 层。工具分发注册表是 MCP server 和 bash 共同接入的地方。Khan 的论点和 Viv 的一样，只是通过一个已经上线的产品推演了一遍：**Claude Code 的演进轨迹，至少和它底下的模型同样多地取决于 harness。**

---

## Harness 不会缩小，只会移动

Anthropic 那篇文章里较好的一个观察是：随着模型进步，有意思的 harness 组合空间并不会缩小。它会移动。

天真的故事是：更好的模型让 harness 过时。如果模型会规划，就不需要 planner。如果模型在长程上保持连贯，就不需要上下文重置。而且没错，Opus 4.6 基本消灭了“上下文焦虑”这种失败模式（Sonnet 4.5 曾经会在接近它自以为的上下文上限时过早收尾），这意味着我六个月前写的一整类缓解焦虑的脚手架，现在都成了死代码。

但天花板随着模型一起移动了。以前够不着的任务进入了射程，而它们有自己的失败模式。焦虑脚手架消失了，取而代之的是你需要一套跨多日的记忆策略，或一个协调三个专职 Agent 的 harness，或针对生成式 UI 的设计质量评估器。假设变了，编码这些假设的脚手架也随之改变。

Anthropic 说得很干脆：*“harness 里的每一个组件，都编码着一个关于模型自身做不到什么的假设。”* 当模型在某件事上变强，那个组件就不再承重，应该拿掉。当模型解锁了新东西，就需要新的脚手架去够到新的天花板。

### 模型与 harness 的训练回路

另一件正在发生、且被 Viv 明确点名的事，是 harness 设计与模型训练之间的反馈回路。

![模型与 harness 的训练回路。一个有用的原语在 harness 中被发现，被标准化进产品，用于训练下一代模型，然后下一代模型在使用该原语上变得更好。循环往复。](https://addyosmani.com/assets/images/harness-training-loop.jpeg)

今天的 Agent 产品都是把 harness 放进回路里做后训练的。模型会专门在 harness 设计者认为它应该擅长的动作上变强：文件系统操作、bash、规划、subagent 分派。这就是为什么 Opus 4.6 在 Claude Code 里的感觉和在别人的 harness 里不一样，也是为什么改一个工具的逻辑有时会引发奇怪的退化。一个真正通用的模型不会在意你用的是 `apply_patch` 还是 `str_replace`，但联合训练造成了过拟合。

实际的启示有两点。**Harness 是一个活的系统，不是一个设置一次就完事的配置文件。** 而且“最好的” harness 未必是模型在其中被训练出来的那个；而是为你的任务设计的那个。Viv 在 Terminal Bench 上从前 30 名跳到前 5 名，是我见过的最清晰的证明。

---

## Harness-as-a-Service

Viv 的另一个贡献是 **[HaaS](https://www.vtrivedy.com/posts/claude-code-sdk-haas-harness-as-a-service)** 这个框架：Harness-as-a-Service。他观察到，我们正从“基于 LLM API 构建”（它给你一个补全）转向“基于 harness API 构建”（它给你一个运行时）。Claude Agent SDK、Codex SDK 和 OpenAI Agents SDK 都指向同一个方向。你开箱即得循环、工具、上下文管理、hooks 和沙箱原语，然后按需定制。

这个转变之所以重要，是因为过去的默认路径是：自己搭循环，自己接工具调用，自己处理对话状态，自己发明审批流程。现在的默认路径是：选一个 harness 框架，沿着四大支柱（system prompt、工具、上下文、subagent）配置它，然后把剩下的精力投入到领域特定的 prompt 和工具设计上。

这正是让“skill issue”变得可处理的原因。你不再是每次出问题都从零重建一个 Agent，而是在调优一个已经良好分解的配置面。

Viv 关于这一点的那句话，也是“先做出来再说”的最佳论据：*“好的 Agent 构建是一场迭代练习。没有 v0.1，你就无法迭代。”*

---

## 这一切正走向何方

把顶级的 coding agent 并排放在一起看（Claude Code、Cursor、Codex、Aider、Cline），**它们彼此之间的相似度，高于它们底层模型之间的相似度。** 模型各不相同。Harness 模式正在趋同。我不认为这是偶然。这是整个行业在慢慢找到那些承重的脚手架，也就是把一个生成式模型变成一个能交付东西的系统所需的那些部件。

Viv 对开放问题的框定是我觉得最令人兴奋的：编排许多 Agent 在同一个代码库上并行工作；能分析自己的 trace、识别并修复 harness 层面失败模式的 Agent；不再在启动时预先配置、而是为给定任务即时（just-in-time）动态组装合适的工具和上下文的 harness。

尤其是最后一条，感觉像是 **harness 不再是静态配置、而开始变得更接近编译器的地方。**
