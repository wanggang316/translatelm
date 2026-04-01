---
title: "10 个 Claude Workflows，每周帮我节省 10+ 小时"
originalTitle: "10 Claude Workflows That Save Me 10+ Hours a Week."
date: 2026-04-01
originalUrl: https://x.com/zodchiii/status/2037091952328663230
lang: zh
---

我连续两周追踪了自己的 Claude 使用情况。每一项任务都记录了时间戳、节省的时间与手动完成相比的对比。

每周 11.4 小时。这意味着每个月你能拿回 45+ 小时，也就是整整 2 天——只靠浏览器标签页里的 10 个 Workflows。

这里的 **Workflow** 指的是一个可重复的 Prompt + 结构，你每次做同类任务时都会用到。它是一个你反复运行的系统：相同的输入格式、相同的输出格式、结果可预测。

那为什么还要花 3 小时去做一件 10 分钟就能自动化完成的事呢？

以下是我这个月用过的所有 Workflows——按节省时间排序 👇

**在开始之前，** 我在 Telegram 频道分享关于 AI 和 vibe coding 的每日笔记：[https://t.me/zodchixquant](https://t.me/zodchixquant)🧠

![](https://pbs.twimg.com/media/HEUjKSYbIAAyXfV.jpg)

## 准备工作

在介绍 Workflows 之前，先说一下我在用什么：就是 Claude 网页版 + Pro 订阅。

没有 API。没有终端里的 Claude Code，也没有自定义集成。

![](https://pbs.twimg.com/media/HEUubwbbYAEnEAw.jpg)

## 1. 研究：一切的开端

今年 2 月，我需要为一篇文章对比 6 个 MCP server 提供商。

以前的方法：打开 15 个标签页，浏览文档，把引用的内容复制粘贴到 Google Doc，试着理解它们，发现忘了一个提供商，再开更多标签页，被 Twitter 分心，2 小时后回来，文档还是乱的，还得重新整理（Twitter 这部分我说得对吧？）

现在我上传我的 rules.md，然后输入：

```markdown
Research [TOPIC].

Structure:
1. Executive summary (3 sentences max)
2. Key findings (top 5, ranked by impact)
3. What's missing: gaps in available info
4. Sources with URLs

If data is insufficient for any claim, say so.
Don't speculate. Don't pad.
```

让这个工作生效的关键一句是"If data is insufficient, say so."。没有这句话，Claude 会自信地编造数据。

使用示例：

[Video](https://video.twimg.com/amplify_video/2037088447878569984/vid/avc1/502x270/7G9klXQ-rpoBKl08.mp4?tag=21)

## 2. 内容研究：10 个来源，5 分钟提炼成一份简报

做内容时最耗时间的一直是在动笔之前处理所有信息。

一篇典型帖子需要阅读 5-10 个来源：GitHub READMEs、文档、Twitter 帖子、博客文章、更新日志。

手动阅读、高亮、交叉引用、提取真正重要的内容，以前每篇文章要花超过一个小时。

现在我把所有原始来源复制粘贴到 Claude，然后运行这个：

```markdown
Here are my sources on [TOPIC]:
[PASTE ALL RAW MATERIAL]

Extract:
1. The 5 facts that matter most for my audience 
 (builders, not consumers)
2. Anything that contradicts the common narrative
3. Specific numbers: stars, users, funding, benchmarks
4. One angle nobody else is covering

If two sources disagree, show me both sides.
Don't summarize fluff. Only signal.
```

## 3. GitHub Repo 分析：扫完 1000 个仓库不发疯

我的第一篇文章需要从 MAGI//ARCHIVE 扫描超过 1000 个仓库，挑选出 40 个值得介绍的。

手动做的话，每个仓库 3-5 分钟，总共需要 50+ 小时。

我改成导出仓库列表，批量喂给 Claude，然后运行这个：

```
Here's a list of GitHub repos with descriptions:
[PASTE BATCH]

For each repo, evaluate:
1. What it actually does (1 sentence, no marketing speak)
2. Traction signals: stars, recent commit activity, 
 contributor count
3. Category: agent framework / dev tool / MCP / 
 infrastructure / other
4. Worth featuring? Yes/No with one reason

Skip anything that's just a wrapper, a tutorial repo, 
or has no commits in 30+ days.
Sort the "Yes" picks by most interesting first.
```

Claude 每次处理 50-100 个仓库。

我仍然会亲自打开每个"Yes"的仓库去核实，但只需要检查大约 80 个，而不是 1000 个。

节省最多时间的筛选条件是"跳过 30 天以上没有 commit 的仓库"。

Trending 列表上有一半热门的仓库其实已经被废弃了。

## 4. 不用电子表格做数据分析

说实话，从高中计算机课开始我就讨厌电子表格。

但我经常需要分析内容指标、交易表现、互动模式这些。

以前的方法：导出 CSV，打开 Google Sheets，花 40 分钟写公式，发现一个错了，全部重来。

现在我直接上传文件：

```markdown
Analyze this data. I need:
1. Top 3 trends over time
2. Anything unusual or unexpected
3. Correlations between [COLUMN A] and [COLUMN B]

Table first, then a 2-paragraph summary explaining
what this means in plain English.
If the dataset is too small for a conclusion, say so.
```

## 5. 竞品分析

有时候偶然发现一个有趣的账号或项目，我以前会花一个小时翻完他们的内容、定位和受众。

现在我给 Claude 上下文，让它干活：

```
I'm analyzing [COMPETITOR/ACCOUNT].

Based on what you know + the data I'm providing:
1. Top 3 things they're doing well (be specific)
2. Gaps or weaknesses in their approach
3. What I can learn from them
4. How my positioning is different

About me: I write about AI tools, vibe coding, and 
crypto for builders. TG + X.

Don't say "they have a strong brand." Tell me WHY 
and what specifically makes it work.
```

关键是你要给 Claude 关于你自己的上下文，而不只是竞品的信息。否则你得到的是一份可以套用在任何人身上的通用 SWOT 分析。

## 6. 代码审查——发版之前

我经常 vibe code，用 AI 运行项目。意思是 Claude 写了大部分代码，我需要确认它不会出问题或者把 API keys 暴露给全世界。

```markdown
Review this code for:
- Security issues (exposed keys, injection, XSS)
- Logic errors and edge cases I might have missed
- Performance problems
- Anything that would make a senior dev uncomfortable

For each issue: severity (Critical/High/Medium/Low), 
exact location, why it matters, and the corrected code.

Be harsh. "Looks good overall" is not helpful.

[PASTE CODE]
```

"Be harsh"这个指令比你想象的更重要。

没有它，Claude 默认给出礼貌的反馈，比如"代码结构很好，也许可以考虑……"

有了它，你得到的是你真正需要的那种刻薄的代码审查者的能量。在刻薄这件事上，Claude 比你想象的在行多了。

## 7. 长内容 → 短内容（反向亦可）

如果你同时运营多个社交媒体账号（X、Telegram、Instagram 等等）。

你就知道在每个平台发同样的内容、同时为每个平台写不同的东西有多痛苦。

```
Here's my article: [PASTE OR UPLOAD]

Create:
1. A 2-sentence hook for X (include a specific 
 number or claim from the article)
2. A 4-paragraph TG post with the key insight
3. A provocative quote-tweet caption (1 sentence)
4. 3 standalone insights that work as separate 
 tweets throughout the week

Each piece must work independently. Someone who 
never read the article should still get value.
```

我那篇 GitHub 热门仓库文章变成了：1 条 TG 公告、3 条分散在一周内的独立推文、2 条 quote-tweet 字幕，还有帖子开头。

> [Tweet](https://twitter.com/i/status/2034924354337714642)

一个 Prompt，10 分钟编辑。以前要 2 小时。

这个方法反向也适用，说实话这是我最好的一些内容的来源。我会把一周内的 5-6 条短 TG 帖子全部粘贴进去，让 Claude 找到贯穿其中的线索，起草一篇文章大纲。

只是个想法。

## 8. 不像机器人写的邮件

如果你的工作涉及写邮件，你懂那种感觉：花 15 分钟纠结一个 4 句话邮件的语气。太正式听起来像机器人，太随意听起来不专业。

这个 Workflow 解决这个问题：

```
Draft an email.
To: [NAME + how I know them]
Goal: [WHAT I WANT THEM TO DO]
Tone: professional but sounds like a real person
Max: 5 sentences
Context: [THE SITUATION]

Does not sound like: a cold pitch template, 
corporate speak, or something ChatGPT would write.
No "I hope this email finds you well."
```

"does not sound like ChatGPT"这个指令是关键。没有它，你每次都会得到经典的 AI 邮件开头。

有了它，Claude 写出来的东西读起来像一个尊重收件人时间的大忙人。

## 9. 每日早间简报

每天早上，同样的流程。咖啡，打开 Claude，一个 Prompt：

```
3-minute briefing:
1. Top 3 AI news from last 24 hours (one sentence each)
2. Crypto: major moves, liquidations, new narratives
3. Anything I should know before posting content today

Be specific: names, numbers, links.
Skip anything that isn't genuinely important.
3 real updates > 10 filler items.
```

这取代了每天早上刷 45 分钟 X"来保持信息更新"。

刷信息流的问题是你看到的是新闻和 drama、表情包、互动诱饵、20 分钟的兔子洞混在一起。

Claude 给你信号，没有噪音。

它完美吗？不是。有时候它会漏掉东西，尤其是最近一小时内的突发新闻。但它能捕捉到 80% 重要的事情，而且我拿回了我的早晨。

剩下那 20% 我在一天中自然地从群聊和通知里也能看到。

## 10. 周回顾：投资回报率最高的 Workflow

每个周日晚上，我把一周里的所有东西都丢给 Claude。笔记、书签、半成品的想法、截图、存了但忘了的任何东西：

```
Here are my notes and ideas from this week:
[PASTE EVERYTHING]

Help me:
1. Find patterns: what topics am I gravitating toward?
2. Which 3 ideas have the most content potential?
3. What am I ignoring that I shouldn't be?
4. Content plan for next week: 3 TG posts + 1 article topic

Be honest. If an idea is weak, say so.
Don't tell me everything is great.
```

在这里 Claude 不再只是一个工具，开始变成一个思维伙伴。它能看到你自己的各种想法之间的联系，而因为你离自己的作品太近，这些联系你反而看不到。

周日 30 分钟。省下的是整个星期不知道该写什么的数小时。

这是我用 Claude 做的投资回报率最高的事。

## 算笔账

以下是完整的分解。我追踪了两周然后取平均值：

```
Workflow Before After Saved/week
─────────────────────────────────────────────────────
Research 2 hrs 15 min 1 hr 45 min
Content Research 4 hrs 1.5 hrs 2 hrs 30 min
Github Repo Analysis 1.5 hrs 20 min 1 hr 10 min
Data analysis 2 hrs 20 min 1 hr 40 min
Competitor analysis 1 hr 15 min 45 min
Code review 2 hr 15 min 1 45 min
Content repurposing 2 hrs 20 min 1 hr 40 min
Email 30 min 5 min 25 min
Morning briefing 45 min 5 min 40 min
Weekly review 1 hr 30 min 30 min
─────────────────────────────────────────────────────
TOTAL ~13 hrs/week
```

每周 13 小时。每月 52 小时。这相当于每个月多拿回一整个工作周。

需要说明的是：这些数字是我的。你的情况取决于你做什么以及你当前工作流里有多少摩擦。

但即使你只采用其中的 3-4 个，你每周大概也能拿回 5+ 小时。这不是小数目。

![](https://pbs.twimg.com/media/HEUrhxRbYAANDbf.jpg)

## 真正改变了什么

从追踪这一切中我学到的最重要的事，不是关于 Claude 或 Prompting，而是我的时间实际上都去哪儿了。

我把大多数称为"工作"的东西，实际上是上下文切换。

打开标签页、重新阅读、被打断后重新进入状态、做那些感觉有产出但实际上没有推动任何事情前进的任务。

思考和编辑仍然是我的。关于写什么、交易什么、发布什么的决定。

但初稿、研究、整理格式、初步分析。这些东西现在几分钟就搞定，而不是几个小时，而且它让我腾出精力去专注那些真正需要人脑的部分。

说"AI 做不了我的工作"的人通常是对的。但 AI 大概能完成你工作中 60% 的周边事务。而那 60% 正是所有浪费时间的地方。

更多关于 AI、crypto 和 vibe coding 的笔记在我的 TG：https://t.me/zodchixquant 🧠

![](https://pbs.twimg.com/media/HEUr0rWbYAEZZZq.jpg)
