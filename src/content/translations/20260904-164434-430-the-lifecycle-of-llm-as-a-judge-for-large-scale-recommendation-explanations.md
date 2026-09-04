---
title: "面向大规模推荐解释的 LLM-as-a-Judge 生命周期"
originalTitle: "The Lifecycle of LLM-as-a-Judge for Large-Scale Recommendation Explanations"
date: 2026-08-31
originalUrl: https://arxiv.org/html/2608.18300v3
lang: zh
---

*Emma Yanyang Kong, JJ Tan, Ishan Gupta, David Fagnan, Lars Olds, Claire Campbell, Ratna Kavuri, Veli Balin, Rohan Gosain, Louis Garcia, Minsu Jang — Netflix, Los Gatos, California, USA*

*作者单位说明：本工作完成于作者在 Netflix 任职期间。*

## 摘要

LLM-as-a-Judge（用一个大语言模型来评估另一个 AI 应用或模型生成的自然语言）已经成为加速并扩展昂贵人工评估的标准且可扩展的做法。然而，大多数工作把评判器（judge）当作一个静态工件：在构建时评估一次，或者对照一个固定基准评估一次。我们则主张，运行在已部署系统中的 LLM 评判器更应被理解为拥有一个*生命周期*。它必须被构建、训练、部署，并随着周边数据的演变而持续维护，而每个阶段都带来各不相同的技术与运维挑战。

我们展示了 Netflix 用于评估推荐解释的 LLM 评判器的这样一个生命周期。我们报告的一切都来自一系列受控的、面向会员的线上实验：在不断变化的片库上，我们的流水线每周生成、评判器每周评估数十万条不同的节目级解释。我们的框架分为四个阶段。（I）诞生：定义评估标准，并构建带有人工标签和理由说明的精选基准数据集。（II）训练：通过*推理对齐的细则调优*（Reasoning-Aligned Rubric Tuning, RART）来精炼评判器的细则，该方法把一个作用于推理输出之上的元评判器作为学习信号。（III）部署：让同一个评判器承担两个线上角色，即质量门控与反思式生成。（IV）监控：运行一个持续的人在回路（Human-in-the-Loop, HITL）对齐流程，检测漂移，并在人工审核关卡之后触发重新调优。我们报告了在 Netflix 移动端 App 上覆盖数千万会员、为期五周的线上 A/B 测试结果。相对于无解释的对照组，经评判器对齐的解释使会员的观看向新内容（此前未看过的内容）偏移，并提高了从浏览到成功播放的会话数，且没有出现与质量相关的投诉升级。

†† 本文已被 2nd Workshop on Lifelong Agents: Learning, Aligning, and Evolving 以及 AIMS Workshop（*AI Measurement Science: Toward Rigorous AI Evaluation*）接收，两者均与 COLM 2026 同期举办。

## 1 引言

推荐解释是伴随推荐条目出现的一段简短自然语言信息，它塑造着用户对推荐系统的感知与信任。在我们的工作中，一条解释是基于会员过去看过的内容、说明某部影片*为何*被推荐的人类可读证据。我们聚焦于*基于相似性*的解释，它通过类型、基调等共享属性，把一部被推荐的影片与会员曾互动过的一部参照影片联系起来，例如：“A funny, heartfelt holiday romance about love and new beginnings, much like My Secret Santa.”（一部关于爱与新开始的有趣而温暖的假日爱情片，与《My Secret Santa》非常相似。）这些解释旨在为会员推动*内容发现*并建立*信任*，这也正是质量至关重要的原因。一条误导性的或依据不足的解释，会侵蚀这一功能本想建立的信任。

