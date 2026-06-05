---
title: "当 AI 开始构建自己"
originalTitle: "When AI builds itself"
date: 2026-06-05
originalUrl: https://www.anthropic.com/institute/recursive-self-improvement
lang: zh
---

在 AI 历史的大部分时间里，人类驱动着其开发周期中的每一个环节。但在 Anthropic，我们正把越来越多的 AI 开发工作交给 AI 系统自己完成，这正在加快我们的工作速度。

如果这一趋势走得足够远，并且有足够的算力，它指向的将是一个能够完全自主设计和开发自身后继者的 AI 系统。这被称为*递归自我改进*（recursive self-improvement）。我们尚未走到那一步，递归自我改进也并非必然。但它的到来，可能比大多数机构准备好的时间更早。

基于公开基准测试和此前未曾公开的 Anthropic 内部数据，[The Anthropic Institute](https://www.anthropic.com/institute) 正在展示：AI 已经在加速 AI 系统的开发。仅举一例：如今，Anthropic 工程师平均每季度交付的代码量，是 2021-2025 年间的 8 倍。

本文讨论的技术趋势表明，未来几年 AI 系统的能力将大幅提升。这些趋势影响深远。能够构建自身的 AI 将是技术史上的重大进展——它可能在科学、医疗等领域[为世界带来巨大的好处](https://www.darioamodei.com/essay/machines-of-loving-grace)。但完全的递归自我改进也可能加大人类[失去对 AI 系统控制](https://www.darioamodei.com/essay/the-adolescence-of-technology)的风险。如果系统有能力完全构建自己的后继者，那么我们保护它们、监控它们、塑造其行为的方式都将变得重要得多。

2021–2023

构建第一个 Claude

早期，Anthropic 的工作和任何其他科技公司没什么两样：人们在笔记本电脑上写代码、写文档。

2023–2025

聊天机器人

人们用早期的聊天机器人辅助流程中的部分环节，比如生成简短的代码片段，再把输出复制到文本编辑器里。

2025–2026

编码智能体

随着智能体能力增强，它们能够自行编写和编辑代码，有时甚至是整个文件。

今天

自主智能体

智能体现在可以自己运行代码，并把数小时的工作委派给其他智能体。

20XX？

闭环

未来，智能体可能强大到足以自行构建和训练模型。如果这成为现实，未来版本的 Claude 将可以由 Claude 自己持续改进。

### **来自外部世界的证据**

AI 模型进步的速度正在加快。它们能够[独立可靠完成](https://metr.org/time-horizons/)的任务时长，大约每四个月翻一番，而早先的趋势是[每七个月翻一番](https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/)。2024 年 3 月，Claude Opus 3 能完成人类约需四分钟的软件任务。一年后，Claude Sonnet 3.7 能完成大约一个半小时的任务。再过一年，Claude Opus 4.6 已能完成 12 小时的任务。1 如果这一趋势延续，熟练人员需要数天完成的任务，今年就可能进入能力范围。到 2027 年，AI 系统可能胜任需要一个人数周才能完成的任务。

同样的模式也出现在编码和研究基准测试上。基准测试衡量模型在特定领域的表现，当模型接近 100% 的成绩时，基准就"饱和"了。2 [SWE-bench](https://www.swebench.com/) 是一项针对真实世界软件工程的标准测试：它给模型一个真实的开源代码库和一份真实的 bug 报告，要求它写出能修复问题并通过该项目自身测试的代码变更。模型的得分从个位数低段到令基准饱和，只用了两年。

[CORE-Bench](https://arxiv.org/abs/2409.11363) 测试模型能否复现已有研究——这是它们开展原创研究的前提。它把一篇已发表论文背后的代码和数据交给 AI 模型，要求它重新运行所有内容并确认能复现论文结果。AI 系统从 2024 年约 20% 的复现成功率，到十五个月后令该基准饱和。运行长时程任务基准的 METR [发现](https://x.com/METR_Evals/status/2052896621760004602)，Claude Mythos Preview 可以连续工作"至少"16 小时，"处于 \[METR\] 在不引入新任务的情况下所能测量的上限"。

公开基准测试能说明这些系统的很多能力。但它们无法揭示 AI 系统在加速 AI 开发本身上产生的影响。要了解这一点，我们需要来自 Anthropic 这类 AI 公司内部的直接证据。

### **来自 Anthropic 内部的证据**

构建一个前沿模型需要两大类工作。一类是*工程*：编写代码、搭建基础设施、监督模型训练。另一类是*研究*：决定运行哪些实验、解读返回的结果、判断接下来该尝试哪些想法。

在工程和研究两方面，图景是一致的。在工程上，可以把一个描述不充分的问题交给 Claude，它能自己想出解决办法；人类提供目标，但不再需要提供方法。在研究上，Claude 在执行一个定义明确的实验时，已经能匹敌甚至超越熟练的人类。然而，一旦涉及 Claude 在工程和研究中运用判断力来选择目标，巨大的性能差距依然存在。这正是今天的 AI 与未来那个能自主设计自身后继者的系统之间的差距。

在 Anthropic，员工随着经验增长会接到更开放、更重要的任务，这很常见。初期，他们执行别人指定好的任务，比如：*"导出按钮坏了，请修一下。"*有了经验后，他们会拿到一个目标并自己设计方法，比如：*"调查为什么网络在高负载下变慢。"*到最资深的层级，他们决定哪些问题根本值得去做：*"团队下个季度该做什么？"*我们可以用 Anthropic 的内部数据，来观察 Claude 在处理这几类任务上走了多远。

**Claude 编写了 Anthropic 相当大比例的代码。**截至 2026 年 5 月，我们合入 Anthropic 代码库的代码中，超过 80% 由 Claude 编写。3 在 Claude Code 于 2025 年 2 月以研究预览版发布之前，这个数字还是个位数低段。这一转变也体现在每位工程师的产出上。在 Anthropic 的前四年（2021-2024），每位工程师每天合入的代码行数保持平稳，随后在 2025 年开始攀升——那一年 Claude 开始自己运行代码，而不只是给出建议让工程师复制粘贴。2026 年，当模型开始在更长的时间跨度上自主工作时，斜率再次变陡。下图展示了这两个拐点。2026 年第二季度，一位典型工程师每天合入的代码量是 2024 年的 8 倍。4 这是因为大部分代码由 Claude 编写，工程师负责指挥和审查，而不是亲手敲出来。

![柱状图：从 2021 年第二季度到 2026 年第二季度，每人每季度贡献的代码量。图中标注了八个不同模型的发布时间：Claude 1、Claude 2、Claude 3、Claude 4、Claude Code、Claude Sonnet 4.5、Claude Opus 4.5、Claude Mythos Preview（内部使用）以及 Claude Mythos Preview。](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F52a19d636c659cf4515dc0d7d70b8ceb1bbfd768-2200x1276.png&w=3840&q=75)

需要说明的是：代码行数是一个不完美的度量，因为它衡量的是数量而非质量。所以 2026 年第二季度*每位工程师每天 8 倍的代码行数*几乎可以肯定高估了真实的生产力提升。尽管如此，它仍然表明了一种加速。在 Anthropic，我们不会因为谁写的代码行数多而奖励谁；团队成员产出更多代码，仅仅是因为他们在用 AI 系统写更多代码。

代码行数的增长，与人们对生产力大幅提升的主观感受相吻合。在 2026 年 3 月一项覆盖 Anthropic 各研究团队 130 名员工的调查中，中位数受访者估计：在那些他们本来就会做的项目上，借助 Mythos Preview 的产出约为完全没有 AI 模型时的 4 倍。5 我们预计 3 月份的真实提升幅度要略低一些。6 尽管如此，我们认为这个总体判断是可信的，也与我们的其他观察一致：相当一部分 Anthropic 技术人员完成核心工作的速度，是没有 AI 辅助时的好几倍。

我们还看到证据表明，Anthropic 的员工正在用 Claude 去做那些原本根本不会发生的工作，比如构建探索性工具、处理长期搁置的清理事项。例如，2026 年 4 月，Claude 交付了 800 多个修复，将某一类 API 错误减少了一千倍。监督 Claude 的那位工程师估计，换成人类需要四年才能完成这项工作；解决别人的 bug 既缓慢又繁琐，人类很难同时在脑子里装下那么多陌生的上下文。

<figure><div><blockquote>I started leaning hard into Claudifying about a year ago. That’s been a crazy adventure and it’s now been ~5 months since I last wrote any code myself.</blockquote><figcaption>Anthropic employee*</figcaption></div></figure>

**Claude 写的代码是"好代码"，而且还在变好。**"好代码"意味着两件事：它能工作，并且写法能让另一位工程师理解它、在它之上继续构建。在第一条标准上，证据很明确。一年来，Anthropic 员工在任务中途纠正、改变方向或接管 Claude 工作的比率一直在稳步下降，包括在最复杂、最开放的任务上——这类任务没有清晰的规格说明，工程师自己也不确定答案长什么样。从下图所示的 Claude 在不同难度任务上成功率随时间的变化中，可以清楚看到这一点。Claude 写的代码是能用的。

![折线图：Claude Code 会话在四类任务（琐碎任务、常规任务、较大任务、开放性问题）上的成功率，涵盖六个模型：Claude Sonnet 4.5、Claude Opus 4.5、Claude Opus 4.6、Mythos Preview（内部使用）、Mythos Preview 和 Claude Opus 4.7。](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F30f1266938f0d62a770dccf77baf24a0ad237fbd-2200x1276.png&w=3840&q=75)

*如何解读：会话是否成功由一个 Claude 评判者判定；如果 Claude Code 智能体明显完成了用户的任务且无需纠正，该会话即被视为成功。工作负载的变化可能导致成功率的短期波动。*

在最开放的任务上，Claude 的成功率在 2026 年 5 月达到了 76%，六个月内提升了 50 个百分点。举一个这一难度层级的任务例子：一次常规升级开始导致数万个训练作业崩溃。一位工程师把 Claude 指向这起正在发生的事故，给它的只有一些文字内容和集群访问权限。Claude 在运行中的作业里逐一排查、每次测试一个环境设置，最终定位到触发崩溃的那个冷门调试标志，稳定复现了问题，并确认了修复方案。Claude 用了大约两小时，交付了通常需要两到三天的工作。

第二条标准是写出让另一位工程师能理解并在其之上构建的代码。在这一点上，人类与 AI 的差距仍然存在，但正在迅速缩小。Anthropic 内部尚无完全共识，但许多人认为，2025 年末 Claude 写的代码质量仍逊于 Anthropic 的人类手写代码，而如今已大致持平。我们预计一年之内它会反超。

这改变了 Anthropic 审查自己代码的方式。现在，对我们代码库的变更提案在合并之前，都要先经过一个自动化的 Claude 审查者，由它查找 bug、安全缺陷和其他问题。借助这个工具，我们做了一次回溯分析，发现如果对代码库的每一次变更都做自动化 Claude 审查，过去 [claude.ai](http://claude.ai/) 事故背后约三分之一的 bug 在进入生产环境之前就会被抓住。写那些代码的工程师，是世界上最擅长构建这类系统的人。Claude 现在抓住的，正是他们漏掉的错误。

<figure><div><blockquote>Claude-written code was somewhat worse than human-written code at Anthropic in late 2025, is roughly at parity today, and we expect it to be strictly better within the year.</blockquote></div></figure>

**Claude 擅长围绕别人设定的目标运行实验。**每次 Anthropic 发布模型时，我们都会做同一个测试：给 Claude 一段训练小型 AI 模型的代码，要求它在仍能通过相同正确性检查的前提下，让代码跑得尽可能快。目标和成功指标都是事先固定的，所以 Claude 的工作就是通过重写代码、运行、计时、再重复，来寻找加速点。这是实验性研究循环的微缩版。2025 年 5 月，[Claude Opus 4](https://www-cdn.anthropic.com/6d8a8055020700718b0c49369f60816ba2a7c285.pdf) 相对初始代码平均取得约 3 倍加速。到 2026 年 4 月，[Claude Mythos Preview](https://www-cdn.anthropic.com/8b8380204f74670be75e81c820ca8dda846ab289.pdf) 已能达到约 52 倍。作为参照，一位熟练的人类研究员需要四到八小时才能达到 4 倍。7 在研究工作流的这一部分——优化定义明确的实验中的各个环节——Claude 在不到一年里从"超级有用"变成了"超越人类"。

<figure><div><blockquote>The shape of stuff today is roughly ‘humans have ideas, and the models are able to implement, test and evaluate them an [order of magnitude] faster than before.’</blockquote></div></figure>

**Claude 提出自己实验的能力越来越强。**2026 年 4 月，Anthropic [发表](https://alignment.anthropic.com/2026/automated-w2s-researcher/)了 Claude 端到端运行一个开放式研究项目的首个演示。由 Claude 驱动的智能体接到了 AI 安全领域的一个开放问题——大致是：*一个较弱的模型能否可靠地监督一个更强的模型？*——然后被放手去解决。这涉及提出假设、验证假设、与并行的智能体分享发现并持续迭代。该任务有明确的性能"下限"和"上限"：下限是弱监督者单独能做到的水平；上限是强模型在正确答案上训练后能达到的水平。两位人类研究员花了大约一周，弥合了这一差距的约 23%；智能体在累计 800 小时、约 18,000 美元算力开销下弥合了 97%。这项工作有一些限定：结果没能干净地迁移到生产规模的模型上，而且问题仍由人类选择、评分标准仍由人类制定。但在这些边界之内，每一个实验都是智能体自己设计的。人类唯一有实质意义的角色，是把握方向。

<figure><div><blockquote>Claude did all of this with pretty minimal help from me over the course of 1-2 days. I think if [a junior colleague] came back to me with results like this in the same span of time, I would be mildly impressed. The future is now.</blockquote></div></figure>

**Claude 把研究会话引向研究成果的能力越来越强。**我们考察了 2026 年 1 月至 3 月间真实的 Claude Code 会话，其中 Anthropic 研究员与 Claude 一起处理开放式的调查性问题，比如弄清楚一次训练运行为何不断崩溃，或者一个模型为何在某个基准上得分很低。在每个案例中，我们都找到了研究员"走弯路"的时刻：他们选择了一个让会话偏离方向的路线，之后才回到正轨。然后我们只给各个 Claude 模型看会话偏离之前的工作，问它接下来会怎么做。再由另一个能看到会话最终走向的 Claude 来评判：是 AI 还是人类提出了更好的下一步。8

由于我们刻意挑选的是已知人类选择存在改进空间的时刻（n=129），这并不是模型判断力与人类判断力的同等对比。这些时刻给我们的，是一组现实而有挑战的情境：正确的下一步并不显而易见，而人类的选择可以作为衡量模型表现随时间变化的有用标尺。在这一指标上，我们 2025 年 11 月的最佳模型（Opus 4.5）有 51% 的概率胜过人类的选择；到 2026 年 4 月（Mythos Preview），这一数字增长到 64%。研究的日常工作在很大程度上就是这样一连串"下一步"决策，因此这是衡量模型最终能否独立开展调查的一个相关指标。我们将这一结果视为一个早期信号：AI 系统正在变得更擅长做出 AI 研究所依赖的那类判断。

![柱状图，标题为"模型能否选出比人类更好的下一步？"图中展示了九个模型的表现：Claude 3 Haiku、Claude Sonnet 4、Claude Sonnet 4.5、Claude Haiku 4.5、Claude Opus 4.5、Claude Sonnet 4.6、Claude Opus 4.6、Claude Opus 4.7 和 Claude Mythos Preview。](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6fc2841bc896ad4ea8ee77e515df1a0a6bed8bcf-2200x1276.png&w=3840&q=75)

*如何解读："实际上限"线衡量的是由一个能看到整个会话（包括其结局）的模型写出的"理想"答案。*

<figure><div><blockquote>The comparative advantage of humans as of right now is still in seeing the bigger picture and thinking beyond the confines of the immediate task.</blockquote></div></figure>

### **Anthropic 未来的工作会是什么样？**

证据表明，在 AI 开发流程的每一步中，人类的角色都在收窄。一旦人类与 AI 编写的代码质量持平，人类将完全停止写代码，转而只做审查。但如果他们审查代码的速度赶不上 Claude 生成代码的速度，人类审查就会成为 AI 开发的瓶颈。同样，一旦 Claude 能够运行实验，问题就会转向"这些实验里哪个值得跑？"简单说：*动手做*（即写代码、跑实验、产出结果）在人类时间上的成本已几乎归零，即便它在算力上仍有成本。

目前人类的比较优势所在，是研究品味与判断力——包括选择哪些问题重要、哪些结果可信，以及何时该判定一条路走不通。

<figure><div><blockquote>Work (and life) ran on a gift economy of small favors between humans. ‘Can you help me get this script running?’ [...] each one created a little debt, a little mutual awareness. [Claude is] faster, it creates zero debt, but each of these is a lost bid for human collaboration.</blockquote></div></figure>

<figure><div><blockquote>On days where everything works well, I can’t help but think nothing I do matters, everything is automated and better and faster than I ever will be. But then there are days where everything breaks and I don't understand why and I realize I have no idea what I’ve been up to anymore.</blockquote></div></figure>

### **如果我们错了呢？**

对上述证据一个自然的反驳是：仍然掌握在人类手里的那部分工作——选择研究什么问题——才是最重要的。没有这种判断力，Claude 只是一个能干的助手，而不是一个能独立驱动 AI 进步的系统。

今天的训练方法和架构能否解锁那种能力，确实还不清楚。但 AI 的进步很少来自"灵光一现"。AI 近期历史上确实有过几次，比如 [Transformer 架构](https://proceedings.neurips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf)或混合专家（mixture-of-experts）模型，但范式转换级的想法往往数年才出现一次。在其间，大多数进步是渐进式的：我们把某个东西扩大规模，看哪里坏了，修好，再来一遍。而这正是 Claude 如今擅长的工作流。爱迪生说，天才是 1% 的灵感加 99% 的汗水。但我们看到，汗水正日益被自动化。越来越清楚的是，推动前沿的大部分工作是可自动化的；大规模研究进展主要取决于工具和资源——它们决定了你能多快跑一个实验、能同时跑多少个、能多快拿到结果。

即使假设 Claude 永远无法获得良好的研究品味，对我们证据的保守解读仍然意味着复合式加速。如果人类把大部分时间花在那只占个位数百分比的方向制定工作上，其余都交给 Claude，那就意味着每位工程师或研究员掌舵的工作量远超从前。我们看到的证据表明，Anthropic 的人既在更快地前进，也在覆盖更广的面。实际上，这意味着 AI 已经让 Anthropic 的速度远超有效 AI 工具出现之前。

不那么保守的解读则是：关于 Claude 研究判断力正在改善的早期证据——尽管今天还很有限——表明这项能力同样在进步。"研究品味"可能只是又一项 AI 系统先做不好、后来做得很好的 AI 能力。我们在其他定性技能上见过类似的模式，比如 AI 系统学会解释一个笑话为什么好笑、展示心智理论、解开语言谜题。

###   
**可能的未来**

接下来会发生什么，取决于两件事：趋势是否延续，以及如果延续，我们选择怎么做。我们至少可以想象三种未来情景：

1.  **趋势停滞，但今天的 AI 能力已广泛扩散**。本文呈现了许多指数式轨迹。但这些轨迹实际上可能是 S 形曲线。我们可能正在接近曲线的弯折处——规模回报递减，曲线先变直、再变平。区分合格研究员与伟大研究员的那种判断力，可能是一种无法靠扩大算力和数据等训练投入获得的能力。若是如此，越过这个瓶颈需要一个新想法，比如一种能取代当前所有前沿模型所用 Transformer 架构的架构方案。
    
    另一种可能是，AI 进步的硬约束在供应链而不在模型：推进和扩散前沿可能需要比现存更多的能源和算力。芯片制造、电网扩张或互连带宽的速度可能才是约束，而非智能本身。我们也无法排除 AI 生态系统遭受外生冲击而大幅放缓的可能，比如算力或电力供应骤减，二者任何一个都会拖慢进展，并让实验室的前瞻性投资变得更昂贵。又或者，存在某种我们尚未预见的其他障碍。
    
    即使模型能力冻结在今天的水平，我们也预计世界将发生重大变化。[Project Glasswing](https://www.anthropic.com/glasswing) 是一个早期信号：上线最初几周，Mythos Preview 就在全球最重要的系统中发现了一万多个高危和严重级软件漏洞——多到网络防御的瓶颈已经从发现漏洞转移到能否足够快地修补漏洞。而且，今天的模型向更广泛经济体的扩散仍处于早期。一家 100 人的公司将越来越能做 1000 人公司的工作，因为每位员工都将坐在一个智能体金字塔的顶端。
    
    我们列入这种情景是为了完整性，但我们认为它不太可能。我们能测量的每一项能力——包括那些感觉更"模糊"的，比如代码质量和开放任务的成功率——迄今都遵循着同一条曲线。我们还没有看到这条曲线弯折。在我们考虑的三种未来中，这一种会给政府和社会最多的适应时间。我们更担心的是接下来两种：它们会来得更快，留给准备的空间也少得多。
    
2.  **AI 实验室持续获得复合式效率增益。**在这一情景中，AI 开发被大幅自动化，但人类仍然设定研究方向、评判结果。使用 AI 系统的组织会随时间推移变得高效得多，因此我们可以预期组织中每个人都会获得显著的生产力乘数。100 人的公司可以做 1 万人甚至 10 万人组织的工作。这将彻底改变知识工作和政府服务，但也可能被用于有害的目的——从对整个人口的威权监控，到针对每个个体量身定制操纵手段、以任何人类团队都无法企及的规模运转的影响力行动。Anthropic 这类公司里人类的角色将发生转变。人们将与 AI 系统结成伙伴来扩大研究规模、产生新的洞见，并共同构建验证 AI 输出可信所需的系统。
    
    我们列出的证据表明，我们很可能正走向这一情景。但加速流程的某一部分，往往只是把瓶颈挪到别处：整体节奏受制于那些没有加速的环节。在计算领域，这被称为[阿姆达尔定律（Amdahl's law）](https://en.wikipedia.org/wiki/Amdahl%27s_law#:~:text=In%20computer%20architecture%2C%20Amdahl's%20law,the%20concept%20of%20diminishing%20returns.)，同样的逻辑也适用于组织。Anthropic 已经遇到了阿姆达尔定律的一个典型征兆：随着我们在组织里推动更多代码，人类代码审查成了新的瓶颈。
    
    我们在工程之外也遇到了这种摩擦。由于 Anthropic 员工与高能力模型协作，新想法、新项目、新工具和新模拟出现了爆发式增长——远超我们有能力推进的数量。组织发现并解决这些瓶颈的速度，可能是一项会随时间提升的技能，而且可能成为任何组织最重要的技能。
    
3.  **AI 系统自身具备完全递归自我改进的能力，开始构建自己的后继者。**如果能力进步的技术趋势延续，*并且* AI 系统能够发展出变革性人类创造力所固有的那些能力，那么 AI 系统自行设计并完善自身就是有可能的。
    
    在这个世界里，AI 开发的进展速度将完全取决于 AI 系统可用的算力（或在算法训练、推理上发现各种效率提升的速度）。人类在其开发中的角色将大幅缩减，很可能把大部分精力转向对一个不断扩张的、由 AI 系统运营的"虚拟实验室"进行监督、验证与核查。我们预计，有能力自动化 AI 研发的系统，其技能也能迁移到其他科学领域，使它们开始变革其他领域。
    
    在这种未来中，[对齐问题](https://www.anthropic.com/research/team/alignment)如何得到解决——或者得不到解决——是我们最没有把握的事。模型可能被证明足够对齐、且具备足够的研究品味，从而发现并实施我们尚未触及的新颖解决方案。它们也可能足够明智，在情况不对时叫停开发。另一种可能是，今天模型中罕见出现的不对齐，会在模型构建后继者的过程中不断累积——变得更频繁、却更难被理解，直到我们失去对它们的控制。还有可能，我们无法构建、整合并验证那些能让我们看清自己究竟处在哪条趋势线上的工具。
    
    我们对那个世界会是什么样子没有好的直觉，因为我们的经济目前由人类和人类建造的工具驱动。就其本性而言，一个由快速递归自我改进驱动的世界，可能会被那个自我改进的模型主导——它的能力将完全超越人类，并在更广泛的经济中扩散。如果人类劳动不再具有竞争力，经济会是什么样子，很难预测。
    
    即使模型开发完全自动化并形成递归，我们也无法预测这对大多数人的日常生活意味着什么。阿姆达尔定律在这里同样适用。递归智能可能让[《仁爱机器》（Machines of Loving Grace）](https://darioamodei.com/essay/machines-of-loving-grace)中描绘的许多好处在某些领域快速实现。我们预计具身智能（即机器人）可能紧随递归智能之后，走上一条回报递增、成本递减的相似路径。更强大的智能或许能帮助我们更快地在物理世界中建造，开展更高效的救命药物临床试验，并发展出新的协作形式。
    
    但仅仅实现递归改进，并不意味着工业生产方式、社会组织形式或市场运作会立即改变。再多的智能也无法提前知道一种药物在数十年使用中的效果，无法在宪法规定之前提前举行选举，也无法在一个周末把陌生人变成老朋友。对大多数人来说，这个未来的体感节奏仍将由瓶颈决定，即便上游的实验室以算力的速度运转。这场碰撞——把自己越造越快的递归智能，撞上由人类、关系和治理构成的世界——是这个未来中另一个我们无法预测的部分。
    

### **我们该怎么做？**

如果有可能切实放慢这项技术的发展，为我们应对其深远影响争取更多时间，我们认为那很可能是件好事。但如果放慢只是让最不谨慎的参与者在技术上[赶上来](https://www.anthropic.com/research/2028-ai-leadership)，它可能让所有人更不安全。在缺乏全球协调机制的情况下，公司和政府将不得不在竞争与地缘政治压力之下，做出关于安全的艰难决定。

我们相信，让世界拥有放慢或暂时暂停前沿 AI 开发的*选项*，使社会结构和对齐研究能跟上技术的步伐，将是一件好事。The Anthropic Institute 将与众多伙伴合作开展[研究](https://www.anthropic.com/research/anthropic-institute-agenda)，并采取行动，帮助构建一次可信的放缓或暂停所需要的系统。这些系统将使前沿 AI 开发者能够核实全球其他各方确实已经停止或放慢，并确保不良行为者无法借协调放缓之名暗中抢先。如果这样的系统存在，我们预计：只要其他处于或接近前沿的开发者也以可核实的方式放慢或暂停，我们也会这么做。

一次有意义的放缓或暂停，需要多个资源充足、处于或接近前沿的实验室，分布在多个国家，同意在相同条件下停止。它还要求各方能够核实其他各方确实停了下来。由于 AI 系统的独特属性，这个军备控制问题中的可探测性（一个低于可核实性的标准）要素，比其他技术[困难得多](https://www.cambridge.org/core/journals/international-organization/article/dual-use-deception-how-technology-shapes-cooperation-in-international-relations/C3BC65F4B54B509440632BD62D074031)。训练运行远比导弹发射井更容易隐藏，其投入要素是通用的，而悄悄违约的动机巨大——因为在别人暂停时继续推进的一方，可能接过领先地位。一次可信的暂停还必须明确：什么触发它、什么解除它、由谁来裁决。

这些在原则上未必不可能——世界曾为其他复杂技术建立过核查机制（例如《中导条约》）——但那些机制花了数十年才建立起基础设施与信任。我们没有那么长的时间。相比之下，单个实验室的单边暂停可以立即实现，但成效要小得多：它会改变谁是领跑者，却无法创造目前缺失的更广泛的审议进程。

未来几个月，我们将组织一系列对话，让政策制定者、研究人员、公民社会和其他 AI 公司帮助回答本文提出的一些问题，尤其是关于完全递归自我改进，以及如何为协调与审议创造更好的选项。我们会公开发布讨论成果。共同研究这些问题的窗口期已经到来，AI 公司之外的人也应该参与这场审议。

  
*本文由 Marina Favaro 与 Jack Clark 合著，Santi Ruiz 提供编辑支持。Shan Carter、Romello Goodman 和 Nikki Makagiansar 根据 Brian Calvert 与 Jun Shern Chan 收集的数据制作了可视化图表。Daniel Freeman、Jim Baker、Max Young、Sarah Pollack、Francesco Mosconi、Holden Karnofsky、Andy Jones、Kevin Troy、Anton Korinek、Meg Tong、Andrew Ho、Dan Altman、Drake Thomas、Jack Shen、Sasha de Marigny 和 Avital Balwit 提供了反馈。*

---

1.  METR 的关键指标衡量的是 AI 系统在一篮子任务上达到 50% 可靠性的时间跨度，不过在 80% 可靠性下趋势线看起来是一样的。
2.  尤其是当基准转向更开放的形式和更难的任务（例如奥赛级数学）时，[基准常常在低于 100% 时就饱和](https://arxiv.org/pdf/2601.19532)，原因是题目和答案集中存在错误，比如表述含糊的问题和无解的题目。
3.  Anthropic 管理层曾公开[估计](https://www.businessinsider.com/anthropic-cfo-white-collar-jobs-changed-execution-oversight-2026-5)，我们 90% 以上的代码由 Claude 编写，包括脚本和实验性代码。我们的 >80% 数字衡量的是合入生产环境的代码行中可归因于 Claude 的比例。这个度量在两方面更保守：我们的归因管线存在缺口，而未归因于 Claude 的代码行中也包括自动生成的代码和其他并非人类手写的产物。
4.  代码产出的激增正在给所有人共享的基础设施带来压力。GitHub——全球大多数软件构建于其上的平台——2025 年全年大约有 10 亿次代码提交；到 2026 年年中，它每周就有 2.75 亿次，全年有望达到约 140 亿次。该公司的 COO [表示](https://x.com/kdaigle/status/2040164759836778878)，公司正在"拼尽全力"扩充容量以跟上节奏。
5.  这项调查方法的更多细节见 [Claude Opus 4.7 System Card](https://cdn.sanity.io/files/4zrzovbb/website/037f06850df7fbe871e206dad004c3db5fd50340.pdf) 第 2.3.5 节。
6.  许多受访者可能没有仔细考虑如何校正各种偏差或问题定义中的微妙之处，而 [METR 的近期研究](https://arxiv.org/pdf/2507.09089)表明，开发者对 AI 生产力提升的估计可能偏高。
7.  加速倍数有多大，在很大程度上取决于初始代码留下了多少改进空间，因此不应将其解读为真实世界的训练加速。所以这里不该锚定绝对倍数。更有参考价值的是这一实验设置带来的同口径对比：既包括模型之间的对比（过去一年从约 3 倍到约 52 倍），也包括与熟练人类的对比（同一任务上人类四到八小时约 4 倍）。
8.  为检验评判者的偏差，我们在另一组 127 个时刻上做了同样的测试——这些时刻中人类的下一步本来就很出色（与原本那组人类方向存在改进空间的时刻相对）。在那一组里，模型的建议只有约 20% 的时候被评为更好。

\* 本文中引用的 Anthropic 员工言论来自内部讨论，经许可使用。它们反映的是截至 2026 年 5 月的个人观点，不代表公司官方立场。