大规模地评估质量很难。在我们的实验中，流水线每周产出数十万条不同的条目级解释，其中任何一条都可能触达会员，而每一条都必须准确、针对具体条目，且不含敏感或冒犯性内容。人工评估是黄金标准，但在这个量级上不可行。LLM-as-a-Judge（[Zheng et al., 2023](https://arxiv.org/html/2608.18300v3#bib.bib1)；[Liu et al., 2023](https://arxiv.org/html/2608.18300v3#bib.bib2)；[Kim et al., 2024](https://arxiv.org/html/2608.18300v3#bib.bib4)）提供了一个可扩展的代理，但评判器不是一次性的工件。它必须对照可信的人工标签进行初始化，经调优与人类对齐，部署到作用于真实流量的位置，并随着上游数据的漂移而持续维护。据我们所知，此前没有工作把这四个阶段刻画为一个单一的、带有完整度量的生命周期。

因此我们不把评判器视为固定的评估者，而是视为一个*终身智能体*（lifelong agent）。它是一个持久的组件，必须从不断累积的人工反馈中持续*学习*，并且是出于正确的理由而非巧合地与人类判断保持*对齐*。它还必须通过常设的对齐审计和自动化的重新调优来*演化*，因为片库、推荐算法和用户群体都在变化。

本文呈现了 Netflix 推荐解释 LLM 评判器的一项案例研究，并把它组织为一个包含四个阶段的生命周期（图 [1](https://arxiv.org/html/2608.18300v3#S3.F1)）：（I）诞生（§[4](https://arxiv.org/html/2608.18300v3#S4)）、（II）训练（§[5](https://arxiv.org/html/2608.18300v3#S5)）、（III）部署（§[6](https://arxiv.org/html/2608.18300v3#S6)）和（IV）监控（§[7](https://arxiv.org/html/2608.18300v3#S7)）。我们的贡献如下：

1. 在大规模推荐系统中对 LLM 评判器的生命周期视角，端到端覆盖全部四个阶段。
2. 推理对齐的细则调优（RART），一种细则精炼方法，它利用作用于评判器推理之上的元评判器迭代更新评判器的细则，并通过消融实验单独刻画推理对齐所带来的贡献。
3. 一套面向线上服务的运维设计，把双角色部署（质量门控，以及自我反思修订循环中的评论者）与持续的漂移监控结合起来，后者会在人工审核关卡之后触发重新调优。
4. 面向大规模上线 LLM 评判器的实用经验。

## 2 相关工作

#### 可解释推荐。

解释某个条目*为何*被推荐是一个长期议题，从展示协同过滤的邻域（[Herlocker et al., 2000](https://arxiv.org/html/2608.18300v3#bib.bib10)），到围绕透明性、信任、说服力等目标来梳理解释目的及其评估的综述（[Tintarev and Masthoff, 2007](https://arxiv.org/html/2608.18300v3#bib.bib11)；[Zhang and Chen, 2020](https://arxiv.org/html/2608.18300v3#bib.bib12)）。我们基于相似性的解释处于该分类体系中“透明性与信任”这一分支。此处的不同之处不在于解释的风格，而在于它带来的评估问题。片库规模的自由形式 LLM 文本，放弃了早期系统在构造上就能保证的模板级正确性，因此质量本身必须被度量，而不能被假定。

#### LLM-as-a-Judge。

在开放式生成任务中，用一个 LLM 给另一个模型的输出打分，如今已是替代昂贵人工评估的标准做法（[Zheng et al., 2023](https://arxiv.org/html/2608.18300v3#bib.bib1)；[Liu et al., 2023](https://arxiv.org/html/2608.18300v3#bib.bib2)；[Zhu et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib3)；[Kim et al., 2024](https://arxiv.org/html/2608.18300v3#bib.bib4)）。这类评判器带有系统性偏差，包括对答案位置与冗长程度的敏感（[Wang et al., 2024](https://arxiv.org/html/2608.18300v3#bib.bib8)），以及对自身生成内容的偏好（[Panickssery et al., 2024](https://arxiv.org/html/2608.18300v3#bib.bib9)），这也是我们在每个阶段都把评判器锚定到人工标签与理由说明的原因之一。JudgeBench（[Tan et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib5)）和 RewardBench（[Lambert et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib6)）等公开基准从通用的正确性、安全性和指令遵循角度为评判器打分，但它们是静态且领域无关的，也没有一个把评判器视为需要在部署后重新验证的、拥有生命周期的对象。我们的第 I 阶段基准用一个特定领域、带理由说明标注、并从真实流量中持续刷新的数据集填补了这一空白。

#### 自我精炼与反思。

在不更新梯度的情况下，用模型自身的批评来改进其输出，这一思路已在生成器一侧得到探索（Self-Refine（[Madaan et al., 2023](https://arxiv.org/html/2608.18300v3#bib.bib13)）、Reflexion（[Shinn et al., 2023](https://arxiv.org/html/2608.18300v3#bib.bib14)）），也有更接近我们场景的、针对评判器一侧的探索。Meta-Rewarding（[Wu et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib7)）增加了一个为评判器自身推理打分的元评判器。我们的推理元评判器 ℳ（§[5.3](https://arxiv.org/html/2608.18300v3#S5.SS3)）直接建立在这一想法之上，但有两个重要区别。第一，它以人工理由说明为依据，而不是无监督的自洽性。第二，它有意瞄准 fail 样本，因为在第 III 阶段，评判器的拒绝理由会成为生成器的修订指令，所以一个“判决正确但理由错误”的案例会把误导性的信号传播到下游。

#### 提示词与细则优化。

基于梯度的优化在文本空间中的类比，是根据反馈来修订提示词或细则，而不是通过权重反向传播。它们涵盖进化式提示词搜索（EvoPrompt（[Guo et al., 2024](https://arxiv.org/html/2608.18300v3#bib.bib15)）、Promptbreeder（[Fernando et al., 2024](https://arxiv.org/html/2608.18300v3#bib.bib16)））、文本梯度（TextGrad（[Yuksekgonul et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib17)）、ACE（[Zhang et al., 2026](https://arxiv.org/html/2608.18300v3#bib.bib18)））、在帕累托池上的反思式进化（GEPA（[Agrawal et al., 2026](https://arxiv.org/html/2608.18300v3#bib.bib21)），基于 DSPy（[Khattab et al., 2024](https://arxiv.org/html/2608.18300v3#bib.bib20)）），以及从“被选中/被拒绝”样本对中合成细则（[Liu et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib19)）。RART（§[5.1](https://arxiv.org/html/2608.18300v3#S5.SS1)）属于这一家族，与 GEPA 最接近，但是一个贪心的、单目标的特例（§[9](https://arxiv.org/html/2608.18300v3#S9)）。它的文本梯度还是在*理由说明*不匹配之上计算的，因此针对的是推理质量而不只是标签准确率。上述工作都没有在部署后持续评估评判器，也没有把重新调优与受监控的漂移信号绑定。我们的贡献与它们正交且兼容。我们展示的是：当评判器是闭环线上系统中的一个节点，而不是对照固定基准打一次分时，会有什么不同。

## 3 系统概览

图 [1](https://arxiv.org/html/2608.18300v3#S3.F1) 总结了四个阶段以及在它们之间流转的工件。LLM 评判器扮演三种角色：第 II 阶段的优化目标、第 III 阶段的反馈提供者与护栏决策者，以及第 IV 阶段的被监控对象。人工标签与理由说明在第 I 阶段收集，并在第 IV 阶段以每周约 300 条的速度持续补充。第 IV 阶段闭合了两个回路：一个快速的漂移检测回路，在评判器与人类的一致性衰减时重新触发第 II 阶段的再训练；另一个较慢的基准补充回路，让第 I 阶段的数据集始终能代表线上片库。在 §[6.2](https://arxiv.org/html/2608.18300v3#S6.SS2) 为期五周的 A/B 测试中，系统每周评估数十万条解释，在重试预算为 3 的情况下通过率超过 75%。

![图 1](https://arxiv.org/html/2608.18300v3/lifecycle.png)

*图 1：面向推荐解释的 LLM 评判器四阶段生命周期。（I）诞生（§4）构建一个由人工标注、带理由说明的样本组成的基准。（II）训练（§5）让一个反思器 LLM 根据评判器与人类在标签和推理上的不匹配，调优每条标准的细则。（III）部署（§6）对生成的解释进行门控，并以有界重试驱动自我反思式修订。（IV）监控（§7）使用每周的人工评分样本来检测漂移并补充基准，超过阈值时重新触发（II）。*

## 4 第 I 阶段：诞生，建立真值

诞生阶段是四个阶段中最依赖人力的一个。我们内部的写作专家定义标准、为人工评审员撰写标注指南、手工构造对抗样本，并为人工评分定锚。这些指南同时充当第 II 阶段中待优化的 LLM 评判器的种子细则。评审员由我们的 Human Data Operations 团队训练和校准，其流程属于内部规范，此处不再详述。每一个 fail 标签都附带一段对照指南写下的自由文本理由说明。

公开的 LLM 评判器基准（[Tan et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib5)；[Lambert et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib6)）面向通用评估，没有覆盖推荐解释的约束：推荐解释针对具体条目、依赖上下文，而且很短。因此我们构建了一个基于相似性解释的特定领域基准，每条解释都以一个目标条目和用户过去互动过的一到两个参照条目为条件。标准分为两类：一类是每条解释在展示前都必须满足的*必备*（must-have）pass/fail 条件，另一类是较软性的风格与推荐相关性标准（出于保密原因，具体标准不予披露）。对于每条标准，标注指南、pass/fail 条件和边界样例是 LLM 评判器与人工评审员共同的事实来源。

该基准来自三个互补的来源：（i）专家构造的样例，每条都带有人工评审员的 pass/fail 标签、已知的失败模式和失败理由说明，覆盖另外两个来源无法可靠产生的案例；（ii）由 LLM 合成、经人工评分、位于标准边界附近的样例，捕捉自然采样很少能暴露的困难案例；（iii）从我们的解释生成系统中采样的解释，采集于该系统完全接入服务流水线之前。

线上实验开始时，基准包含约 900 条人工标注的解释，两类标签接近均衡，fail 略占多数（约 54%）。我们有意让两类样本保持接近均衡，而不是匹配生成样本中的自然分布，因为在生成样本中失败要罕见得多。特异度（式 [1](https://arxiv.org/html/2608.18300v3#S5.E1)）、RA_neg（式 [3](https://arxiv.org/html/2608.18300v3#S5.E3)）以及算法 [1](https://arxiv.org/html/2608.18300v3#alg1) 的训练数据都依赖于人工判 fail 的样本。因此，正如第 II 阶段所报告的，§[5.2](https://arxiv.org/html/2608.18300v3#S5.SS2) 中的对齐指标衡量的是在这个类别均衡、难度增强的基准上的一致性，而不是真实流量上的缺陷率。

该数据集并非固定不变。第 IV 阶段的人在回路（HITL）流水线（§[7](https://arxiv.org/html/2608.18300v3#S7)）在测试期间每周追加约 300 条新近评分的解释，以跟踪线上片库的分布偏移。

## 5 第 II 阶段：训练，让评判器与人类对齐

我们为每条*必备*标准（§[4](https://arxiv.org/html/2608.18300v3#S4)）各调优一个评判器，共三个，利用自我反思、对照人工标签及其失败理由说明，迭代地精炼该标准的细则。我们把这一过程称为推理对齐的细则调优（RART）。RART 的一个关键组件强制要求 LLM 评判器与人工评审员之间的*推理对齐*。

### 5.1 推理对齐的细则调优（RART）

每个 LLM 评判器都从一个小巧的、与任务无关的提示词模板实例化而来。一条固定的系统消息描述评估任务，并带有一个模板化的 `<criterion>` 槽位，其中放置正在调优的细则；一条用户消息提供解释文本以及目标条目和参照条目的元数据。评判器为每条解释输出一个 JSON 对象 `{label, reason}`，因此调优就归结为在周围提示词保持不变的前提下精炼各标准的细则。

给定第 t 次迭代的细则 R_t，RART 按算法 [1](https://arxiv.org/html/2608.18300v3#alg1) 中的循环迭代。它用当前评判器 J(R_t) 给数据打分，检查验证指标以决定是否提前停止，否则就请一个反思器 LLM ℛ 根据评判器的错误提出精炼后的细则。关键在于，“错误”不仅仅是标错标签。在反思之前，一个*理由说明元评判器* ℳ 会取出评判器与人类*都*判为 *fail* 的样本，并把评判器的自由文本理由与人工理由说明进行比较（§[5.3](https://arxiv.org/html/2608.18300v3#S5.SS3)）。因此反思器瞄准两类错误：评判器标错的样本，以及一致 fail 但“判决正确、理由错误”的样本。我们用 ℓ_J(x)、ℓ_H(x) 表示评判器与人类在样本 x 上的标签，用 r_J(x)、r_H(x) 表示各自的理由。

**算法 1** 推理对齐的细则调优（Reasoning-Aligned Rubric Tuning）

```text
 1: Input:  initial rubric R_0; train/val/test sets 𝒟_tr, 𝒟_val, 𝒟_te; max iterations N
 2: Judges: rubric-conditioned judge J(R): x ↦ (ℓ_J, r_J)  (label, rationale);
            rationale meta-judge ℳ(r_J, r_H) → {agree, mismatch};
            reflector ℛ(R, focus) → R'  (revised rubric)
 3: Output: tuned rubric R*
 4: R* ← R_0; s* ← −∞
 5: for t = 0 to N−1 do
 6:   Score 𝒟_tr, 𝒟_val with J(R_t)                      ▷ each x gets (ℓ_J, r_J)
 7:   s ← weighted alignment metrics on 𝒟_val (§5.2)
 8:   if s > s* then
 9:     R* ← R_t; s* ← s
10:   end if
11:   if all metrics clear the per-criterion bound then
12:     break
13:   end if
14:   𝒳 ← {x : ℓ_J(x) ≠ ℓ_H(x)}                           ▷ label mismatches
15:   𝒩 ← {x : ℓ_J(x) = ℓ_H(x) = fail}                    ▷ agreed-fail (negative) examples
16:   𝒩_× ← {x ∈ 𝒩 : ℳ(r_J(x), r_H(x)) = mismatch}        ▷ agreed-fail but wrong reason
17:   focus ← 𝒳 ∪ 𝒩_×                                    ▷ label mismatch, or agreed-fail but wrong reason
18:   R_{t+1} ← ℛ(R_t, focus)                             ▷ sample candidate rubric
19: end for
20: return R*
```

### 5.2 对齐指标

我们使用在基准数据集上聚合的三个指标。记 ℓ_J(x)、ℓ_H(x) ∈ {pass, fail} 为评判器与人类在样本 x 上的标签。

特异度（*fail 召回率*）是评判器正确拒绝坏解释的比率。它是我们最关键的指标，因为漏过门控的坏解释会直接侵蚀会员的信任：

```text
Spec = |{x : ℓ_J(x) = fail, ℓ_H(x) = fail}| / |{x : ℓ_H(x) = fail}|                (1)
```

召回率（*pass 召回率*）是评判器正确放行好解释的比率。要保持解释的覆盖率高、修订成本低，同样需要高召回率：

```text
Rec = |{x : ℓ_J(x) = pass, ℓ_H(x) = pass}| / |{x : ℓ_H(x) = pass}|                 (2)
```

推理一致率（RA_neg）是在人工判 fail 的样本集合 ℱ = {x : ℓ_H(x) = fail} 中，评判器与人类不仅都拒绝该解释、而且在它*为何*失败上也达成一致的比例。分子被限制在*一致 fail* 集合 𝒩 = {x : ℓ_J(x) = ℓ_H(x) = fail} ⊆ ℱ 上，因为只有两个标签都是 fail 时推理才可能一致，而分母是整个 ℱ。是否一致由理由说明元评判器 ℳ 判定：

```text
RA_neg = |{x ∈ 𝒩 : ℳ(r_J(x), r_H(x)) = agree}| / |ℱ|                                (3)
```

在 RART 的细则*优化*过程中，我们把这三者合并成一个加权得分

```text
s = w_s · Spec + w_r · Rec + w_ra · RA_neg                                          (4)
```

我们给特异度的权重高于另外两项，w_s = 3 且 w_r = w_ra = 1，因为这两类错误在线上并不对称。逃过门控的坏解释会被展示给会员，而被拒绝的好解释只是被修订或丢弃（§[6.1](https://arxiv.org/html/2608.18300v3#S6.SS1)）。RA_neg 这一项还会额外偏向那些拒绝有正确理由支撑、而非出于巧合的细则。

### 5.3 推理对齐的自我反思

![图 2](https://arxiv.org/html/2608.18300v3/rart_vs_art_lift_bars.svg)

*图 2：在留出测试集上，RART（理由说明感知的反思）与 vanilla（仅标签的反思）相对默认细则的对齐指标提升，每条必备标准一个子图，n = 8 个随机种子，每个种子都重新打乱训练/验证/测试划分；柱状图为均值，误差棒为 ±std。所有量都是 Δ = 调优后 − 默认，因此为正表示改进。Δ（RART − vanilla）的显著性由双侧符号检验给出：† p < 0.10，∗ p < 0.05，∗∗ p < 0.01。*

把每一处分歧一视同仁地对待，忽视了不匹配在信息含量上的差异。评判器可能出于错误的理由在标签上达成一致，也可能在标签上不一致，但其理由说明却暴露出细则中一处真实存在的歧义。基于*元评判器*的思想（[Wu et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib7)），我们引入一个*推理元评判器* ℳ，它把评判器的理由与人工理由说明进行比较，并返回 `rationale_agreement` 或 `rationale_mismatch`。我们只在一致 fail 的样本上运行 ℳ，因为共同的“fail”标签之下仍可能隐藏着不同的理由。它找到的理由说明不匹配会与标签不匹配一起进入反思器的关注集合，而一致的部分保持原样，从而让细则保留评判器已经做对的东西。

把 ℳ 限制在一致 fail 的样本上，也是部署上的要求。在第 III 阶段（§[6](https://arxiv.org/html/2608.18300v3#S6)），同一个评判器是自我反思循环中的评论者，它的拒绝理由会成为生成器的修订指令，因此“判决正确但理由错误”的拒绝会传播出误导性的信号。与 Meta-Rewarding（[Wu et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib7)）的无监督元评判器不同，我们的元评判器以人工理由说明为依据。这一信号是 TextGrad（[Yuksekgonul et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib17)）、ACE（[Zhang et al., 2026](https://arxiv.org/html/2608.18300v3#bib.bib18)）和 GEPA（[Agrawal et al., 2026](https://arxiv.org/html/2608.18300v3#bib.bib21)）意义上的文本“梯度”，但它是在理由说明而非生成内容之上计算的，并且与从“被选中/被拒绝”样本对中合成细则的做法（[Liu et al., 2025](https://arxiv.org/html/2608.18300v3#bib.bib19)）互补。

#### 验证元评判器。

ℳ 既提供我们的推理一致性指标，也提供 RART 的训练信号，因此我们直接用人类来验证它。经过训练的评审员在 300 对一致 fail 的理由说明样本上独立标注了理由是否一致，ℳ 的判决与他们的判断在 98.6% 的情况下相符，这支持了把它同时用作评估指标和学习信号。

为了单独衡量推理信号的贡献，我们在三条必备标准上分别把 RART 与 *vanilla* 进行比较，后者是一个完全相同的循环，只是其反思器只看到标签不匹配（图 [2](https://arxiv.org/html/2608.18300v3#S5.F2)；8 个随机种子，留出测试集）。只要默认细则还留有提升空间，RART 在我们最重要的指标*特异度*上的改进就比 vanilla 更大。在标准 1 上，这伴随着召回率的代价，但这是可以接受的，因为被误拒的解释会重新进入修订循环（§[6.1](https://arxiv.org/html/2608.18300v3#S6.SS1)）并被重新生成，而触达会员的坏解释却无法召回。在标准 3 上，仅看标签的 vanilla 在每一次迭代中都让特异度和推理一致性崩塌。因此算法 [1](https://arxiv.org/html/2608.18300v3#alg1) 的最佳检查点规则基本上返回了默认细则，使其提升停留在 ≈ 0，而 RART 同时提升了这两个指标，甚至还略微改善了召回率。在标准 2 上，默认细则已经接近上限，两种方法难分伯仲。因此，推理对齐在有空间的地方有帮助，在没有空间的地方也不会造成伤害；而在全部三条必备标准上，默认细则留下的提升空间决定了 RART 能获得多少收益。

## 6 第 III 阶段：部署，让评判器投入工作

来自 §[5](https://arxiv.org/html/2608.18300v3#S5) 的调优后评判器，对每一条生成的解释承担两个线上角色。作为*门控*，它拒绝在可配置的标准子集上不通过的解释。作为自我反思修订循环中的*评论者*，它把被标记的解释退回给生成器。解释是按被推荐的条目生成的，而不是按（用户，条目）对生成；随后由一个在线个性化模型为每个（用户，条目）对挑选最合适的解释。因此一条解释可以被许多用户共享。

### 6.1 作为护栏的评判器与有界重试修订

在服务流水线中，每条解释都会经过一个带固定重试预算的*生成 → 评判 → 修订*循环。生成器以风格（它刻画了用户群组）、目标条目和参照条目为条件起草一条解释；调优后的评判器按 §[4](https://arxiv.org/html/2608.18300v3#S4) 的标准为它打分，对每条标准输出一个 pass/fail 标签和理由。如果所有标准都通过，该解释就被*投放*；如果任何一条不通过，评判器的理由就会被追加到生成器的提示词中并重新调用生成器，最多重试 K 次，K 次尝试后仍不通过的解释会被*丢弃*。我们用 k 表示重试序号，用 K 表示部署时的预算。对被标记的解释选择丢弃而非投放，是一种刻意的不对称。坏解释是信任风险（§[5.2](https://arxiv.org/html/2608.18300v3#S5.SS2)），而缺少一条解释只是放弃了一次机会。

#### 累计通过率与修订预算的关系。

图 [3](https://arxiv.org/html/2608.18300v3#S6.F3) 报告了在四个生成器模型上、n = 1000 条生成解释的样本中，评判器累计通过率随重试预算 k 的变化。通过率随 k 单调上升，因为评判器的自由文本理由会引导下一版草稿，但收益递减得很快。三个强生成器在 k = 3–4 时就已获得其可达提升的 ≥ 80%，这支持了采用一个较小的固定 K。修订只能部分挽救弱生成器（模型 3 即便在 k = 12 时仍低于 50%），因此 k = 0 通过率的持续下降意味着生成器一侧的回归，而不是评判器的漂移。我们用最强的模型部署 K = 3，它在限制单条解释成本的同时获得了大部分可达提升；在这一预算下，端到端流水线每周的推理成本为几千美元。

![图 3](https://arxiv.org/html/2608.18300v3/self-reflection-as-revision.jpg)

*图 3：在四个生成器模型上、n = 1000 条生成解释中，评判器累计通过率随修订预算 k 的变化。增益单调，但在 k ≈ 4 之后趋于平缓。最弱的生成器（模型 3）远低于其他模型。这表明由评判器引导的修订是在放大一个能力足够的生成器，而不是替代它。*

### 6.2 线上 A/B 评估

高的离线评判器–人类对齐度和低的判定缺陷率，是解释能让用户受益的*必要*条件，但不是*充分*条件。它们证明投放的解释达到了我们的质量标准，而不能证明有解释就会改善用户体验。为了直接检验后者，我们在移动端进行了一次大规模 A/B 测试，把经评判器对齐的解释流水线（§[5](https://arxiv.org/html/2608.18300v3#S5)–[6](https://arxiv.org/html/2608.18300v3#S6)）与无解释的对照组进行比较，覆盖数千万会员，为期五周。实验组使会员的观看向*新内容*（即会员此前未看过的影片）偏移，相对提升 +0.2%（p < 0.05），这与解释帮助会员发现陌生影片、而非只是强化已熟悉的观看行为相一致。我们还观察到*含成功播放的会话*相对增加 +0.3%（p < 0.05），表明会员在一次浏览会话中更常找到想看的东西，我们把它解读为浏览摩擦的降低。这些相对提升在绝对值上很小，但在我们的规模下对应着可观的总体效应，而且在这个界面上，功能级干预带来这种量级的变化被认为是有意义的。因此，经评判器对齐的解释不仅*符合质量要求*，而且*有用*。作为进一步的佐证，线上测试期间我们没有观察到用户主动发起的、与解释质量相关的投诉升级。

## 7 第 IV 阶段：监控，让评判器保持对齐

在部署时对齐良好的评判器不会一直保持对齐。片库会变化（新的类别、季节性内容），“高质量”本身的含义也可能演变。第 IV 阶段闭合了这个回路。每周我们从生成池中抽取约 300 条解释的样本用于 HITL 评估，按评判器的决策结果（*未经修订即投放*、*修订后投放*、*丢弃*）分层，并向最可能出现漂移的较新片库条目倾斜。分层方式逐周固定，因此相邻各周之间可比。人工评审员按 §[4](https://arxiv.org/html/2608.18300v3#S4) 的指南标注该样本。重新标注的样本驱动漂移检测，同时也被追加到训练/验证池中，让基准保持鲜活（即图 [1](https://arxiv.org/html/2608.18300v3#S3.F1) 中的*持续基准补充*），并经子采样以保持类别均衡。每条解释至少由三名评审员审核，我们取多数标签作为真值。这个评审小组既给了我们一个共识参照，也直接度量了评审员之间的分歧，而正是这种分歧为评判器设定了门槛。

对于 §[5.2](https://arxiv.org/html/2608.18300v3#S5.SS2) 中的每个对齐指标 M，我们在同一周样本上、对照同一个多数标签，分别给评判器和每位评审员打分。这样得到评判器的一个值 M(J)，以及一组按评审员计算的值 M(H) = {M(h_1), …, M(h_R)}，其中 R ≥ 3，其均值和标准差直接跨评审员计算。我们要求

```text
M(J) ≥ mean(M(H)) − 2 · sd(M(H))                                                    (5)
```

也就是说，评判器的得分不得低于评审员平均值以下两个标准差，其中标准差度量的是评审员彼此之间的分歧。任一指标跌出该区间都会触发一次*告警*。

式 [5](https://arxiv.org/html/2608.18300v3#S7.E5) 有意不采用固定阈值。更难的一周样本会加大人类之间的分歧，扩大 sd(M(H))，进而扩大接受区间，因此评判器不会因为人类同样觉得困难的样本而受罚。我们把这一准则既应用于完整的周样本，也单独应用于新增影片，因为片库偏移最先出现在那里，而在既有内容上校准的阈值在那里会失灵。要求在新影片上不出现退化，正是让这个回路成为偏移检测器而非普通回归测试的关键。

一次漂移事件会在补充后的基准上触发第 II 阶段的重新调优，新细则在部署前会被暂存在人工审核关卡之后，同时保留旧细则以便回滚。在大规模线上 A/B 测试（§[6.2](https://arxiv.org/html/2608.18300v3#S6.SS2)）期间抽取的每一周样本中，评判器在每个指标上（包括在新增影片上）都保持在人类区间之内，因此没有触发重新调优。但这个回路在未来仍然重要，因为片库、推荐算法和用户群体在持续变化，今天的一致性并不能说明明天的情况。

在聚合指标之外，每周的人工审核还反复暴露出一些单靠逐标准一致性得分不会标记出来的失败模式。有些是边界案例，其 pass/fail 取决于解释措辞的自信程度，而不是底层推荐的质量。有些集中在特定类型上，例如脱口秀专场的对比：两场专场共享表面标签，却处于截然不同的文化语境之中。第三类通过了每一条必备标准，读起来却仍然令人困惑或立意古怪。这些都未必会撼动一致性指标，但每一类都要求对细则本身做出修改。当某种模式反复出现时，我们的写作与审核专家会修订 §[4](https://arxiv.org/html/2608.18300v3#S4) 的标注指南，然后我们通过第 II 阶段、对照修订后的指南重新调优受影响的评判器。因为这些指南既是评审员的事实来源，也是评判器种子细则的事实来源，一次修订就能同时更新比较的两端。持续审核能暴露出定量漂移检测看不见的、定性的长尾问题，捕捉到细则本身正在浮现的缺口，而不只是相对于细则的退化。

## 8 经验总结

在大规模运行这一生命周期，让我们得到了三条预期可以迁移到其他上线 LLM 评判器团队的经验。第一，*先投资基准，再投资评判器*。一个规模适中、带理由说明标注的基准，比一个只有标签的大基准更有价值，因为正是理由说明让推理对齐的调优成为可能。第二，*一个调优好的评判器可以承担多个角色*。把它同时复用于门控和生成批评，能降低对齐成本并保持线上行为一致。第三，*从第一天起就规划监控*。推荐平台的条目与用户在不断演变，因此它的 LLM 评判器像任何终身智能体一样，必须被监控并重新调优。

## 9 局限与未来工作

### 9.1 局限

我们的评估有若干范围边界。全部结果都来自持续数月的受控实验，而非持续运营，因此我们无法说明这一生命周期在其所针对的年度尺度偏移下表现如何。A/B 测试（§[6.2](https://arxiv.org/html/2608.18300v3#S6.SS2)）只覆盖一个界面（移动端）和一类解释（基于相似性），因此我们不知道同样的生命周期和提升幅度是否能迁移到别处。它也只报告了我们认为与内容发现最相关的指标。RART 只对照了仅标签的消融版本做了验证，而没有对照 GEPA 或 TextGrad 等通用文本优化器。由漂移触发的重新调优路径尚未在线上触发过，因此其自动响应只在离线得到过验证。附录 [A](https://arxiv.org/html/2608.18300v3#A1) 涵盖其余内容。

### 9.2 未来工作

我们看到 RART 有四个自然的扩展方向。第一，把细则调优重新表述为*记忆管理*。一个大到无法一次反思完的基准可以分块消化，调优器把先前各块的推理整合进一个持久的草稿本，用来引导每次更新。这个草稿本就是一份*长期记忆*，第 IV 阶段新增的理由说明将增量地更新它，而不是触发一次完整的重新调优；再辅以按实例检索的少样本示例作为*短期记忆*。第二，在累积的理由说明上对评判器做推理微调，而由文本空间的细则优化负责在线适应。第三，把推理对齐的调优表述为 GEPA（[Agrawal et al., 2026](https://arxiv.org/html/2608.18300v3#bib.bib21)）风格的*反思式提示词进化*，RART 是它的一个贪心特例；一个帕累托池可以直接在我们的三个指标之间做权衡。第四，把评判器从评估者提升为*奖励模型*。经细则调优的评判器已经会输出理由和标签，这正是推理型奖励模型所需要的形态，而同样的工件可以用来对生成器做后训练，而不只是在推理时对它做门控和批评。在这里，§[5.2](https://arxiv.org/html/2608.18300v3#S5.SS2) 中的不对称性提示应采用一个*带约束*的目标，而不是加权得分 s（式 [4](https://arxiv.org/html/2608.18300v3#S5.E4)）：把每条必备标准作为约束固定在其工作点上，同时优化较软性的标准，而不是提前通过 w_s 把权衡固定下来。

## 参考文献

- Agrawal et al. (2026) L. A. Agrawal, S. Tan, D. Soylu, N. Ziems, R. Khare, K. Opsahl-Ong, A. Singhvi, H. Shandilya, M. J. Ryan, M. Jiang, C. Potts, K. Sen, A. G. Dimakis, I. Stoica, D. Klein, M. Zaharia, and O. Khattab GEPA: reflective prompt evolution can outperform reinforcement learning. In The Fourteenth International Conference on Learning Representations (ICLR), External Links: [Link](https://openreview.net/forum?id=RQm2KQTM5r)
- Fernando et al. (2024) C. Fernando, D. Banarse, H. Michalewski, S. Osindero, and T. Rocktäschel Promptbreeder: self-referential self-improvement via prompt evolution. In Proceedings of the 41st International Conference on Machine Learning (ICML), Proceedings of Machine Learning Research, Vol. 235, pp. 13481–13544. External Links: [Link](https://proceedings.mlr.press/v235/fernando24a.html)
- Guo et al. (2024) Q. Guo, R. Wang, J. Guo, B. Li, K. Song, X. Tan, G. Liu, J. Bian, and Y. Yang Connecting large language models with evolutionary algorithms yields powerful prompt optimizers. In The Twelfth International Conference on Learning Representations (ICLR), External Links: [Link](https://openreview.net/forum?id=ZG3RaNIsO8)
- Herlocker et al. (2000) J. L. Herlocker, J. A. Konstan, and J. Riedl Explaining collaborative filtering recommendations. In Proceedings of the 2000 ACM Conference on Computer Supported Cooperative Work (CSCW), New York, NY, USA, pp. 241–250. External Links: [Document](https://dx.doi.org/10.1145/358916.358995)
- Khattab et al. (2024) O. Khattab, A. Singhvi, P. Maheshwari, Z. Zhang, K. Santhanam, S. Vardhamanan, S. Haq, A. Sharma, T. T. Joshi, H. Moazam, H. Miller, M. Zaharia, and C. Potts DSPy: compiling declarative language model calls into state-of-the-art pipelines. In The Twelfth International Conference on Learning Representations (ICLR), External Links: [Link](https://openreview.net/forum?id=sY5N0zY5Od)
- Kim et al. (2024) S. Kim, J. Shin, Y. Cho, J. Jang, S. Longpre, H. Lee, S. Yun, S. Shin, S. Kim, J. Thorne, and M. Seo Prometheus: inducing fine-grained evaluation capability in language models. In The Twelfth International Conference on Learning Representations (ICLR), External Links: [Link](https://openreview.net/forum?id=8euJaTveKw)
- Lambert et al. (2025) N. Lambert, V. Pyatkin, J. Morrison, L. Miranda, B. Y. Lin, K. Chandu, N. Dziri, S. Kumar, T. Zick, Y. Choi, N. A. Smith, and H. Hajishirzi RewardBench: evaluating reward models for language modeling. In Findings of the Association for Computational Linguistics: NAACL 2025, L. Chiruzzo, A. Ritter, and L. Wang (Eds.), Albuquerque, New Mexico, pp. 1755–1797. External Links: [Document](https://dx.doi.org/10.18653/v1/2025.findings-naacl.96), [Link](https://aclanthology.org/2025.findings-naacl.96/)
- Liu et al. (2025) T. Liu, R. Xu, T. Yu, I. Hong, C. Yang, T. Zhao, and H. Wang OpenRubrics: towards scalable synthetic rubric generation for reward modeling and LLM alignment. External Links: 2510.07743, [Link](https://arxiv.org/abs/2510.07743)
- Liu et al. (2023) Y. Liu, D. Iter, Y. Xu, S. Wang, R. Xu, and C. Zhu G-Eval: NLG evaluation using GPT-4 with better human alignment. In Proceedings of the 2023 Conference on Empirical Methods in Natural Language Processing, H. Bouamor, J. Pino, and K. Bali (Eds.), Singapore, pp. 2511–2522. External Links: [Document](https://dx.doi.org/10.18653/v1/2023.emnlp-main.153), [Link](https://aclanthology.org/2023.emnlp-main.153/)
- Madaan et al. (2023) A. Madaan, N. Tandon, P. Gupta, S. Hallinan, L. Gao, S. Wiegreffe, U. Alon, N. Dziri, S. Prabhumoye, Y. Yang, S. Gupta, B. P. Majumder, K. Hermann, S. Welleck, A. Yazdanbakhsh, and P. Clark Self-Refine: iterative refinement with self-feedback. In Advances in Neural Information Processing Systems, Vol. 36, pp. 46534–46594. External Links: [Link](https://proceedings.neurips.cc/paper_files/paper/2023/hash/91edff07232fb1b55a505a9e9f6c0ff3-Abstract-Conference.html)
- Panickssery et al. (2024) A. Panickssery, S. R. Bowman, and S. Feng LLM evaluators recognize and favor their own generations. In Advances in Neural Information Processing Systems 37 (NeurIPS 2024), External Links: [Link](https://proceedings.neurips.cc/paper_files/paper/2024/hash/7f1f0218e45f5414c79c0679633e47bc-Abstract-Conference.html)
- Shinn et al. (2023) N. Shinn, F. Cassano, A. Gopinath, K. Narasimhan, and S. Yao Reflexion: language agents with verbal reinforcement learning. In Advances in Neural Information Processing Systems, Vol. 36, pp. 8634–8652. External Links: [Link](https://proceedings.neurips.cc/paper_files/paper/2023/hash/1b44b878bb782e6954cd888628510e90-Abstract-Conference.html)
- Tan et al. (2025) S. Tan, S. Zhuang, K. Montgomery, W. Y. Tang, A. Cuadron, C. Wang, R. A. Popa, and I. Stoica JudgeBench: a benchmark for evaluating LLM-based judges. In The Thirteenth International Conference on Learning Representations (ICLR), External Links: [Link](https://openreview.net/forum?id=G0dksFayVq)
- Tintarev and Masthoff (2007) N. Tintarev and J. Masthoff A survey of explanations in recommender systems. In 2007 IEEE 23rd International Conference on Data Engineering Workshop (ICDEW), pp. 801–810. External Links: [Document](https://dx.doi.org/10.1109/ICDEW.2007.4401070)
- Wang et al. (2024) P. Wang, L. Li, L. Chen, Z. Cai, D. Zhu, B. Lin, Y. Cao, Q. Liu, T. Liu, and Z. Sui Large language models are not fair evaluators. In Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers), L. Ku, A. Martins, and V. Srikumar (Eds.), Bangkok, Thailand, pp. 9440–9450. External Links: [Document](https://dx.doi.org/10.18653/v1/2024.acl-long.511), [Link](https://aclanthology.org/2024.acl-long.511/)
- Wu et al. (2025) T. Wu, W. Yuan, O. Golovneva, J. Xu, Y. Tian, J. Jiao, J. E. Weston, and S. Sukhbaatar Meta-rewarding language models: self-improving alignment with LLM-as-a-meta-judge. In Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing, C. Christodoulopoulos, T. Chakraborty, C. Rose, and V. Peng (Eds.), Suzhou, China, pp. 11537–11554. External Links: [Document](https://dx.doi.org/10.18653/v1/2025.emnlp-main.583), [Link](https://aclanthology.org/2025.emnlp-main.583/)
- Yuksekgonul et al. (2025) M. Yuksekgonul, F. Bianchi, J. Boen, S. Liu, P. Lu, Z. Huang, C. Guestrin, and J. Zou Optimizing generative AI by backpropagating language model feedback. Nature 639 (8055), pp. 609–616. External Links: [Document](https://dx.doi.org/10.1038/s41586-025-08661-4), [Link](https://www.nature.com/articles/s41586-025-08661-4)
- Zhang et al. (2026) Q. Zhang, C. Hu, S. Upasani, B. Ma, F. Hong, V. Kamanuru, J. Rainton, C. Wu, M. Ji, H. Li, U. Thakker, J. Zou, and K. Olukotun Agentic context engineering: evolving contexts for self-improving language models. In The Fourteenth International Conference on Learning Representations (ICLR), External Links: [Link](https://openreview.net/forum?id=eC4ygDs02R)
- Zhang and Chen (2020) Y. Zhang and X. Chen Explainable recommendation: a survey and new perspectives. Foundations and Trends in Information Retrieval 14 (1), pp. 1–101. External Links: [Document](https://dx.doi.org/10.1561/1500000066)
- Zheng et al. (2023) L. Zheng, W. Chiang, Y. Sheng, S. Zhuang, Z. Wu, Y. Zhuang, Z. Lin, Z. Li, D. Li, E. P. Xing, H. Zhang, J. E. Gonzalez, and I. Stoica Judging LLM-as-a-judge with MT-bench and chatbot arena. In Advances in Neural Information Processing Systems 36 (NeurIPS 2023) Datasets and Benchmarks Track, External Links: [Link](https://proceedings.neurips.cc/paper_files/paper/2023/hash/91f18a1287b398d378ef22505bf41832-Abstract-Datasets_and_Benchmarks.html)
- Zhu et al. (2025) L. Zhu, X. Wang, and X. Wang JudgeLM: fine-tuned large language models are scalable judges. In The Thirteenth International Conference on Learning Representations (ICLR), External Links: [Link](https://openreview.net/forum?id=xsELpEPn4A)

## 附录 A 其他局限

除 §[9.1](https://arxiv.org/html/2608.18300v3#S9.SS1) 中陈述的边界之外，还有三点补充说明。出于保密原因，我们隐去了若干系统细节，包括必备标准的具体定义以及生成器和评判器所用模型的身份。我们对元评判器的验证（§[5.3](https://arxiv.org/html/2608.18300v3#S5.SS3)）度量的是理由说明一致性分类上的吻合度，这比完整的解释评判更窄也更简单，因此不应被解读为主评判器能以相当的比率匹配人类判断的证据。最后，主评判器与理由说明元评判器 ℳ 建立在同一基础模型家族之上，因此它们的错误很可能相关；对 ℳ 的人工验证限制了这一担忧，但并未消除它。
