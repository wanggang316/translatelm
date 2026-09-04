---
title: "Harness 设计手册"
originalTitle: "The Harness Playbook"
date: 2026-09-04
originalUrl: https://stencil.so/blog/harness-playbook
lang: zh
---

*开篇先说一声谢谢。数十万人用过 omp，报告了哪里坏了，提出了缺什么，并塑造了它最终的模样。这篇文章，以及 omp² 本身，都因你们而存在。*

听说 omp² 的消息后，很多人脱口而出：“可是，为什么？”

一个套着 fetch 的 while 循环听起来很简单，但 OpenCode、Pi、OpenClaw 和 omp 同时都在做彻底重构，这是有原因的：这类软件此前并不存在，只有先从简单版本做起，我们才能看见裂缝，进而朝更好的版本迈进。

无法避免的复杂度需要有人来承担。眼下，[复杂度守恒](https://en.wikipedia.org/wiki/Law_of_conservation_of_complexity)的天平倾向了扩展和用户那一侧，导致根本无法在 omp 或 Pi 之上写出可靠的软件。我已经能听到有人喊：*“什么？它扩展起来明明这么简单、这么舒服。”* 给我几章的篇幅，让我来改变你的看法。

Dijkstra 写过[“简单是可靠的先决条件”](https://www.cs.virginia.edu/~evans/cs655/readings/ewd498.html)，然而他成名的事迹却是用算法解决寻路问题。为什么不直接暴力搜索呢？他丝毫没有在主张我们如今反复念叨的那句**简单即好，复杂即坏**。那条建议本是为了帮助实现者思考，我们却可耻地拿它当借口，让实现者免于思考。

Ousterhout 在他斯坦福课程的讲义里补上了缺失的另一半。他告诉模块作者要[“拥抱苦难”](https://web.stanford.edu/~ouster/cgi-bin/cs190-spring16/lecture.php?topic=modularDesign)：接下难题，彻底解决，再让结果对其他所有人都易于使用。把复杂度往下压进模块里。让少数几个实现者来背负它，而不是让每个调用方各自背负一份更小、又略有不同的副本。

---

我相信很多读者还记得那条把 Claude Code 比作游戏引擎的推文所引发的一波梗图。这个类比听起来有些牵强，但如果你把 harness 的职责逐条列出来，撇开渲染不谈，两者确实对得相当整齐。

它维护一个权威的世界，把变更记入日志（journal），执行不受信任的动作，把状态复制到多个视图，调度各类 actor，解释命令，适配互不兼容的协议，还要渲染一个实时界面。

听着耳熟？看来游戏引擎已经花了几十年时间，承担着同样这几类复杂度。

接下来的内容既是一份复盘，也是一本手册：

- **omp 教会我们的**：点出我们在一个真正被人使用的系统里遭遇的故障。
- **omp² 的改变**：描述替代架构，其中一部分已经建成，另一部分仍在推进。

1. [设计包络](#the-design-envelope)
2. [状态](#the-state)
3. [运行时](#the-runtime)
4. [控制平面](#the-control-plane)
5. [推理](#the-inference)
6. [工具面](#the-tool-surface)
7. [界面](#the-interface)
8. [技术栈](#the-stack)
9. [结语](#closing-notes)
10. [官方示例中的状态故障](#appendix-a-state-failures-in-the-official-examples)
11. [弹性推测槽（Elastic Speculative Slots）](#appendix-b-elastic-speculative-slots)

## 设计包络

在讨论智能体 harness 的任何子系统之前，先设想有四个截然不同的产品将依赖于它：

- **多路复用工作区** *一个本地环境，多个智能体与子代理在同一个文件夹里工作。*
- **远程驾驶者** *一个远程客户端，用手机驱动云端智能体，或者驱动自己桌子底下的那台机器。*
- **旁观者** *一个 Web 客户端，观看一个 Claude 智能体工作。*
- **Factorio** *一个自动化软件工厂，用 SDK 处理不受信任的输入。*

这些不是市场营销里的用户画像，而是架构测试。它们合在一起，在那些让 harness 不再只是一个聊天循环的维度上各不相同：

| 测试 | 本地还是远程 | 交互式还是自主式 | 信任边界 | 并发 |
| --- | --- | --- | --- | --- |
| 多路复用工作区 | 本地 | 交互式 | 基本受信任 | 多个智能体，一个工作区 |
| 远程驾驶者 | 远程 | 交互式 | 宿主/客户端分离 | 一个或多个智能体 |
| 旁观者 | 远程视图 | 观察式 | 不受信任的展示层输入 | 多个观看者 |
| Factorio | 远程或集群 | 自主式 | 有敌意的仓库与工具输入 | 多个任务 |

只能应付第一种情况的设计，往往会把控制器偷偷塞进 TUI，把状态存在闭包里，让扩展在引擎进程内执行，并假定总有人类能从一次无界的调用中收拾残局。能在全部四种情况下存活的设计，则被迫划出更好的边界。

全文余下的部分沿着五条推论展开：

1. **唯一的权威会话。** 回退、分叉、恢复、复制与检视，都必须派生自同一份记入日志的状态。
2. **受信任的控制平面。** 策略与会话所有权留在宿主上；沙箱只接收有界的执行请求。
3. **有界的工作。** 工具调用、子代理与后台任务都是可取消的流，受中央限额约束并具备可观测性。
4. **显式的兼容性。** 模型与提供商的怪癖是结构化的知识，而不是散落在各个调用点的分支。
5. **视图即投影。** TUI、Web 客户端、远程客户端与子代理检视器渲染的是同一份状态，而不是各自成为额外的权威来源。

这些约束是贯穿后文一切内容的结缔组织。当后面的章节提出一个 DOM、一个 convar、一个 Director、一个微型 VM 存根（stub）或一个组件渲染器时，它都是在解决这五条要求之一，而不是为了炫技而引入一个巧妙的子系统。

第一条要求是根基：在决定代码在哪里运行、如何渲染之前，harness 得先知道什么才是真的。

## 状态

### 什么必须留存

如果你想让某样东西持久、可回退、耐崩溃、可分叉，你有三种选择：

1. 保存产生它的历史。
2. 保存你关心的那些属性的变更。
3. 保存机器本身。

![“你得序列化状态”梗图，三格：事件溯源（哭泣的 wojak 被事件淹没，回放一切）、增量快照（淡定的 wojak 对比两份属性快照）、以及 gigachad 溯源（直接 diff WASM 内存，恢复整台机器）。](https://stencil.so/blog/harness-playbook/state-sourcing-meme.webp)

Source 引擎在网络同步上用的是第二种选择的一个变体。omp 和 Pi 目前用的是……哪一种都没有贯彻到底。事件是有的，但状态并不真正源自这些事件，这违反了事件溯源的第一原则：**状态必须仅凭事件就能推导出来**。

### omp 教会我们的：两个权威来源

<figure data-hk="000000010000000000004000010a43"><div data-hk="000000010000000000004000010a440" role="img" aria-label="Side-by-side comparison: CS:GO's Source Engine has one authority — the entity list — whose deltas cover every field, so replaying the .dem file reproduces the original session. Pi has two authorities: the journaled message tree, and a pile of authoritative-but-underived state (todo, retry counters, subagent registry, extension closures) that no delta covers, so replaying the .jsonl does not reproduce the session."><svg id="state-authorities-0" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="max-width: 679.64453125px;" viewBox="0 0 679.64453125 1778.4000244140625" role="graphics-document document" aria-roledescription="flowchart-v2"><g><marker id="state-authorities-0_flowchart-v2-pointEnd" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="state-authorities-0_flowchart-v2-pointStart" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="state-authorities-0_flowchart-v2-pointEnd-margin" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" style="stroke-width: 0; stroke-dasharray: 1, 0;"></path></marker><marker id="state-authorities-0_flowchart-v2-pointStart-margin" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" style="stroke-width: 0; stroke-dasharray: 1, 0;"></polygon></marker><marker id="state-authorities-0_flowchart-v2-circleEnd" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-authorities-0_flowchart-v2-circleStart" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-authorities-0_flowchart-v2-circleEnd-margin" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-authorities-0_flowchart-v2-circleStart-margin" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-authorities-0_flowchart-v2-crossEnd" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="state-authorities-0_flowchart-v2-crossStart" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="state-authorities-0_flowchart-v2-crossEnd-margin" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5;"></path></marker><marker id="state-authorities-0_flowchart-v2-crossStart-margin" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"></path></marker><g><g></g><g><path d="M339.822,836.2L339.822,836.2L339.822,862.2L339.822,862.2L339.822,888.2" id="state-authorities-0-L_CSGO_PI_0" style=";" data-edge="true" data-et="edge" data-id="L_CSGO_PI_0" data-points="W3sieCI6MzM5LjgyMjI2NTYyNSwieSI6ODM2LjIwMDAxMjIwNzAzMTJ9LHsieCI6MzM5LjgyMjI2NTYyNSwieSI6ODYyLjIwMDAxMjIwNzAzMTJ9LHsieCI6MzM5LjgyMjI2NTYyNSwieSI6ODg4LjIwMDAxMjIwNzAzMTJ9XQ==" data-look="classic"></path></g><g><g><g data-id="L_CSGO_PI_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g></g><g><g transform="translate(0, 880.2000122070312)"><g><g id="state-authorities-0-PI" data-look="classic"><rect style="" x="8" y="8" width="663.64453125" height="882.2000007629395"></rect><g transform="translate(271.712890625, 8)"><g><rect style="stroke: none"></rect><text y="-10.1" style=""><tspan x="0" y="-0.1em" dy="1.1em"><tspan font-style="normal" font-weight="normal">π</tspan><tspan font-style="normal" font-weight="normal"> ·</tspan><tspan font-style="normal" font-weight="normal"> two</tspan><tspan font-style="normal" font-weight="normal"> authorities</tspan></tspan></text></g></g></g></g><g><path d="M273.908,186.5L328.23,186.5L328.23,240.6L398.495,240.6L398.495,294.7" id="state-authorities-0-L_P_PRIVATE_P_CHANGE_0" style="stroke:#ef4444;stroke-width:3px;color:#f87171;fill:none;;;stroke:#ef4444;stroke-width:3px;color:#f87171;fill:none" data-edge="true" data-et="edge" data-id="L_P_PRIVATE_P_CHANGE_0" data-points="W3sieCI6MjczLjkwODQxMjIyODU0NTY3LCJ5IjoxODYuNX0seyJ4IjozMjguMjMwNDY4NzUsInkiOjI0MC42MDAwMDAzODE0Njk3M30seyJ4IjozOTguNDk0NTgwODI3MTc0MzMsInkiOjI5NC43MDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-crossEnd__ef4444)"></path><path d="M523.844,159.5L523.844,159.5L523.844,240.6L496.279,240.6L496.279,291.188" id="state-authorities-0-L_P_TRUTH_P_CHANGE_0" style=";" data-edge="true" data-et="edge" data-id="L_P_TRUTH_P_CHANGE_0" data-points="W3sieCI6NTIzLjg0Mzc1LCJ5IjoxNTkuNX0seyJ4Ijo1MjMuODQzNzUsInkiOjI0MC42MDAwMDAzODE0Njk3M30seyJ4Ijo0OTQuMzY1MzY4NjU0MDE4NzcsInkiOjI5NC43MDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M466.031,398.7L466.031,398.7L466.031,437.2L466.031,437.2L466.031,471.7" id="state-authorities-0-L_P_CHANGE_P_DISK_0" style=";" data-edge="true" data-et="edge" data-id="L_P_CHANGE_P_DISK_0" data-points="W3sieCI6NDY2LjAzMTI1LCJ5IjozOTguNzAwMDAwNzYyOTM5NDV9LHsieCI6NDY2LjAzMTI1LCJ5Ijo0MzcuMjAwMDAwNzYyOTM5NDV9LHsieCI6NDY2LjAzMTI1LCJ5Ijo0NzUuNzAwMDAwNzYyOTM5NDV9XQ==" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M466.031,543.7L466.031,543.7L466.031,582.2L466.031,582.2L466.031,616.7" id="state-authorities-0-L_P_DISK_P_REPLAY_0" style=";" data-edge="true" data-et="edge" data-id="L_P_DISK_P_REPLAY_0" data-points="W3sieCI6NDY2LjAzMTI1LCJ5Ijo1NDMuNzAwMDAwNzYyOTM5NX0seyJ4Ijo0NjYuMDMxMjUsInkiOjU4Mi4yMDAwMDA3NjI5Mzk1fSx7IngiOjQ2Ni4wMzEyNSwieSI6NjIwLjcwMDAwMDc2MjkzOTV9XQ==" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M466.031,688.7L466.031,688.7L466.031,727.2L410.514,727.2L410.514,763.511" id="state-authorities-0-L_P_REPLAY_P_RESULT_0" style=";" data-edge="true" data-et="edge" data-id="L_P_REPLAY_P_RESULT_0" data-points="W3sieCI6NDY2LjAzMTI1LCJ5Ijo2ODguNzAwMDAwNzYyOTM5NX0seyJ4Ijo0NjYuMDMxMjUsInkiOjcyNy4yMDAwMDA3NjI5Mzk1fSx7IngiOjQwNy4xNjY2OTg2MTk2MzE5LCJ5Ijo3NjUuNzAwMDAwNzYyOTM5NX1d" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M171.011,186.5L145.809,186.5L145.809,240.6L145.809,240.6L145.809,346.7L145.809,346.7L145.809,437.2L145.809,437.2L145.809,509.7L145.809,509.7L145.809,582.2L145.809,582.2L145.809,654.7L145.809,654.7L145.809,727.2L234.523,727.2L234.523,764.162" id="state-authorities-0-L_P_PRIVATE_P_RESULT_0" style="stroke:#ef4444;stroke-width:4px;color:#f87171;fill:none;;;stroke:#ef4444;stroke-width:4px;color:#f87171;fill:none" data-edge="true" data-et="edge" data-id="L_P_PRIVATE_P_RESULT_0" data-points="W3sieCI6MTcxLjAxMTMwMzM1ODY5OTgyLCJ5IjoxODYuNX0seyJ4IjoxNDUuODA4NTkzNzUsInkiOjI0MC42MDAwMDAzODE0Njk3M30seyJ4IjoxNDUuODA4NTkzNzUsInkiOjM0Ni43MDAwMDA3NjI5Mzk0NX0seyJ4IjoxNDUuODA4NTkzNzUsInkiOjQzNy4yMDAwMDA3NjI5Mzk0NX0seyJ4IjoxNDUuODA4NTkzNzUsInkiOjUwOS43MDAwMDA3NjI5Mzk0NX0seyJ4IjoxNDUuODA4NTkzNzUsInkiOjU4Mi4yMDAwMDA3NjI5Mzk1fSx7IngiOjE0NS44MDg1OTM3NSwieSI6NjU0LjcwMDAwMDc2MjkzOTV9LHsieCI6MTQ1LjgwODU5Mzc1LCJ5Ijo3MjcuMjAwMDAwNzYyOTM5NX0seyJ4IjoyMzguMjE0ODY3NzE0NzIzOTQsInkiOjc2NS43MDAwMDA3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd__ef4444)"></path></g><g><g transform="translate(328.23046875, 240.60000038146973)"><g data-id="L_P_PRIVATE_P_CHANGE_0" transform="translate(0, -14.600001335144043)"><g><rect style="color:#f87171 !important" x="-95.625" y="-0.9999990463256836" width="191.25" height="31.200000762939453"></rect><text y="-10.1" text-anchor="middle" style="fill:#f87171 !important"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">1</tspan><tspan font-style="normal" font-weight="normal"> ·</tspan><tspan font-style="normal" font-weight="normal"> never</tspan><tspan font-style="normal" font-weight="normal"> a</tspan><tspan font-style="normal" font-weight="normal"> delta</tspan><tspan font-style="normal" font-weight="normal"> —</tspan><tspan font-style="normal" font-weight="normal"> but</tspan><tspan font-style="normal" font-weight="normal"> it</tspan></tspan><tspan x="0" y="1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">IS</tspan><tspan font-style="normal" font-weight="normal"> state</tspan></tspan></text></g></g></g><g><g data-id="L_P_TRUTH_P_CHANGE_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_P_CHANGE_P_DISK_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_P_DISK_P_REPLAY_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_P_REPLAY_P_RESULT_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(145.80859375, 509.70000076293945)"><g data-id="L_P_PRIVATE_P_RESULT_0" transform="translate(0, -8.000000953674316)"><g><rect style="color:#f87171 !important" x="-95.6171875" y="-0.9999990463256836" width="191.234375" height="18"></rect><text y="-10.1" text-anchor="middle" style="fill:#f87171 !important"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">2</tspan><tspan font-style="normal" font-weight="normal"> ·</tspan><tspan font-style="normal" font-weight="normal"> rewind</tspan><tspan font-style="normal" font-weight="normal"> cannot</tspan><tspan font-style="normal" font-weight="normal"> reach</tspan><tspan font-style="normal" font-weight="normal"> it</tspan></tspan></text></g></g></g></g><g><g id="state-authorities-0-flowchart-P_PRIVATE-16" data-look="classic" transform="translate(203.62109375, 116.5)"><rect style="fill:#ef444440 !important;stroke:#ef4444 !important;stroke-width:2px !important" x="-132" y="-70" width="264" height="140"></rect><g style="" transform="translate(-100, -54)"><rect></rect><foreignObject width="200" height="108"><p><span></span></p><p>OUTSIDE THE TREE<br>todo · retry · subagents · streaming<br>closures · prompts · tools · settings · MCP<br><b>authoritative, not derived</b></p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-P_CHANGE-18" data-look="classic" transform="translate(466.03125, 346.70000076293945)"><rect style="fill:#f59e0b40 !important;stroke:#f59e0b !important;stroke-width:2px !important" x="-132" y="-52" width="264" height="104"></rect><g style="" transform="translate(-100, -36)"><rect></rect><foreignObject width="200" height="72"><p><span></span></p><p>UNIT OF CHANGE<br><b>message · custom · custom_message</b><br>covers the tree only</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-P_TRUTH-17" data-look="classic" transform="translate(523.84375, 116.5)"><rect style="fill:#2563eb40 !important;stroke:#3b82f6 !important;stroke-width:2px !important" x="-107.6015625" y="-43" width="215.203125" height="86"></rect><g style="" transform="translate(-75.6015625, -27)"><rect></rect><foreignObject width="151.203125" height="54"><p><span></span></p><p>SOURCE OF TRUTH<br><b>message tree</b><br>ids and messages only</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-P_DISK-19" data-look="classic" transform="translate(466.03125, 509.70000076293945)"><rect style="fill:#8b5cf640 !important;stroke:#8b5cf6 !important;stroke-width:2px !important" x="-125.6015625" y="-34" width="251.203125" height="68"></rect><g style="" transform="translate(-93.6015625, -18)"><rect></rect><foreignObject width="187.203125" height="36"><p><span></span></p><p>ON DISK · <b>.jsonl</b><br>the tree, and nothing else</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-P_REPLAY-20" data-look="classic" transform="translate(466.03125, 654.7000007629395)"><rect style="fill:#22c55e40 !important;stroke:#22c55e !important;stroke-width:2px !important" x="-93.203125" y="-34" width="186.40625" height="68"></rect><g style="" transform="translate(-61.203125, -18)"><rect></rect><foreignObject width="122.40625" height="36"><p><span></span></p><p>REPLAY<br><b>move leaf pointer</b></p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-P_RESULT-21" data-look="classic" transform="translate(341.421875, 808.7000007629395)"><rect style="fill:#ef4444 !important;stroke:#fca5a5 !important;stroke-width:3px !important" x="-132" y="-43" width="264" height="86"></rect><g style="color:#fff !important" transform="translate(-100, -27)"><rect></rect><foreignObject width="200" height="54"><p><span style="color:#fff !important"></span></p><p><b>replay(.jsonl) ≠ original</b><br>rewind · fork · resume all lie</p><p></p></foreignObject></g></g></g></g><g transform="translate(21.822265625, 0)"><g><g id="state-authorities-0-CSGO" data-look="classic"><rect style="" x="8" y="8" width="620" height="828.2000007629395"></rect><g transform="translate(202.7890625, 8)"><g><rect style="stroke: none"></rect><text y="-10.1" style=""><tspan x="0" y="-0.1em" dy="1.1em"><tspan font-style="normal" font-weight="normal">Source</tspan><tspan font-style="normal" font-weight="normal"> engine</tspan><tspan font-style="normal" font-weight="normal"> ·</tspan><tspan font-style="normal" font-weight="normal"> single</tspan><tspan font-style="normal" font-weight="normal"> authority</tspan></tspan></text></g></g></g></g><g><path d="M168,150.5L168,150.5L168,204.6L251.574,204.6L251.574,258.7" id="state-authorities-0-L_C_PRED_C_CHANGE_0" style=";" data-edge="true" data-et="edge" data-id="L_C_PRED_C_CHANGE_0" data-points="W3sieCI6MTY4LCJ5IjoxNTAuNX0seyJ4IjoxNjgsInkiOjIwNC42MDAwMDAzODE0Njk3M30seyJ4IjoyNTEuNTczNjM1Njg4MzU4ODgsInkiOjI1OC43MDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-crossEnd)"></path><path d="M468,150.5L468,150.5L468,204.6L387.784,204.6L387.784,256.526" id="state-authorities-0-L_C_TRUTH_C_CHANGE_0" style=";" data-edge="true" data-et="edge" data-id="L_C_TRUTH_C_CHANGE_0" data-points="W3sieCI6NDY4LCJ5IjoxNTAuNX0seyJ4Ijo0NjgsInkiOjIwNC42MDAwMDAzODE0Njk3M30seyJ4IjozODQuNDI2MzY0MzExNjQxMSwieSI6MjU4LjcwMDAwMDc2MjkzOTQ1fV0=" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M318,344.7L318,344.7L318,383.2L318,383.2L318,417.7" id="state-authorities-0-L_C_CHANGE_C_DISK_0" style=";" data-edge="true" data-et="edge" data-id="L_C_CHANGE_C_DISK_0" data-points="W3sieCI6MzE4LCJ5IjozNDQuNzAwMDAwNzYyOTM5NDV9LHsieCI6MzE4LCJ5IjozODMuMjAwMDAwNzYyOTM5NDV9LHsieCI6MzE4LCJ5Ijo0MjEuNzAwMDAwNzYyOTM5NDV9XQ==" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M318,489.7L318,489.7L318,528.2L318,528.2L318,562.7" id="state-authorities-0-L_C_DISK_C_REPLAY_0" style=";" data-edge="true" data-et="edge" data-id="L_C_DISK_C_REPLAY_0" data-points="W3sieCI6MzE4LCJ5Ijo0ODkuNzAwMDAwNzYyOTM5NDV9LHsieCI6MzE4LCJ5Ijo1MjguMjAwMDAwNzYyOTM5NX0seyJ4IjozMTgsInkiOjU2Ni43MDAwMDA3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path><path d="M318,634.7L318,634.7L318,673.2L318,673.2L318,707.7" id="state-authorities-0-L_C_REPLAY_C_RESULT_0" style=";" data-edge="true" data-et="edge" data-id="L_C_REPLAY_C_RESULT_0" data-points="W3sieCI6MzE4LCJ5Ijo2MzQuNzAwMDAwNzYyOTM5NX0seyJ4IjozMTgsInkiOjY3My4yMDAwMDA3NjI5Mzk1fSx7IngiOjMxOCwieSI6NzExLjcwMDAwMDc2MjkzOTV9XQ==" data-look="classic" marker-end="url(#state-authorities-0_flowchart-v2-pointEnd)"></path></g><g><g transform="translate(168, 204.60000038146973)"><g data-id="L_C_PRED_C_CHANGE_0" transform="translate(0, -14.600001335144043)"><g><rect style="" x="-99.21875" y="-0.9999990463256836" width="198.4375" height="31.200000762939453"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">never</tspan><tspan font-style="normal" font-weight="normal"> a</tspan><tspan font-style="normal" font-weight="normal"> delta</tspan><tspan font-style="normal" font-weight="normal"> —</tspan><tspan font-style="normal" font-weight="normal"> fine,</tspan><tspan font-style="normal" font-weight="normal"> it</tspan><tspan font-style="normal" font-weight="normal"> is</tspan></tspan><tspan x="0" y="1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">derived</tspan></tspan></text></g></g></g><g><g data-id="L_C_TRUTH_C_CHANGE_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_C_CHANGE_C_DISK_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_C_DISK_C_REPLAY_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_C_REPLAY_C_RESULT_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g></g><g><g id="state-authorities-0-flowchart-C_PRED-0" data-look="classic" transform="translate(168, 98.5)"><rect style="fill:#64748b40 !important;stroke:#94a3b8 !important" x="-132" y="-52" width="264" height="104"></rect><g style="" transform="translate(-100, -36)"><rect></rect><foreignObject width="200" height="72"><p><span></span></p><p>OUTSIDE THE ENTITY LIST<br>client prediction<br><b>derived, never authoritative</b></p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-C_CHANGE-2" data-look="classic" transform="translate(318, 301.70000076293945)"><rect style="fill:#f59e0b40 !important;stroke:#f59e0b !important;stroke-width:2px !important" x="-96.8046875" y="-43" width="193.609375" height="86"></rect><g style="" transform="translate(-64.8046875, -27)"><rect></rect><foreignObject width="129.609375" height="54"><p><span></span></p><p>UNIT OF CHANGE<br><b>{ Δ entity … }</b><br>covers every field</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-C_TRUTH-1" data-look="classic" transform="translate(468, 98.5)"><rect style="fill:#2563eb40 !important;stroke:#3b82f6 !important;stroke-width:2px !important" x="-132" y="-52" width="264" height="104"></rect><g style="" transform="translate(-100, -36)"><rect></rect><foreignObject width="200" height="72"><p><span></span></p><p>SOURCE OF TRUTH<br><b>entity list</b><br>rules · plugins · globals — all of it</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-C_DISK-3" data-look="classic" transform="translate(318, 455.70000076293945)"><rect style="fill:#8b5cf640 !important;stroke:#8b5cf6 !important;stroke-width:2px !important" x="-89.6015625" y="-34" width="179.203125" height="68"></rect><g style="" transform="translate(-57.6015625, -18)"><rect></rect><foreignObject width="115.203125" height="36"><p><span></span></p><p>ON DISK · <b>.dem</b><br>all of the state</p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-C_REPLAY-4" data-look="classic" transform="translate(318, 600.7000007629395)"><rect style="fill:#22c55e40 !important;stroke:#22c55e !important;stroke-width:2px !important" x="-104" y="-34" width="208" height="68"></rect><g style="" transform="translate(-72, -18)"><rect></rect><foreignObject width="144" height="36"><p><span></span></p><p>REPLAY<br><b>seek tick, re-derive</b></p><p></p></foreignObject></g></g><g id="state-authorities-0-flowchart-C_RESULT-5" data-look="classic" transform="translate(318, 754.7000007629395)"><rect style="fill:#22c55e40 !important;stroke:#22c55e !important;stroke-width:2px !important" x="-132" y="-43" width="264" height="86"></rect><g style="" transform="translate(-100, -27)"><rect></rect><foreignObject width="200" height="54"><p><span></span></p><p><b>replay(.dem) == original</b><br>nothing outside left to leak</p><p></p></foreignObject></g></g></g></g></g></g><marker id="state-authorities-0_flowchart-v2-crossEnd__ef4444" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;" stroke="#ef4444"></path></marker><marker id="state-authorities-0_flowchart-v2-pointEnd__ef4444" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" style="stroke-width: 1; stroke-dasharray: 1, 0;" stroke="#ef4444" fill="#ef4444"></path></marker></g><defs><filter id="state-authorities-0-drop-shadow" height="130%" width="130%"><fedropshadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><defs><filter id="state-authorities-0-drop-shadow-small" height="150%" width="150%"><fedropshadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><linearGradient id="state-authorities-0-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2A2A35" stop-opacity="1"></stop><stop offset="100%" stop-color="#44CFFF" stop-opacity="1"></stop></linearGradient></svg></div><figcaption>One authority versus two: everything in Source is an entity delta, so <code>replay(.dem) == original</code>. Pi's journal covers the message tree only, while authoritative state lives outside it—rewind, fork, and resume all lie.</figcaption></figure>

走到这一步，原因是可以理解的。在每条日志里重复系统提示词和 `AGENTS.md` 会很浪费；这可以通过对模板做哈希并只存储其变量来解决。而且这种状态建模风格在 TypeScript 里并不常见，毕竟 TypeScript 实际上并没有运行时类型。

然而，结果依然是两个事实来源：

| | Source 引擎 | Pi 风格的 harness |
| --- | --- | --- |
| **事实来源** | `entity list`，仅此而已。服务器负责模拟；客户端负责预测。 | 消息树**外加** todo 状态、重试计数器、子代理注册表、流式传输标志，以及其他对持久化不可见的状态 |
| **Δ 的单位** | `{ Δ entity ... }`，覆盖每一个字段，因为每个增量都是实体增量 | `message` / `custom` / `custom_message`，没有引擎自有的折叠（fold）逻辑；每个扩展都各自手搓推导 |
| **全局状态** | `CCSGameRules` 是一个单例**实体**。没有特殊情况。 | 三个层级，其中一个能用 |
| **插件状态** | 插件写入实体字段，所以状态默认就会被网络同步和回放 | 模块级闭包：`let turnCount = 0`、`new Map()`、`new Set()` |
| **回放** | 加载 `.dem`，定位到某个 tick，重新推导 | 加载 `.jsonl`；叶子指针在移动，而其他权威来源要么被重置，要么随意地存活下来 |

“全局状态”这一行是好玩的地方。Source 没有会话级全局状态；它们不过是某个实体的属性。而我们的全局状态自有一套层级：

<figure data-hk="000000010000000000004000010a49"><div data-hk="000000010000000000004000010a500" role="img" aria-label="Decision tree for where a session-global fact lives in omp: journaled tree entries (three blessed types, replays correctly), journalable custom entries (every extension hand-rolls its own derive, roughly fifteen lifecycle bugs), or not journaled at all (AGENTS.md, extension set, tool roster, settings, provider config, MCP servers — cannot branch, cannot rewind)."><svg id="state-globals-0" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="max-width: 1030px;" viewBox="0 0 1030 625.2000122070312" role="graphics-document document" aria-roledescription="flowchart-v2"><g><marker id="state-globals-0_flowchart-v2-pointEnd" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="state-globals-0_flowchart-v2-pointStart" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="state-globals-0_flowchart-v2-pointEnd-margin" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" style="stroke-width: 0; stroke-dasharray: 1, 0;"></path></marker><marker id="state-globals-0_flowchart-v2-pointStart-margin" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" style="stroke-width: 0; stroke-dasharray: 1, 0;"></polygon></marker><marker id="state-globals-0_flowchart-v2-circleEnd" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-globals-0_flowchart-v2-circleStart" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-globals-0_flowchart-v2-circleEnd-margin" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-globals-0_flowchart-v2-circleStart-margin" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="state-globals-0_flowchart-v2-crossEnd" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="state-globals-0_flowchart-v2-crossStart" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="state-globals-0_flowchart-v2-crossEnd-margin" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5;"></path></marker><marker id="state-globals-0_flowchart-v2-crossStart-margin" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"></path></marker><g><g></g><g><path d="M364.442,162.442L140,162.442L140,279.6L140,279.6L140,317.2" id="state-globals-0-L_Q_A_0" style=";" data-edge="true" data-et="edge" data-id="L_Q_A_0" data-points="W3sieCI6MzY0LjQ0MTUyNDM3MzI0NDE0LCJ5IjoxNjIuNDQxNTI0MzczMjQ0MTR9LHsieCI6MTQwLCJ5IjoyNzkuNjAwMDAwMzgxNDY5N30seyJ4IjoxNDAsInkiOjMyMS4yMDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-globals-0_flowchart-v2-pointEnd)"></path><path d="M440,238L440,238L440,279.6L440,279.6L440,317.2" id="state-globals-0-L_Q_B_0" style=";" data-edge="true" data-et="edge" data-id="L_Q_B_0" data-points="W3sieCI6NDQwLCJ5IjoyMzh9LHsieCI6NDQwLCJ5IjoyNzkuNjAwMDAwMzgxNDY5N30seyJ4Ijo0NDAsInkiOjMyMS4yMDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-globals-0_flowchart-v2-pointEnd)"></path><path d="M515.558,162.442L740,162.442L740,279.6L740,279.6L740,317.2" id="state-globals-0-L_Q_C_0" style=";" data-edge="true" data-et="edge" data-id="L_Q_C_0" data-points="W3sieCI6NTE1LjU1ODQ3NTYyNjc1NTksInkiOjE2Mi40NDE1MjQzNzMyNDQxNH0seyJ4Ijo3NDAsInkiOjI3OS42MDAwMDAzODE0Njk3fSx7IngiOjc0MCwieSI6MzIxLjIwMDAwMDc2MjkzOTQ1fV0=" data-look="classic" marker-end="url(#state-globals-0_flowchart-v2-pointEnd)"></path><path d="M634.828,443.2L590,443.2L590,469.2L590,469.2L590,500.2" id="state-globals-0-L_C_C1_0" style=";" data-edge="true" data-et="edge" data-id="L_C_C1_0" data-points="W3sieCI6NjM0LjgyNzU4NjIwNjg5NjUsInkiOjQ0My4yMDAwMDA3NjI5Mzk0NX0seyJ4Ijo1OTAsInkiOjQ2OS4yMDAwMDA3NjI5Mzk0NX0seyJ4Ijo1OTAsInkiOjUwNC4yMDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-globals-0_flowchart-v2-pointEnd)"></path><path d="M845.172,443.2L890,443.2L890,469.2L890,469.2L890,491.2" id="state-globals-0-L_C_C2_0" style=";" data-edge="true" data-et="edge" data-id="L_C_C2_0" data-points="W3sieCI6ODQ1LjE3MjQxMzc5MzEwMzUsInkiOjQ0My4yMDAwMDA3NjI5Mzk0NX0seyJ4Ijo4OTAsInkiOjQ2OS4yMDAwMDA3NjI5Mzk0NX0seyJ4Ijo4OTAsInkiOjQ5NS4yMDAwMDA3NjI5Mzk0NX1d" data-look="classic" marker-end="url(#state-globals-0_flowchart-v2-pointEnd)"></path></g><g><g transform="translate(140, 279.6000003814697)"><g data-id="L_Q_A_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-92.015625" y="-0.9999990463256836" width="184.03125" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">journaled</tspan><tspan font-style="normal" font-weight="normal"> as</tspan><tspan font-style="normal" font-weight="normal"> tree</tspan><tspan font-style="normal" font-weight="normal"> entries</tspan></tspan></text></g></g></g><g transform="translate(440, 279.6000003814697)"><g data-id="L_Q_B_0" transform="translate(0, -14.600001335144043)"><g><rect style="" x="-81.2109375" y="-0.9999990463256836" width="162.421875" height="31.200000762939453"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">journalable</tspan><tspan font-style="normal" font-weight="normal"> via</tspan><tspan font-style="normal" font-weight="normal"> custom</tspan></tspan><tspan x="0" y="1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">entries</tspan></tspan></text></g></g></g><g transform="translate(740, 279.6000003814697)"><g data-id="L_Q_C_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-74.015625" y="-0.9999990463256836" width="148.03125" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">not</tspan><tspan font-style="normal" font-weight="normal"> journaled</tspan><tspan font-style="normal" font-weight="normal"> at</tspan><tspan font-style="normal" font-weight="normal"> all</tspan></tspan></text></g></g></g><g><g data-id="L_C_C1_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_C_C2_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g></g><g><g id="state-globals-0-flowchart-Q-0" data-look="classic" transform="translate(440, 123)"><polygon points="115,0 230,-115 115,-230 0,-115" transform="translate(-114.5, 115)" style="fill:#2563eb40 !important;stroke:#3b82f6 !important;stroke-width:2px !important"></polygon><g style="" transform="translate(-90, -9)"><rect></rect><foreignObject width="180" height="18"><p><span></span></p><p>is this fact in the tree?</p><p></p></foreignObject></g></g><g id="state-globals-0-flowchart-A-2" data-look="classic" transform="translate(140, 382.20000076293945)"><rect style="fill:#22c55e40 !important;stroke:#22c55e !important;stroke-width:2px !important" x="-132" y="-61" width="264" height="122"></rect><g style="" transform="translate(-100, -45)"><rect></rect><foreignObject width="200" height="90"><p><span></span></p><p>A ✓ the blessed ~3<br>model_change · thinking_level_change<br>session_info · label<br>replays correctly</p><p></p></foreignObject></g></g><g id="state-globals-0-flowchart-B-4" data-look="classic" transform="translate(440, 382.20000076293945)"><rect style="fill:#f59e0b40 !important;stroke:#f59e0b !important;stroke-width:2px !important" x="-132" y="-61" width="264" height="122"></rect><g style="" transform="translate(-100, -45)"><rect></rect><foreignObject width="200" height="90"><p><span></span></p><p>B ~ hand-rolled<br>every extension writes its own derive<br>≈15 lifecycle bugs, see below</p><p></p></foreignObject></g></g><g id="state-globals-0-flowchart-C-6" data-look="classic" transform="translate(740, 382.20000076293945)"><rect style="fill:#ef444440 !important;stroke:#ef4444 !important;stroke-width:2px !important" x="-132" y="-61" width="264" height="122"></rect><g style="" transform="translate(-100, -45)"><rect></rect><foreignObject width="200" height="90"><p><span></span></p><p>C ✗ outside history<br>AGENTS.md · extension set · tool roster<br>settings · provider config · MCP servers</p><p></p></foreignObject></g></g><g id="state-globals-0-flowchart-C1-8" data-look="classic" transform="translate(590, 556.2000007629395)"><rect style="fill:#ef444440 !important;stroke:#ef4444 !important;stroke-width:2px !important" x="-132" y="-52" width="264" height="104"></rect><g style="" transform="translate(-100, -36)"><rect></rect><foreignObject width="200" height="72"><p><span></span></p><p>edit AGENTS.md → the replay uses today's copy.<br>the session you recorded is gone.</p><p></p></foreignObject></g></g><g id="state-globals-0-flowchart-C2-10" data-look="classic" transform="translate(890, 556.2000007629395)"><rect style="fill:#ef444440 !important;stroke:#ef4444 !important;stroke-width:2px !important" x="-132" y="-61" width="264" height="122"></rect><g style="" transform="translate(-100, -45)"><rect></rect><foreignObject width="200" height="90"><p><span></span></p><p>header line = (version, id, timestamp, cwd)<br>no parentid → not in the tree →<br>can't branch, can't rewind</p><p></p></foreignObject></g></g></g></g></g><defs><filter id="state-globals-0-drop-shadow" height="130%" width="130%"><fedropshadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><defs><filter id="state-globals-0-drop-shadow-small" height="150%" width="150%"><fedropshadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><linearGradient id="state-globals-0-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2A2A35" stop-opacity="1"></stop><stop offset="100%" stop-color="#44CFFF" stop-opacity="1"></stop></linearGradient></svg></div><figcaption>The three tiers of session globals, one of which works.</figcaption></figure>

Source 的正确性并非来自写一个精心设计的调和器（reconciler）或者优秀的文档。它让不可回放的状态*无法被表示*。**正确性来自这一约束**，而不是指望每个扩展作者都记得注册两个钩子（hook）、再定义一个更新的形状。

### 证据：在 API 里，正确性是可选项

我们查看了 78 个官方 Pi 扩展示例。其中 60 个是无状态的；在 17 个带状态的示例里，只有两个是正确的。

| 示例 | 逃出权威之外的状态 | 用户可见的故障 |
| --- | --- | --- |
| `git-checkpoint.ts` | 检查点引用由一个临时的 `Map` 持有 | `/fork` 在 `agent_settled` 已经清掉检查点之后才运行 |
| `plan-mode/index.ts` | 计划模式从整个文件恢复，而不是从选中的分支 | 回退后限制仍然生效；恢复可能复活一条已死的分支 |
| `status-line.ts` | 轮次计数放在闭包里 | 从第 3 轮回退到第 1 轮会得到第 4 轮；恢复后从零开始 |
| `dynamic-tools.ts` | 活跃的扩展注册表 | 工具在回退后还在，恢复后却消失了 |
| `snake.ts` | 恢复时会扫描已放弃的分支 | 一条已死分支上的存档回来了 |
| `bookmark.ts` | “最后一条”指的是文件顺序上的最后一条 | 已放弃分支上一条隐藏的助手消息被加了书签 |
| `kimi-deferred-tools.ts` | 活跃工具清单没有被重新推导 | `Calculator` 在其被发现的时间点之前就已处于活跃状态 |
| `auto-commit-on-exit.ts` | 关闭逻辑把进程退出和会话切换混为一谈 | `/new`、`/resume` 或 `/fork` 都会提交 worktree |
| `tic-tac-toe.ts` | 实时写入与恢复读取使用不同的条目类型 | 一次崩溃就能让用户的落子消失 |

细节见[附录 A](#appendix-a-state-failures-in-the-official-examples)，但重点在于：写文档并不能修复这样一种 bug 分布。引擎需要让状态只能存在于唯一一处。

[tic-tac-toe.ts：下一步 X，在 O 回应之前崩溃，恢复，X 没了。实时写入与恢复读取使用不同的条目类型。](https://stencil.so/blog/harness-playbook/bugs/tic-tac-toe.mp4)

### omp² 的改变：一个物化的会话

如果整个会话物化为**一个 DOM** 会怎样？当然，你也可以用带序列化的 ECS 系统，或者任何你想要的表示格式；我选择 XML 主要是因为它让状态非常容易组合、检视和调试。

```
<meta>
   <todo>…</todo>          <!-- persistent components, journal-derived -->
   <jobs>…</jobs>
</meta>
<body>                     <!-- the live chain, entries as elements -->
   <user id="e12">…</user>
   <ai id="e13">…</ai>
   <Read id="e14" status="ok">
      <input path="src/main.rs:1-80"/>
      <result lines="80">…</result>
   </Read>
</body>
<queues>
   <steering>...</steering>
   <prompts>...</prompts>
</queues>
```

它的事件是一条属性变更流：

```
: todo.done
event: patch@1
by: e41
data: {"ops":[["set",412,"status","completed"],["set",415,"status","in_progress"]]}
```

这棵树就是权威；日志存储它的增量变更。运行时对象可以缓存或索引它，但它们不会成为事实栖身的第二个地方。在日志的任何一个点上，harness 都能物化整个会话，从而也就能对它做快照。

### 唯一权威换来了什么

状态与对话记录（transcript）同在一棵树里，好几个难题就归结为同一种操作。

**回退就是一次 DOM diff。** 把当前的物化结果与目标状态做 diff。一个 `<subagent>` 元素消失了？销毁该元素，从而终止它。一个元素出现了？创建该元素，从而恢复或派生它。这份差异本身就是完整的生命周期工作清单。

> 新增一个带状态的功能，永远不会给回退、分叉、恢复或复制多添一个调用点。

**提示词成为投影。** 不再有一个 100 行的状态对象被塞进每一个模板。系统提示词读取的是和其他一切相同的那棵树：

```sql
- {{ count(select("todo item[status!=completed]")) }} open items
```

**复制成为订阅。** 我们已经有了变更的应用逻辑和推导逻辑。远程客户端消费补丁流，而不是 tail 一个文件。远程驾驶者和旁观者这两种情况不再需要单独的状态管道。

**渲染成为投影。** 组件注册表可以从同一份元素状态渲染 `Read`、`Bash`、一条消息或一个子代理。流式传入的参数修改 `<input>`；流式产出的输出修改 `<result>`。第七章会把它做成一个类型化的接口，而不是又一个手工定制的渲染器。

### 控制器与 actor

这种分离也让子代理变得可检视。Pi 的视图直接读取实时会话状态（页脚会调用 `sessionManager.getEntries()`），因此要加上“检视子代理”的功能，就意味着得把控制器状态一路穿过 UI 内部传递过去。

让控制器和 actor 彻底分离：控制器拥有会话状态；actor 只渲染它的快照和补丁流。TUI、远程客户端和子代理检视器于是成了平级的同类。检视一个子代理，就是把同一个 actor 指向那个子代理的状态。

一个真实可信的状态模型是根基，但如果由不受信任的代码掌握着修改它的策略，这个根基仍然会被掏空。下一章将划出运行时的边界。

## 运行时

“状态”一章确立了 harness 所相信的东西。“运行时”一章则要决定谁有权改变它、不受信任的工作在哪里运行，以及当执行可能持续数小时、不断流式输出、或者对一句礼貌的停止请求置之不理时，“工具调用”到底意味着什么。

### 沙箱只管执行，不做决策

先从设计包络里的 *Factorio* 用例说起。假设我们克隆一份 roboomp，让 gpt spark 把所有提到它名字的地方都换成 CodeWhatever，然后开始靠这套“神奇技术”向人收取几千块。谁来运行工具？废话，当然是 VM。才怪。

把执行器放进 VM 后会发生什么呢：

<figure data-hk="000000010000000000004000010a82"><svg data-hk="000000010000000000004000010a8300" viewBox="0 0 1000 560" role="img" aria-label="Hand-drawn sketch titled 'tools are complicated': a trusted driver harness on one side of a trust boundary, an untrusted VM on the other, and four tools — todo, file read/write, image-gen, py-eval — whose state, secrets, and outputs land on conflicting sides once programmatic tool usage enters the picture." font-family="var(--st-font-sketch)"><defs><pattern id="exec-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="560" fill="#121419"></rect><rect width="1000" height="560" fill="url(#exec-dots)"></rect><text data-hk="000000010000000000004000010a830100" x="305" y="50" font-size="30" fill="#DBD8CF" text-anchor="middle" letter-spacing="2" stroke="#DBD8CF" stroke-width="0.8">TOOLS ARE COMPLICATED</text><path data-hk="000000010000000000004000010a830110" d="M61.5 62.8C207.9 65.3 432.8 60.1 550.6 61.1M60.4 61.8C251.8 59.8 429.8 65.1 548.8 62.8" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a83020" x="136.5" y="81.5" width="212" height="79" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a83021" d="M134.1 80.5C220.1 79.1 287.8 83.6 351.3 80.5M132.3 79.2C232.6 78.9 304.1 80.9 349.8 78.9M350.5 77.6C348.3 113.9 350.2 135.2 351.2 161M348.9 78.2C349.9 105.9 349.5 148.2 349.2 163.4M351.6 161.2C252.3 162.6 194.5 163.8 133.8 161.3M351.5 161.6C246.9 161.2 184.3 159.7 133.4 162.4M133.7 162.2C134.1 124 133.4 99.6 136.5 78.2M134.5 163.6C133.5 131.4 134.4 99.6 136.3 79.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a83030" x="155" y="131" font-size="26" fill="#DBD8CF">DRIVER</text><g data-hk="000000010000000000004000010a8304" transform="translate(316 125) scale(1.35) translate(-316 -125)"><ellipse data-hk="000000010000000000004000010a830500" cx="316" cy="125" rx="13" ry="13" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a830501" d="M327.2 129.4Q325.6 133.7 320.8 136Q316 138.3 311.5 136.3Q307 134.2 304.7 129.6Q302.5 125 304.4 120.4Q306.4 115.8 311.2 114Q316 112.3 320.8 113.9Q325.7 115.5 327.3 120.3Q328.8 125 327.2 129.4M326.7 129.4Q324.7 133.9 320.4 135.8Q316 137.7 311.1 136.1Q306.3 134.5 304.7 129.7Q303 125 305.3 120.6Q307.5 116.3 311.8 113.7Q316 111.1 320.3 113.1Q324.7 115.1 326.7 120.1Q328.7 125 326.7 129.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830510" d="M320.2 126Q319.5 127.1 317.8 128Q316 128.9 314.8 128.6Q313.5 128.3 312.6 126.7Q311.6 125 312.2 123.3Q312.8 121.5 314.4 120.9Q316 120.3 317.7 120.9Q319.4 121.5 320.2 123.2Q320.9 125 320.2 126M319.7 126.5Q319.1 128 317.5 128.4Q316 128.8 314.3 128.1Q312.7 127.3 312.4 126.1Q312.1 125 312.5 123.4Q312.9 121.9 314.4 121.6Q316 121.4 317.5 121.6Q318.9 121.9 319.7 123.4Q320.4 125 319.7 126.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830520" d="M316.4 121.2C315.7 117.5 316.3 114.3 316.2 113.5M316 120.8C316.5 118 316.2 114.2 315.5 113.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830530" d="M312.3 126.5C309 128.3 307.8 129.4 305.8 131M312.9 126.7C309.2 128.2 307 130.3 305.1 130.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830540" d="M320 127.6C322.1 128.9 324.3 129.9 326.6 130.9M319.8 126.6C323.1 129 323.8 129.6 326.2 131.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path></g><text data-hk="000000010000000000004000010a83060" x="137" y="193" font-size="19" fill="#DBD8CF">trusted harness</text><path data-hk="000000010000000000004000010a83070" d="M499 73.5C498.9 120.1 498 150.3 498.8 167M499.3 72.9C500.6 111.9 501.7 149.2 499.6 167.6" fill="none" stroke="#DBD8CF" stroke-width="4" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a83080" x="500" y="192" font-size="18" fill="#DBD8CF" text-anchor="middle">trust</text><text data-hk="000000010000000000004000010a83090" x="500" y="216" font-size="18" fill="#DBD8CF" text-anchor="middle">boundary</text><path data-hk="000000010000000000004000010a830a100" d="M350.8 123.6Q430.9 111.2 482.4 112.2Q533.9 113.3 574.9 117.5L615.9 121.8M352.9 123.8Q429.9 112 482.5 112.6Q535.2 113.2 574.6 118.1L614 122.9M615.3 122.9C612.1 123.9 607 125.4 604.3 125.8M614.7 123C609.9 124.4 607.1 124.9 604.6 125.9M615.2 123.1C612.2 121.7 608.9 119.1 605.3 117.5M615.2 123.1C610.7 119.7 608.3 118.8 605.9 117.2" fill="none" stroke="#DBD8CF" stroke-width="2.2" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a830a110" x="621.5" y="79.5" width="157" height="79" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a830a111" d="M620 76.5C676.4 77.1 751.7 75.3 782.2 77M618.1 78.7C691.2 76.8 739.9 76.1 780.6 78.4M780.5 75.1C781.3 107.8 780.3 135.1 779.8 160.6M780.8 77.7C778.7 103.3 778.9 141.6 780.2 162.4M780.6 161.2C728.4 162.1 641.2 158 619.2 160.2M782.4 160.8C699.9 161.1 658.2 159.4 618.9 158.8M619.9 161.8C620.6 133.1 621 94.9 619.9 78.4M619.2 160.7C621.3 131.7 622.2 92.5 618.5 77.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a120" x="649" y="131" font-size="27" fill="#DBD8CF">VM</text><path data-hk="000000010000000000004000010a830a130" d="M734.8 124.7Q746.2 139.5 755.2 119.8L764.1 100.1M734.4 123.6Q745.1 138.9 753.8 120.2L762.5 101.5" fill="none" stroke="#4ADE80" stroke-width="3.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a140" x="623" y="191" font-size="17" fill="#DBD8CF">untrusted: code exec,</text><text data-hk="000000010000000000004000010a830a150" x="760" y="215" font-size="17" fill="#DBD8CF">web content</text><text data-hk="000000010000000000004000010a830a160" x="55" y="257" font-size="20" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8">WHERE DOES EACH TOOL LIVE?</text><text data-hk="000000010000000000004000010a830a170" x="60" y="301" font-size="21" fill="#DBD8CF">1) TODO</text><path data-hk="000000010000000000004000010a830a180" d="M719.6 283.5Q519.8 284.8 434.6 284.4Q349.4 284.1 283.1 283.4L216.9 282.8M719.8 283.8Q520.1 284 434.6 283.8Q349.1 283.5 283.5 283.4L218 283.3M217.8 284C222.6 282 226 280.4 227.7 279.4M218 284.2C221.4 282.5 224.5 281.4 228.3 279.3M218 283.9C221.8 285.4 224.3 287 228 288.7M218 284.3C223.2 286.1 225.4 287.6 228 288.5" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a190" x="735" y="291" font-size="19" fill="#DBD8CF">harness state</text><text data-hk="000000010000000000004000010a830a200" x="60" y="347" font-size="21" fill="#DBD8CF">2) FILE R/W</text><path data-hk="000000010000000000004000010a830a210" d="M287.4 330.2Q479.4 331.2 532.5 324.3Q585.5 317.4 652.4 317.4L719.2 317.4M286.1 329.1Q479.5 330.8 532.2 323.8Q584.9 316.9 652.8 317.5L720.6 318.1M719.7 318.3C717 319.8 712.5 321.4 709.7 322.7M720.3 317.8C715.9 319.4 712.7 321 710.3 322.8M719.8 318.3C715.3 315.5 712.1 314.6 709.7 313.7M720.2 317.7C715.3 316.2 713.4 315 710.1 313.6M287.2 330.3C291.4 328.1 294.4 326.6 297.1 325.5M286.8 330.4C290.9 328.3 294.5 326.7 297.1 325.7M287 330.1C291.6 332.1 295 333.9 297.4 334.3M287 329.9C290 331.6 295.1 333.3 296.7 334.3" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a220" x="735" y="338" font-size="19" fill="#DBD8CF">which side?</text><text data-hk="000000010000000000004000010a830a230" x="60" y="394" font-size="21" fill="#DBD8CF">3) IMAGE-GEN</text><g data-hk="000000010000000000004000010a830a24" transform="translate(306 374) scale(-1.35 1.35) translate(-306 -374)"><ellipse data-hk="000000010000000000004000010a830a2500" cx="306" cy="374" rx="5" ry="5" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a830a2501" d="M309.7 375.5Q308.8 377 307.4 377.6Q306 378.3 304.6 378.2Q303.1 378.2 302.1 376.1Q301 374 301.4 371.9Q301.9 369.7 303.9 369.8Q306 369.8 308.1 369.9Q310.3 369.9 310.4 372Q310.6 374 309.7 375.5M310.7 375.7Q309.8 377.4 307.9 378Q306 378.7 304 378.1Q301.9 377.6 300.9 375.8Q299.9 374 301.5 372.3Q303.1 370.6 304.6 370.3Q306 370.1 307.9 370.2Q309.7 370.3 310.6 372.1Q311.6 374 310.7 375.7" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2510" d="M311.2 378.4C315.8 382.3 322.3 390.5 326.9 392.7M309.2 379.5C316.5 383 321.6 389.6 328.4 393.3" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2520" d="M319.5 389.4C318.1 391.1 316.4 392.6 315 393.5M318.6 389.1C317.4 391.2 315.3 393.9 314.5 394.2" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2530" d="M323.7 393.1C322.3 394.6 320.7 397.2 320.4 398.6M324.5 393C322.7 395.3 320.6 397.2 319.8 398.2" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path></g><path data-hk="000000010000000000004000010a830a260" d="M449.9 333.7Q517.9 351.4 569.3 358.5Q620.8 365.6 667.9 365.6L715 365.6M449.5 333.8Q519.1 351.7 569.9 358.7Q620.6 365.6 667.9 366.3L715.1 367M714.1 365.7C709.6 367.7 706.5 369.1 704.1 370.1M714 366.1C710.9 367.6 706.8 369.5 704.3 370.3M714.1 366.3C710.8 364.6 707.3 363 704.1 361.8M714.1 365.8C710.1 364.3 707.1 363.4 703.9 361.7" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 5"></path><text data-hk="000000010000000000004000010a830a270" x="735" y="385" font-size="19" fill="#DBD8CF">output lands here</text><text data-hk="000000010000000000004000010a830a280" x="60" y="441" font-size="21" fill="#DBD8CF">4) PY-EVAL</text><path data-hk="000000010000000000004000010a830a2900" d="M262.3 440.4Q263.5 428.9 266.1 428.1Q268.7 427.4 273.1 428.2Q277.4 429.1 278.3 431.3L279.2 433.6M262.3 438.8Q261.7 429.6 264.5 428.3Q267.3 426.9 271.8 427.1Q276.2 427.2 277.4 429.6L278.6 432.1" fill="none" stroke="#44CFFF" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2910" d="M280.6 433.5Q279.4 443 276.1 444.9Q272.8 446.7 269 445.5Q265.2 444.4 264.4 442L263.7 439.5M279.7 433.5Q280.5 441.3 277.4 443.7Q274.2 446.1 269.7 444.5Q265.3 442.9 265.1 440.4L264.9 438" fill="none" stroke="#F5B04A" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2920" d="M267 429.7Q267.4 430.4 266.7 430.4Q266 430.4 265.1 430.6Q264.2 430.8 264.5 429.9Q264.9 429 264.9 428.3Q264.8 427.5 265.4 427.9Q266 428.2 266.9 428.2Q267.8 428.2 267.1 428.6Q266.5 429 267 429.7M268.1 429.3Q267.7 429.6 266.9 429.8Q266 430.1 265.5 430.2Q265 430.3 264.2 429.7Q263.4 429 264 428.2Q264.6 427.3 265.3 427Q266 426.7 266.9 426.9Q267.8 427.2 268.2 428.1Q268.5 429 268.1 429.3" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a2930" d="M276.8 443.3Q276.3 443.5 276.1 444Q276 444.4 275.2 444.2Q274.4 443.9 274.9 443.5Q275.3 443 275.5 442.6Q275.7 442.3 275.8 442.3Q276 442.3 276.5 442.5Q277 442.7 277.2 442.8Q277.3 443 276.8 443.3M276.7 443.4Q276.8 443.7 276.4 443.9Q276 444.1 275.8 443.8Q275.6 443.6 275.4 443.3Q275.3 443 275.3 442.7Q275.3 442.5 275.6 441.6Q276 440.8 276.2 441.7Q276.4 442.6 276.5 442.8Q276.6 443 276.7 443.4" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a300" d="M299.1 425.5Q448.8 413.3 522.2 411.6Q595.6 410 657.3 417.9L719 425.9M300.6 426.9Q450.4 412.5 522.8 411.3Q595.2 410 657.4 417.8L719.6 425.5M720.1 425.8C716.6 427 711.4 428 709.7 429.3M720.2 426C715.3 427.4 711.4 428.5 709.6 429.5M719.6 425.7C716.5 424.4 713.1 421.4 710.3 420.6M720 426.1C717 424.7 713.3 422.3 710.7 420.2" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a310" x="735" y="433" font-size="19" fill="#DBD8CF">exec state</text><text data-hk="000000010000000000004000010a830a320" x="374" y="369" font-size="16" fill="#44CFFF" transform="rotate(-1 374 369)">needs secret</text><path data-hk="000000010000000000004000010a830a330" d="M433.2 378.3Q387.5 368.1 360.8 373.4L334 378.6M431.2 378Q387.6 366.2 361 372.4L334.4 378.7M334.8 379.1C339.4 376.2 342.1 373.8 343.8 372.4M334.9 379.1C338.7 376.2 341.3 374.3 343.5 372.3M334.7 379.3C340 379.9 342.3 380.6 345.6 381.4M335.1 379C339.3 380.2 342.2 380.3 345.6 381.3" fill="none" stroke="#44CFFF" stroke-width="1.8" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a340" d="M438.4 459.4Q383.8 428.7 369 412.8Q354.2 396.9 356.7 383.6Q359.1 370.3 342.6 356.6Q326.1 342.9 293 332.6Q259.8 322.4 232.9 312.7L206 303M437.4 458.1Q384.4 429.5 369.5 413.2Q354.7 397 357.3 383.9Q359.8 370.8 342 357.5Q324.2 344.3 291.6 333.4Q259.1 322.5 231.4 311.9L203.7 301.2M204.7 301.9C209.5 301.4 214.3 301.4 216.2 301.2M205.2 301.8C208.7 302.3 213.1 301.8 216.2 301.6M205.1 301.9C209 305.5 210.5 307.2 212.5 309.7M204.9 302.3C207.8 304.5 210.5 307.6 212.8 309.8" fill="none" stroke="#F4644A" stroke-width="2.4" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a830a350" d="M560.8 458.5Q629.3 419.9 671.2 399.8L713.2 379.8M561 458.4Q630.1 420.6 672.2 401.2L714.3 381.8M713.9 380.9C711 385 709 387.3 706.5 389.1M714.2 380.7C711.5 384 709.3 387.1 706.8 389.3M714.3 380.9C709.4 381 704.8 380.9 702.8 381.4M714.1 381.3C709 381.3 704.9 381.1 702.8 381.2" fill="none" stroke="#F4644A" stroke-width="2.4" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a360" x="500" y="486" font-size="17" fill="#F4644A" text-anchor="middle" stroke="#F4644A" stroke-width="0.8">PROGRAMMATIC</text><text data-hk="000000010000000000004000010a830a370" x="500" y="518" font-size="17" fill="#F4644A" text-anchor="middle" stroke="#F4644A" stroke-width="0.8">TOOL USAGE</text><text data-hk="000000010000000000004000010a830a380" x="725" y="509" font-size="20" fill="#F4644A" stroke="#F4644A" stroke-width="0.8">CONFLICT!</text><path data-hk="000000010000000000004000010a830a390" d="M887.1 454.6Q897.4 460.8 899.2 466.6Q901.1 472.4 898 478Q894.9 483.6 892.5 487.5Q890 491.5 893.5 496.3Q896.9 501.2 899.1 509.1Q901.2 516.9 897.9 523Q894.6 529 890.2 530.7L885.8 532.4M887.1 455.7Q896.3 460.5 898.2 466.3Q900 472.1 897.3 478.1Q894.6 484 892.5 488.1Q890.4 492.2 894.6 496.3Q898.8 500.4 898.9 508.6Q899.1 516.7 896.9 523.3Q894.7 529.8 890.1 531.4L885.4 533.1" fill="none" stroke="#F4644A" stroke-width="3" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a830a400" x="918" y="516" font-size="28" fill="#F4644A" stroke="#F4644A" stroke-width="0.8">?</text></svg></figure>

嗯，这行不通。因为：

- 程序化的工具使用需要访问全部工具；所以我们没法随意把 harness 状态类工具和环境状态类工具拆开
- 我们得建一个双工网关，让 VM 能调用宿主工具；而这，
    1. 违背了初衷（要么你给 DoS 开了门；要么你得对自己 VM 的某些动作做限流）
    2. 只会让事情更复杂，谢谢，不必了。

好吧，那把驱动应用放进 VM 里！

<figure data-hk="000000010000000000004000010a87"><svg data-hk="000000010000000000004000010a8800" viewBox="0 0 1000 560" role="img" aria-label="Hand-drawn sketch titled 'what if the driver lives in the VM?': the driver, app source, and prompts sit inside the untrusted VM behind an LLM gateway proxy; connection errors and OOM kills are indistinguishable from outside, and app source leaks out to whoever prompts it. Caption: moved the boundary, kept the pain." font-family="var(--st-font-sketch)"><defs><pattern id="drv-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="560" fill="#121419"></rect><rect width="1000" height="560" fill="url(#drv-dots)"></rect><text data-hk="000000010000000000004000010a880100" x="500" y="55" font-size="29" fill="#DBD8CF" text-anchor="middle" letter-spacing="2" stroke="#DBD8CF" stroke-width="0.8">WHAT IF THE DRIVER LIVES IN THE VM?</text><path data-hk="000000010000000000004000010a880110" d="M110.9 66.4C413.8 68.1 672.5 68.2 889.4 67M111.1 67.9C383.9 69.5 720.9 67.1 890.9 67.2" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a88020" x="316.5" y="117.5" width="452" height="267" rx="26" fill="transparent"></rect><path data-hk="000000010000000000004000010a88021" d="M342 116C528.5 116.4 676.4 114.1 744.9 115.1M341.8 116.5C475.7 116.8 677.2 116.8 745.3 114.8M769.2 142.4C767.3 229.7 771.9 313.9 769.5 359.6M770.8 141.3C767.7 232.2 772.6 313.3 769.1 360.9M743.2 387.3C591.9 389.8 408.6 385.3 340.7 386.2M744.6 385.9C561.9 387.2 408.7 385.9 342.4 387M314.2 360C318.2 259.7 312.1 197.9 315.8 141.7M315.7 359.8C316.2 289.2 313.8 178.7 313.6 143.1M744.8 115Q769.3 115.9 768.7 142.7M769.3 359.4Q770.7 386.2 743.5 386.2M341.1 385.3Q314.2 387 314.4 360.6M313.9 140.7Q315.6 115.5 342 115.4" fill="none" stroke="#F4644A" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a88030" x="543" y="154" font-size="28" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8">VM (untrusted)</text><rect data-hk="000000010000000000004000010a88040" x="391.5" y="196.5" width="197" height="142" rx="8" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a88041" d="M396.6 195.4C469.6 195.9 529.1 194 582.9 196.1M398.9 194.6C464.9 196.7 549 196.8 581.3 194.2M589.9 202.7C591.8 243.4 588.1 292.8 588.6 331.8M591.1 202C592.1 262.1 587.7 306.3 589 330.6M581.7 341.3C515.2 340.1 456.9 340.7 398.8 340.2M580.7 339.3C494.5 340.9 458.7 338 398.4 338.9M391.3 332.2C389.5 273.7 388.4 231.7 390.8 204.1M390.2 333.1C389.2 281.1 387.5 226.1 390 203.2M583.4 195.9Q589.2 196.5 590.9 204.4M590.5 330.6Q588.8 340.8 580.6 339.8M398.5 341Q390 340.1 390.5 332.3M388.6 202.9Q389.3 193.6 396.7 194.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a88050" x="490" y="230" font-size="25" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8">DRIVER</text><ellipse data-hk="000000010000000000004000010a880600" cx="560" cy="213" rx="1.6" ry="1.6" fill="#DBD8CF"></ellipse><path data-hk="000000010000000000004000010a880601" d="M561.1 213.9Q561.6 214.8 560.8 214.2Q560 213.6 559.2 213.8Q558.4 214 558.1 213.5Q557.8 213 558.2 212.4Q558.7 211.7 559.3 211.2Q560 210.7 560.7 211.3Q561.5 212 561.1 212.5Q560.7 213 561.1 213.9M560.8 213.7Q560.7 214.3 560.4 214.8Q560 215.3 559.8 214.9Q559.6 214.5 559.2 213.8Q558.9 213 559.2 212.1Q559.6 211.2 559.8 211.7Q560 212.3 560.3 212.3Q560.6 212.3 560.8 212.6Q561 213 560.8 213.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><ellipse data-hk="000000010000000000004000010a880610" cx="572" cy="213" rx="1.6" ry="1.6" fill="#DBD8CF"></ellipse><path data-hk="000000010000000000004000010a880611" d="M573.6 213.7Q573.1 214.4 572.6 214.5Q572 214.6 571.7 214.2Q571.4 213.7 571.3 213.4Q571.1 213 571 212.7Q570.9 212.4 571.4 211.5Q572 210.6 572.6 211.2Q573.3 211.8 573.7 212.4Q574.1 213 573.6 213.7M573.8 213.7Q573.9 214.4 573 214.3Q572 214.3 571.7 214.3Q571.4 214.3 571 213.6Q570.6 213 571.1 212.6Q571.5 212.2 571.8 212.1Q572 212.1 573 211.9Q573.9 211.8 573.8 212.4Q573.8 213 573.8 213.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880620" d="M558 223.6Q565.6 219 569.4 222L573.2 225M559.4 225.6Q567.1 221.5 569.5 223.5L571.9 225.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><g data-hk="000000010000000000004000010a8807" transform="translate(426 269) scale(1.35) translate(-426 -269)"><ellipse data-hk="000000010000000000004000010a880800" cx="426" cy="269" rx="13" ry="13" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a880801" d="M436.8 273.7Q435 278.4 430.5 279.8Q426 281.1 421.7 280Q417.3 278.9 415.5 273.9Q413.7 269 414.9 264.7Q416.1 260.3 421 258.5Q426 256.8 430.8 258.2Q435.6 259.7 437.1 264.4Q438.6 269 436.8 273.7M437 273.5Q434.6 277.9 430.3 279.9Q426 281.8 421.4 280.2Q416.8 278.6 415.4 273.8Q414 269 415.5 264.5Q417 260 421.5 257.7Q426 255.4 430.3 257.7Q434.6 260 437 264.5Q439.4 269 437 273.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880810" d="M429.8 270.7Q428.5 272.3 427.3 272.8Q426 273.3 424.4 272.7Q422.8 272.1 422.1 270.6Q421.3 269 422.1 267.3Q422.9 265.6 424.5 265.7Q426 265.9 427.6 265.7Q429.2 265.6 430.1 267.3Q431.1 269 429.8 270.7M429.4 270.5Q429.1 272 427.5 272.4Q426 272.7 424.4 272.4Q422.9 272 422.6 270.5Q422.3 269 422.7 267.2Q423.2 265.5 424.6 265.3Q426 265.1 427.7 265.4Q429.4 265.6 429.6 267.3Q429.8 269 429.4 270.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880820" d="M426 264.9C426.1 260.8 425.4 259.4 426.4 256.5M425.8 264.6C426.8 262.5 425.9 258.3 426.5 257.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880830" d="M422.9 270.5C419.3 273.1 417.1 273.8 415.7 275.2M423.1 270.5C419.1 272.8 418.3 273.8 415.6 275" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880840" d="M429.2 270.5C432.1 272.6 435.3 274.5 436.9 274.7M429.2 271.3C432.4 273.2 434.6 274.5 436.3 274.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path></g><g data-hk="000000010000000000004000010a8809" transform="translate(474 280) scale(1.45) translate(-474 -280)"><path data-hk="000000010000000000004000010a880a1000" d="M464.8 282.6Q465 275 468.1 272.8Q471.2 270.6 474.7 270.6Q478.2 270.6 479.4 273.3L480.6 276M464.7 283.9Q464 274.6 466.8 271.7Q469.6 268.8 473.7 270.8Q477.7 272.9 480.1 274.9L482.5 276.9" fill="none" stroke="#44CFFF" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1010" d="M483.7 278.1Q484.1 285.9 479.9 288.3Q475.8 290.7 472.2 288.8Q468.5 287 467.5 284.2L466.5 281.5M481.9 275.8Q483.6 284.8 480.5 287.1Q477.4 289.4 473 288.9Q468.6 288.4 468.5 285.1L468.4 281.8" fill="none" stroke="#F5B04A" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1020" d="M470.2 273.2Q470.7 273.5 469.9 274.3Q469 275.1 468.6 274.7Q468.3 274.3 467.8 273.7Q467.4 273 468 272.2Q468.7 271.3 468.9 271.9Q469 272.5 469.6 272.5Q470.3 272.5 469.9 272.8Q469.6 273 470.2 273.2M470 273.8Q469.3 274.6 469.1 274.8Q469 275 468.5 274.3Q468 273.6 467.7 273.3Q467.5 273 467.6 272.2Q467.7 271.5 468.4 271.4Q469 271.3 469.4 271.5Q469.7 271.7 470.2 272.4Q470.7 273 470 273.8" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1030" d="M480.2 287.2Q479.9 287.5 479.5 287.8Q479 288.2 478.7 288Q478.4 287.7 477.8 287.4Q477.2 287 477.3 286.1Q477.4 285.3 478.2 285Q479 284.7 479.5 285Q479.9 285.2 480.2 286.1Q480.6 287 480.2 287.2M480.8 287.2Q480.1 287.3 479.5 287.9Q479 288.5 478.3 288.3Q477.7 288.2 477.3 287.6Q476.9 287 477.2 286.3Q477.4 285.5 478.2 286Q479 286.5 479.6 285.9Q480.2 285.4 480.8 286.2Q481.5 287 480.8 287.2" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path></g><polygon data-hk="000000010000000000004000010a880a1100" points="530,244 559,244 568,253 568,292 530,292" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a880a1101" d="M530.3 291.8C530.1 275 529.5 253.4 531.1 243.6M529.9 292.5C531.8 267.4 529.9 255.5 529.3 244.5M530.1 243.7C538.2 242.8 554.4 244.1 559.6 243.3M529.6 243.1C540 242.8 553.3 244.9 558.8 243M559.7 244.9C562.6 247 567 252.2 568.8 253M558.6 243.9C563.6 247.2 566.9 251.7 567.9 252.6M567.2 252.7C569.7 270.8 568.3 284.5 568.3 291.7M568.8 252C568.9 264.5 567.1 282.5 567.3 293.1M567.3 291.1C550.9 293.5 540 291.3 529 292.7M567.9 291.5C556.9 291.6 543.2 291.9 531.1 291.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1110" d="M558.6 243.4C558.7 247.4 558.9 250.6 559 253.4M559.5 244.4C558.3 247.2 558.5 250.8 558.8 253.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1120" d="M559.2 253.3C562.4 252.5 566.2 252.5 568.1 252.8M558.7 252.4C561.9 253.7 566 252.8 568 253.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1130" d="M536.2 261.9C548.1 261.5 554.7 262.3 559.8 260.9M538.5 261.6C545 263.3 557.9 263.2 560.6 262.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1140" d="M535.8 268.7C549.3 271.8 555.1 271.7 559.7 270.4M538.1 269.7C545.9 270.6 555.8 271.8 561.5 269.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1150" d="M537.5 278.9C543.2 278.9 556.8 277.1 561.1 276.8M537.3 277.8C549 278.4 555.2 278.6 562.2 277.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1160" d="M536.1 285C545.7 286.7 550 286 556.8 284.7M537.3 285.5C546.1 285.6 550.3 286.9 555.6 285.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a880a120" x="403.5" y="299.5" width="173" height="51" rx="8" fill="#262B33"></rect><path data-hk="000000010000000000004000010a880a121" d="M409.6 298.5C470.1 296.9 535.8 300.1 568.5 297M409.1 297.3C480.6 298.7 534 297.6 570.6 297M578.5 307C578.7 321.6 577.1 335.2 577.5 344.9M578.1 304.8C579.4 321.4 578.6 336 579.3 342.8M569.1 351.5C520 350.5 463.1 350.8 409.2 352.2M570.3 352.1C499.9 352.4 450.2 354 408.6 352.4M402.7 343.7C401 325.9 403.7 317.4 401.7 307.2M400.7 344.3C400.4 327.7 400.6 317.2 401.1 307.1M570.8 296.7Q578.1 296.8 578.2 306.9M577.2 344.6Q577.2 352.5 570.3 351.8M411.3 351.1Q401.3 352.5 401.6 344.1M402.9 307.4Q401.9 297.1 408.8 296.8" fill="none" stroke="#9AA2AD" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a130" x="490" y="322" font-size="18" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8"><tspan data-hk="000000010000000000004000010a880a131" x="490">app source +</tspan><tspan data-hk="000000010000000000004000010a880a132" x="490" dy="21">prompts</tspan></text><text data-hk="000000010000000000004000010a880a140" x="157" y="132" font-size="20" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8" transform="rotate(-1 157 132)"><tspan data-hk="000000010000000000004000010a880a141" x="157">now you have</tspan><tspan data-hk="000000010000000000004000010a880a142" x="157" dy="25">to build &amp; host</tspan><tspan data-hk="000000010000000000004000010a880a143" x="157" dy="25">THIS</tspan></text><rect data-hk="000000010000000000004000010a880a150" x="60.5" y="206.5" width="148" height="102" rx="7" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a880a151" d="M67.1 203.8C117.1 202.9 163.4 204.4 203.6 203.5M65.6 205.8C123.4 207 182.2 204.1 204.2 204M211 212.5C209.4 251.9 208.4 284.8 210.9 302.9M208.5 210.7C207.9 252.5 210.6 286.3 210.4 302.1M204 309.6C160.1 309.2 89.5 309.2 65.2 310.1M201.9 310.7C140.7 310.3 92.2 311.7 64.7 310.9M58.3 301.9C59.3 257.8 58.4 232.9 57.9 212.3M60.3 303.4C60.8 271.2 58.6 242.4 60.2 211.8M203.4 205.1Q211 205.6 211.3 213.3M210.9 302.6Q209.2 308.9 203.5 310.8M67.3 308.9Q60.3 310.8 57.8 303.2M57.9 211.7Q59.3 204.8 65 203.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a160" x="134" y="238" font-size="24" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8"><tspan data-hk="000000010000000000004000010a880a161" x="134">LLM</tspan><tspan data-hk="000000010000000000004000010a880a162" x="134" dy="31">GATEWAY</tspan></text><path data-hk="000000010000000000004000010a880a1700" d="M191.4 196Q190.8 186.1 194.6 184.2Q198.3 182.3 201.2 184Q204 185.7 204.6 189.9L205.2 194.1M192 194.2Q192.4 187.1 195 185.1Q197.7 183 201.1 184.3Q204.5 185.6 204.5 190L204.5 194.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><polygon data-hk="000000010000000000004000010a880a1710" points="185,195 211,195 211,211 185,211" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a880a1711" d="M185.3 211.2C185.1 204.5 184.8 200.2 184.5 195.3M184.6 212.1C185.1 204.8 185.7 200.3 184.7 195.8M184.6 195.1C196.6 195.5 205.4 194.3 212 195.3M184.2 193.9C197.1 195.6 203.1 195.6 211.9 194M211.6 195.5C211 201.8 211.4 207 210.7 211.2M210.2 195.6C210.5 200.8 211.3 207.4 210.9 211M210.2 211.6C200.8 211.3 189.7 211.5 185.4 210.8M211.6 211.6C199.1 211.9 194 211.9 185 212.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><ellipse data-hk="000000010000000000004000010a880a1800" cx="94" cy="276" rx="5" ry="5" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a880a1801" d="M98.1 277.7Q98 279.3 96 279.7Q94 280.1 92.2 280.2Q90.3 280.2 89.1 278.1Q88 276 89 274.6Q90.1 273.2 92 271.8Q94 270.5 95.9 271.5Q97.7 272.5 98 274.3Q98.3 276 98.1 277.7M98.2 277.4Q98.1 278.8 96.1 279.6Q94 280.4 92.1 279.7Q90.2 279 89.6 277.5Q89 276 89.6 273.9Q90.1 271.7 92 271.6Q94 271.5 95.9 272.1Q97.8 272.7 98 274.4Q98.2 276 98.2 277.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1810" d="M97.9 280.9C104.5 285.1 109.5 291.1 113.7 295.2M97.4 279.4C104.9 288.5 111.3 290 113.7 295.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1820" d="M107.1 291.5C105 294.3 103.8 294.5 102.7 295.5M107.2 291C105.2 293.2 103.7 294.1 102.8 296.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a1830" d="M111.8 294.8C110.7 297.8 109.3 298.7 108.5 299.6M111.8 295.5C109.9 296.6 108.7 299.5 107.7 300.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a190" d="M208.7 253.3Q281.7 215.2 335.6 233L389.5 250.7M210.9 251.8Q280.8 213.4 335.9 232.9L391 252.3M390.1 252.2C385.7 252.5 381.9 252.3 378.7 253M389.7 251.7C386.1 252.3 381.9 252.3 379.4 253M390.2 251.9C386 248.3 383.8 246.2 382.1 244.2M390.2 251.9C386.6 249.5 383.5 246 381.9 244.3" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a200" d="M244.6 317.8Q270.2 290.3 268.2 268L266.1 245.8M244.5 318.5Q269.8 290.4 269 268.1L268.3 245.7M266.8 247.2C268.8 251.2 271.1 255.2 272 256.5M266.7 246.7C268.6 250 270.1 253.6 272 256.7M266.9 247.3C265.9 250 264 254.6 263.1 257.5M267.2 247.1C265.2 251.6 263.8 254.9 263.2 257.4" fill="none" stroke="#DBD8CF" stroke-width="1.8" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a210" x="216" y="343" font-size="21" fill="#DBD8CF" text-anchor="middle" transform="rotate(-1 216 343)"><tspan data-hk="000000010000000000004000010a880a211" x="216">proxy —</tspan><tspan data-hk="000000010000000000004000010a880a212" x="216" dy="27">key stays</tspan><tspan data-hk="000000010000000000004000010a880a213" x="216" dy="27">out here</tspan></text><text data-hk="000000010000000000004000010a880a220" x="600" y="194" font-size="19" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8">(a)</text><polygon data-hk="000000010000000000004000010a880a2300" points="642,200 651,192 660,200 651,210" fill="#1E2A3C"></polygon><path data-hk="000000010000000000004000010a880a2301" d="M650.4 210.2C646.1 204.9 644.2 201.9 640.9 199.2M650.7 210.1C648.5 207.2 645 202.4 641.1 199.9M641.7 198.9C645.6 196.6 649 194.4 650.5 193M641.9 199C644.8 196.5 647.1 193.8 651.3 191.5M650.7 192C655.8 195.8 657.1 197.2 659.6 200.2M649.9 192.2C654.5 196.8 657 199.1 659.9 199.5M659.4 199.5C656.2 202.9 651.9 209.2 650.6 210.3M660.5 200.5C656.9 203.5 652.4 207.5 650.3 210.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a2310" d="M647.3 195C645.7 192.4 644.3 190.6 642.6 188M647.3 194.8C645.9 192.8 644 189.4 643.2 187.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a2320" d="M652.8 191.5C651.1 189 651.4 187 650 184.8M653.1 192.2C652 189.3 650.3 186.9 650.6 185.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a2330" d="M652.3 209.3Q647.8 217.4 649.7 219.4Q651.5 221.4 649.6 225L647.6 228.6M649.7 209.8Q649 216.3 650.5 219Q652 221.8 650.8 225.6L649.6 229.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a240" x="672" y="204" font-size="19" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8"><tspan data-hk="000000010000000000004000010a880a241" x="672">conn</tspan><tspan data-hk="000000010000000000004000010a880a242" x="672" dy="22">error</tspan></text><path data-hk="000000010000000000004000010a880a250" d="M640.4 218Q619.1 236 604.7 234.3L590.2 232.6M642.3 218.9Q619.2 234.9 604.1 233.1L589 231.3M590 231.7C594.2 230.9 598 229.2 600.3 228.7M589.7 232.3C593.3 231 598.6 229.3 600.6 228.7M589.8 232C593.7 233.7 597.2 236 599.2 237.7M590.2 231.8C594.2 234.5 597.7 236.1 599.3 237.5" fill="none" stroke="#DBD8CF" stroke-width="1.8" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a260" d="M727.9 215.6Q752 222.2 759.2 237L766.4 251.8M725.8 216.8Q751.3 221.8 758.3 237.1L765.4 252.5M765.8 251.9C762 248.6 759.6 246.8 758 244.7M766.3 252.3C763.4 249.8 759.6 246 757.5 244.7M765.9 251.7C766 248.2 765.8 244 765.5 240.8M765.8 251.8C765.7 248.2 766.2 244.2 766 241" fill="none" stroke="#DBD8CF" stroke-width="1.8" stroke-linecap="round"></path><g data-hk="000000010000000000004000010a880a27" transform="translate(669 279) scale(.78) translate(-669 -279)"><polygon data-hk="000000010000000000004000010a880a2800" points="637,287 651,283 641,267 659,274 661,250 672,267 683,245 687,269 708,262 697,280 712,288 692,292 698,310 678,300 670,318 662,299 645,308 651,293" fill="#4A2A10"></polygon><path data-hk="000000010000000000004000010a880a2801" d="M651.1 292.8C644.5 290.2 640.6 287.7 637.7 287.5M650.9 293.6C644.6 290.5 641.3 288.2 636 286.7M638.1 287.7C642.3 286 647.4 284.4 651.2 283.1M637.9 286.8C644.3 285.4 647 283.6 651.7 283.2M651.6 284C646.6 276.7 642.4 271.2 641.7 267M650.2 283.5C647 275.9 641.6 270.7 640.8 267.5M641.6 266.8C649.7 271 655.1 273 659.7 273M640.9 265.9C646.4 268.7 654 271.5 658.2 275M658.3 273C660.8 263.4 661.2 255.4 661.1 250.9M658.5 273.2C660 267.5 661.5 258.1 660.8 249.7M661.1 249.1C665.1 258 668.8 262.4 670.9 266.2M660 250.9C666.7 257.7 669.4 263.2 672.3 267.5M671.1 266.3C675.2 260.8 680.4 252.2 682.2 244M671.5 267.2C675 260.8 679.3 249.8 683.3 245.8M683.4 244C684.2 254.4 686.8 264.9 687.9 269.5M681.9 245.5C684.8 255 686.1 263.9 686.3 269.9M686.5 270C694.5 264.9 702 263.4 707.8 262.8M687.6 269.3C696.4 264.6 702.7 263.6 708.4 261M707.8 261.4C703.3 270.6 700.2 278.1 696.4 280.7M709 261C703.5 269.3 701 273.2 697.9 280.5M696.1 279.2C703.9 282.1 707.6 285.8 711.6 288.3M697.9 279.2C703.4 283.9 707.5 285.8 711.5 288M711.2 287C704.8 290.7 697.4 291.7 691.7 291.8M712.7 288.4C706 288.4 695 291.9 692 291.4M692.4 292.3C693.7 300.6 695.9 305 699.1 309.8M692.3 291.8C693.6 297.5 697.8 307 697.6 309.5M697.2 308.9C692.7 306.8 682.1 301.4 677.3 301M697 309C687.1 304.4 680.5 302.1 677.4 300.6M677.4 300.3C674.4 307.3 671.1 313.7 669 317.7M678.6 299.7C674.5 307.2 671.3 314.3 669 318.3M670.8 317.8C667.7 310.8 664.8 304.2 662.1 300.1M670.6 318.3C666.2 312.3 663 302.9 662 298.9M661 298.1C654.5 301.3 649.3 304.3 644.4 308.1M661.6 299C655 303.4 650.4 305.3 644 308.4M646 307.4C646.7 302.7 650.2 296 650.5 292.2M645.8 307.3C647.2 301.1 649.1 297.3 651.9 292.3" fill="none" stroke="#F4644A" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a2810" d="M646.7 249C644.1 245.4 642.6 243.9 641.2 242.1M646.7 249.3C644.5 246.1 642.4 241.2 641.9 239.6" fill="none" stroke="#F5B04A" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a2820" d="M703.3 252.6C705.7 251.2 710.7 245.7 710.7 244.8M703.6 254.4C706.4 250.3 708.2 247.1 709.3 244.3" fill="none" stroke="#F5B04A" stroke-width="2" stroke-linecap="round"></path></g><text data-hk="000000010000000000004000010a880a290" x="602" y="326" font-size="19" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8">(b)</text><text data-hk="000000010000000000004000010a880a300" x="641" y="328" font-size="19" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8"><tspan data-hk="000000010000000000004000010a880a301" x="641">OOM</tspan><tspan data-hk="000000010000000000004000010a880a302" x="641" dy="22">kamikaze</tspan></text><path data-hk="000000010000000000004000010a880a310" d="M635.1 281.5Q614.7 275.7 602.8 274.7L590.9 273.8M635.7 282.4Q613.3 276.6 601.7 274.7L590.1 272.8M589.7 273.1C593 271.7 597.9 270.5 600.8 270M590.2 272.7C594.6 271.7 597.1 271 600.4 269.6M589.8 272.9C593.7 275.3 597.2 277.4 599.1 278.7M590 272.8C594.2 275.9 596 276.8 599.6 278.5" fill="none" stroke="#DBD8CF" stroke-width="1.8" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a320" d="M710.6 291.9Q740.6 285.2 751.4 272.2L762.2 259.2M710.3 289.7Q741.2 284.8 752.3 272.8L763.4 260.8M763.2 260.1C761.8 263.8 760.5 267.4 759.3 270.8M763.2 260.1C761.1 265 760.2 267.4 759.4 270.5M762.8 260.3C759.7 261.3 755.1 262.9 752.8 264.4M762.8 259.8C758.5 261.6 755.7 263.4 752.8 264.4" fill="none" stroke="#DBD8CF" stroke-width="1.8" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a3300" d="M761 254Q764.3 245 764.8 250Q765.3 254.9 767.5 250.1Q769.6 245.2 769.7 252.1Q769.8 258.9 773.9 252.8Q778 246.6 776 253.3L774 260.1M761 252.8Q765.1 244.1 764.7 250Q764.2 255.9 767.8 251Q771.4 246.2 770.5 252.2Q769.7 258.2 773.2 252.5Q776.7 246.8 774.7 254.1L772.8 261.5" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a3310" d="M765.2 260.6Q770.9 251.7 770.7 257.8Q770.5 263.9 773.6 258.2L776.8 252.6M765.3 260.3Q770.4 250 770.9 257.1Q771.5 264.1 774.8 259.3L778.2 254.4" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a340" d="M781.2 250.2Q809.6 227.2 823.2 226.5L836.8 225.7M780.5 252Q810.6 226.4 824.8 226L839.1 225.7M838 224.7C834.3 226.7 831.2 228.1 827.8 229.8M837.7 224.9C834.2 226.6 829.9 228.5 828.4 229.9M837.8 224.8C834.9 224 829.2 221.4 828.1 220.8M837.7 225.2C833 222.8 829.6 221.5 827.9 220.9" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a3500" d="M846 208.1Q856.8 188.1 856.4 199.7Q856 211.3 862.9 201.1Q869.8 190.8 868.4 205.2Q867 219.5 875.5 206.6Q884.1 193.6 880.3 209L876.5 224.3M848.4 207.7Q859 188.5 857 199.7Q855 210.8 863.4 200Q871.9 189.1 869.2 204.2Q866.5 219.3 875.1 207.3Q883.6 195.3 880.2 209.3L876.7 223.2" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a3510" d="M858.7 223.2Q871.8 202.3 870.6 215.8Q869.4 229.3 877.3 218.1L885.2 206.8M858.1 222.3Q871.1 203.5 869.8 216Q868.5 228.5 877.2 217.5L885.9 206.4" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a360" d="M846.2 290.7Q815.8 284.1 795.4 274.6L775.1 265M844.8 292.3Q814.8 283.9 795.3 275.3L775.8 266.8M775.9 265.9C780.9 265.7 784 266.1 786.8 265.8M776.4 266.1C781.1 266.2 783.6 265.7 787.3 265.8M775.8 265.7C779.5 269.8 782.2 272.5 783 274.4M776 266.3C779.4 270.6 781.2 273 783.3 274.4" fill="none" stroke="#F4644A" stroke-width="1.8" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a370" x="837" y="320" font-size="21" fill="#F4644A" text-anchor="middle" stroke="#F4644A" stroke-width="0.8" transform="rotate(1 837 320)"><tspan data-hk="000000010000000000004000010a880a371" x="837">outside can't tell</tspan><tspan data-hk="000000010000000000004000010a880a372" x="837" dy="25">which!</tspan></text><text data-hk="000000010000000000004000010a880a380" x="945" y="340" font-size="42" fill="#F4644A" text-anchor="middle" stroke="#F4644A" stroke-width="0.8" transform="rotate(2 945 340)">?</text><path data-hk="000000010000000000004000010a880a3900" d="M314.1 419.2Q429.3 417.9 439.1 425.4Q448.9 432.9 448.5 452.4Q448.1 472 439.5 479.9Q431 487.7 448.5 492.8Q466.1 497.8 443.5 492.4Q420.9 487.1 366.8 487.1Q312.8 487.1 303.6 480.5Q294.4 473.8 294.4 454.4Q294.5 434.9 304.8 426.5L315.2 418.1M313.8 418.8Q427.8 419.7 438 426.8Q448.3 433.9 448.5 453.5Q448.7 473.1 439.8 480.6Q430.9 488.1 449.6 493.4Q468.4 498.6 443.5 492.8Q418.6 486.9 367 486.6Q315.3 486.3 304.6 480.3Q293.9 474.4 294 453.6Q294.1 432.9 303.3 425.2L312.5 417.6" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a400" x="369" y="448" font-size="20" fill="#DBD8CF" text-anchor="middle"><tspan data-hk="000000010000000000004000010a880a401" x="369">untrusted</tspan><tspan data-hk="000000010000000000004000010a880a402" x="369" dy="23">prompt</tspan></text><ellipse data-hk="000000010000000000004000010a880a4100" cx="500" cy="464" rx="10" ry="10" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a880a4101" d="M508 467.2Q507 470.4 503.5 472.6Q500 474.9 496.7 473.1Q493.4 471.4 491.6 467.7Q489.9 464 491.8 460.4Q493.7 456.9 496.8 455.5Q500 454.2 503.3 455.3Q506.6 456.4 507.8 460.2Q508.9 464 508 467.2M508.6 467.5Q507.6 471 503.8 472.8Q500 474.6 496.3 472.5Q492.6 470.3 491.4 467.2Q490.2 464 491.6 460.4Q493 456.8 496.5 455.2Q500 453.5 503.6 455.3Q507.2 457.1 508.4 460.6Q509.6 464 508.6 467.5" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4110" d="M498.8 473.9C499 485.6 499.8 499.5 498.8 513.4M500.5 474.6C500.5 486.4 500.3 500.5 500.7 514.4" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4120" d="M499.7 488.8C492.1 484.4 486.7 480.6 482.6 477.3M499.9 488.9C494.7 486.4 484.7 479.4 481.3 476.2" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4130" d="M501.3 490.1C507.3 486.1 511.4 479.8 519.9 474.8M499.2 488.4C506.6 485.2 513.4 479.6 518.7 474.7" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4140" d="M500.3 514.2C494.2 522.3 487.9 531.9 486.4 537.2M500.1 514.2C491.3 524.4 490.1 532.4 484.3 535.4" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4150" d="M501.1 515.3C505.7 521.7 509.8 530 516 536.2M500.5 514.8C504.6 521.3 510 528 514.4 537" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a420" d="M480.6 455.1Q451 421.3 448.6 386.2L446.1 351M481 454.3Q453 421.1 449.8 386.5L446.6 351.8M446.1 352.2C448 355.7 450.7 359.8 451.4 361.5M445.7 352C447.8 355.3 449.7 359.5 451.1 361.3M446 352C445 355.2 442.9 359.3 442.7 362.2M446.2 352.1C444.3 355.6 443.7 359.3 442.5 362.2" fill="none" stroke="#DBD8CF" stroke-width="2.2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a430" d="M552.1 351.5Q558 413.8 539.1 439L520.2 464.2M551.4 353Q559.7 413.4 540.4 438.6L521.2 463.7M520.7 465.2C522.5 459.5 523.1 457.7 523.7 454.4M521.3 465.3C521.5 461.1 522.5 456.5 523.8 454.5M520.9 465.3C525.3 462.9 527.1 461.7 530.3 459.4M520.9 465.2C524.5 463.4 528.9 460.5 530.4 459.9" fill="none" stroke="#DBD8CF" stroke-width="2.2" stroke-linecap="round"></path><polygon data-hk="000000010000000000004000010a880a4400" points="576,412 603,412 612,421 612,458 576,458" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a880a4401" d="M576.3 457.2C576.7 444.2 574.6 420.3 575.9 412.9M575.1 457.3C577.4 436.2 576.8 423.7 576.7 411M576.7 413C586.4 410.7 597.5 411.2 601.9 411.1M576.9 412.6C586.2 413.4 594.9 411.2 602.8 411.7M603.7 412.1C607.3 415.2 611.3 419.3 611.5 420.5M602.4 412.9C606.5 415.7 610.3 419.2 612.5 421M612.8 421.2C611.2 432.8 613.3 450.8 611 457.1M612.4 421.3C611.5 434.8 613 447.2 611.5 458.3M612.9 458.5C597 458.9 586.4 457.9 575.1 458.8M611.8 458.4C600 458.4 587.2 458.3 576 457.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4410" d="M603.3 411.4C602.9 415.7 603.1 419 603.6 420.9M603 412.5C602.9 414.9 602.7 418.3 603.4 421" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4420" d="M602.5 420.4C606.4 421.1 609.5 421.1 612.2 420.6M602.5 421.3C607.2 420.7 609.9 421.3 611.6 421" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4430" d="M584 430.6C590.8 429.8 600.3 429.4 604 428.8M584 429.6C590.5 430.9 601.9 430.3 604.3 429.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4440" d="M581.9 437.5C590.7 438.3 600.9 436.6 604.5 439.1M582 438.3C589.3 439.2 600.4 438.4 605.5 438.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4450" d="M582.9 445.7C592.3 446.2 598.2 446 604.5 446.1M583.6 445.8C594.2 447.2 599.3 445.8 605.6 446.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a880a4460" d="M584.1 453.4C587.2 454.8 597.5 453.9 600 454.6M582.1 454.2C588.6 453.8 593.5 453.4 598.9 454.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a880a450" x="626" y="434" font-size="20" fill="#F4644A" stroke="#F4644A" stroke-width="0.8" transform="rotate(1 626 434)"><tspan data-hk="000000010000000000004000010a880a451" x="626">app source</tspan><tspan data-hk="000000010000000000004000010a880a452" x="626" dy="25">leaks out</tspan></text><text data-hk="000000010000000000004000010a880a460" x="752" y="460" font-size="38" fill="#F4644A" stroke="#F4644A" stroke-width="0.8" transform="rotate(2 752 460)">!</text><text data-hk="000000010000000000004000010a880a470" x="768" y="542" font-size="16" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8" transform="rotate(-1 768 542)">moved the boundary, kept the pain</text></svg></figure>

- 现在我们不仅泄露了应用的提示词，还泄露了内部源码，除非把应用挪到 VM 外面、通过网络 RPC 连接 harness，同时把会话存储也挪出去
- 但会话存储在外面，意味着得给 VM 授予写权限，这又把我们带回了问题 #1 和 #2 的合体。

解决办法是在 VM 里只放一个唯命是从的存根（stub），然后非常非常小心地限制回传数据的最大量（你可不想因为一次误用的 Read 工具收到 2GB 的响应）：

<figure data-hk="000000010000000000004000010a91"><svg data-hk="000000010000000000004000010a9200" viewBox="0 0 1000 560" role="img" aria-label="Hand-drawn sketch titled 'the stub stays in, everything else stays out': the trusted host keeps the driver, harness, LLM gateway keys, and session storage; the untrusted VM contains only an executor stub (python plus ripgrep) talking over one typed RPC door, with a read-only git overlay mirror. Caption: minimum viable prisoner." font-family="var(--st-font-sketch)"><defs><pattern id="stub-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="560" fill="#121419"></rect><rect width="1000" height="560" fill="url(#stub-dots)"></rect><text data-hk="000000010000000000004000010a920100" x="500" y="56" font-size="26" fill="#DBD8CF" text-anchor="middle" letter-spacing="2" stroke="#DBD8CF" stroke-width="0.8">THE STUB STAYS IN, EVERYTHING ELSE STAYS OUT</text><path data-hk="000000010000000000004000010a920110" d="M110.6 68.2C446.7 71.2 700.5 71.8 890.3 67.4M109.2 66.8C405.6 67.1 738.6 71.7 890.1 68.6" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a92020" x="71.5" y="101.5" width="357" height="397" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a92021" d="M67.2 99.6C180 98.4 374.5 99.4 432.3 99.2M68.7 99.5C228.5 97.7 375.6 97.3 431.9 99.3M429.5 100.1C430.7 233.3 429.5 410.8 431 499.6M430.5 100.5C429.9 295.4 432 390.9 430.7 501.1M430.8 499.6C265.4 502.2 166.1 499 67.6 498.9M430.4 500.9C293.7 499 165.8 496.8 66.6 501.3M70.9 502.6C68.7 363.8 70.3 231.5 70 99.6M70 501.4C70.1 341.8 67.3 191.7 71.2 98.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="7 5"></path><text data-hk="000000010000000000004000010a92030" x="95" y="140" font-size="19" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8">HOST</text><text data-hk="000000010000000000004000010a92040" x="172" y="140" font-size="16" fill="#4ADE80">(trusted)</text><path data-hk="000000010000000000004000010a92050" d="M272.7 131Q280 142.6 290.9 128.8L301.7 115M271.6 131.5Q279.6 143.8 291.1 130.4L302.6 117" fill="none" stroke="#4ADE80" stroke-width="3" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a92060" x="186.5" y="166.5" width="102" height="37" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a92061" d="M185 164.6C238.3 165.7 260.4 162.4 293.3 164.9M184.3 164.3C221.4 164.5 259.8 167.3 292.8 166.1M291.4 163.6C291.2 179.2 290.9 200 289.3 205.9M291.4 164.4C289.9 182.9 287.7 197 290.9 205.6M289.3 205.6C243.7 204.8 213.8 204.3 183.8 205.8M290.8 203.7C256 203.1 214.8 206 183.8 204.1M185.1 205.5C184.9 189.3 184.2 175.6 184.9 163.7M183.9 206.6C183.1 188.1 183.2 172.8 186 164.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a92070" x="237" y="190" font-size="15" fill="#DBD8CF" text-anchor="middle">DRIVER</text><ellipse data-hk="000000010000000000004000010a920800" cx="290" cy="165" rx="13" ry="13" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a920801" d="M300.5 169.3Q298.8 173.7 294.4 175.6Q290 177.5 285.6 175.6Q281.1 173.7 279.2 169.3Q277.3 165 279 160.3Q280.8 155.6 285.4 153.4Q290 151.2 294.9 153.4Q299.9 155.5 301.1 160.3Q302.2 165 300.5 169.3M301.3 169.7Q299.3 174.5 294.7 175.9Q290 177.3 285.7 175.5Q281.3 173.7 279.6 169.4Q277.8 165 279.4 160.4Q281.1 155.7 285.5 154.3Q290 152.9 294.6 154.2Q299.3 155.4 301.3 160.2Q303.2 165 301.3 169.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920810" d="M293 166.8Q293.1 168.6 291.5 169.1Q290 169.6 288.2 168.4Q286.4 167.2 286.7 166.1Q287 165 287.2 163.5Q287.5 161.9 288.7 161.6Q290 161.2 291.6 161.8Q293.2 162.4 293.1 163.7Q292.9 165 293 166.8M293.1 166.7Q292.3 168.3 291.1 168.5Q290 168.7 288.3 168.1Q286.6 167.5 286.5 166.3Q286.4 165 287.2 163.6Q287.9 162.3 289 161.2Q290 160.2 291.2 161.4Q292.5 162.6 293.2 163.8Q293.9 165 293.1 166.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920820" d="M289.4 160.8C290.2 158.3 289.9 155 290.4 152.8M289.6 161C290.6 157.9 289.7 154.1 290.4 152.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920830" d="M286.5 166.9C283.2 169 281.4 170.2 279.8 170.4M287.1 166.8C284.2 168.4 280.9 171.1 279 171.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920840" d="M294 166.6C296.4 168.6 297.9 170.1 299.9 171.5M293 167.2C296.3 168.9 298.1 169.5 300.6 171.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><polygon data-hk="000000010000000000004000010a920900" points="330,237 330,199 335,195 356,195 361,202 402,202 402,237" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a920901" d="M401.1 236.9C375.8 236.1 345.6 236.7 329.4 236.7M402.2 237.9C368.7 236.3 345.6 236.8 331 236.2M330.9 237.3C331.5 221.2 328.6 210.6 329 199.3M330.4 237.7C330.2 219.7 330 206.7 330.2 199.3M330.2 199C331.3 197.7 334.1 196.1 335.1 195M330.3 199.2C331.6 198.1 333.5 195.8 335.2 194.9M335.9 193.9C342.4 194.2 351 194.6 355.2 195.8M335.2 194.3C343 195.5 350.2 194.3 355 195.3M355.9 195C357.7 198.1 359.8 199.8 360.9 202.2M356.1 195.2C358.8 198.5 359.9 201 361.1 202.1M361.2 202.3C373.7 201.3 389.4 202.1 401.1 202.2M361.8 201.5C374.7 202.9 390.2 202.7 402.6 202.1M402.4 201.5C403 220 402.7 225.6 402.5 237.4M401.4 202.4C402 217.4 403 225.1 402.4 237.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920910" x="366" y="226" font-size="13.5" fill="#DBD8CF" text-anchor="middle">&lt;git&gt;</text><path data-hk="000000010000000000004000010a920a100" d="M328.8 236.5Q305.9 250.7 298.9 255.2L292 259.6M330.1 237.4Q306.2 250.8 298.5 255.2L290.8 259.6M291.9 260.1C294.4 257.2 296.7 252.9 298.2 250.9M292 259.8C294.8 255.7 296.5 252.7 297.9 251.1M291.8 260.3C296.4 259.8 299.5 258.9 303.2 258.8M291.8 260.2C297 259.5 300.9 259.1 302.6 258.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a110" d="M180.1 194.6Q149.1 220.5 153.4 235.6Q157.7 250.7 169.3 259.2L180.8 267.7M181 194.6Q150.9 219.1 154.7 234.2Q158.5 249.2 170.8 258L183.1 266.8M182.2 267.9C176.7 266.7 173.8 266 171 265.6M181.8 267.9C177.9 267 174.1 266.3 171.3 265.6M182 268C179.7 264.3 177.8 259.8 176.5 258.3M181.6 267.9C180.3 265.5 178 261.4 176.9 258.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a920a120" x="186.5" y="256.5" width="132" height="41" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a920a121" d="M183.6 255.9C237.9 254.3 299.5 254 319.7 253.9M183.6 254.7C246 255 287.5 253.1 319.5 254.4M319.8 252.4C321 268.6 320.3 283.7 320.8 298M319.7 254.1C320.2 271.2 320.2 285.5 320.1 300.4M320.4 299.5C267.5 301.8 214.7 299.5 184.1 298.6M319.9 298.2C270 301 208.4 299 183.6 298.1M185.3 299.8C183.1 283.5 184.6 267.1 184.3 254.6M186.2 300.1C186.6 277 185.6 270.1 185.7 255.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a130" x="252" y="283" font-size="16" fill="#DBD8CF" text-anchor="middle">HARNESS</text><ellipse data-hk="000000010000000000004000010a920a1480" cx="320" cy="255" rx="8" ry="8" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a920a1481" d="M326.5 258.1Q325.7 261.3 322.9 262.1Q320 263 316.8 261.7Q313.6 260.4 312.9 257.7Q312.1 255 313.4 252.5Q314.7 249.9 317.4 248.9Q320 247.9 323.1 248.8Q326.2 249.7 326.8 252.3Q327.3 255 326.5 258.1M326.6 257.5Q325 260.1 322.5 262.1Q320 264.1 316.9 262.4Q313.9 260.7 312.6 257.9Q311.4 255 312.5 252.2Q313.6 249.4 316.8 248.2Q320 247.1 322.9 248.1Q325.8 249.1 327 252.1Q328.2 255 326.6 257.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1490" d="M322.1 256Q322 257 321 256.7Q320 256.5 319.1 256.6Q318.2 256.8 317.5 255.9Q316.8 255 317.9 254.4Q319 253.9 319.5 253.4Q320 252.9 320.7 253Q321.4 253.2 321.8 254.1Q322.2 255 322.1 256M323 255.6Q322.5 256.1 321.2 256.5Q320 257 318.9 257.1Q317.8 257.3 318.1 256.2Q318.3 255 317.9 253.9Q317.6 252.8 318.8 252.5Q320 252.3 320.8 252.7Q321.6 253.1 322.6 254Q323.5 255 323 255.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1400" d="M327.4 257.1C329.2 257.6 330 257.7 331.2 258.9M327.2 257.2C329 257.9 330.4 258.6 332 258.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1410" d="M323.4 261.9C324.7 264 324.6 265.3 325.4 266M324.3 262C324.6 263.8 325.7 265.4 325.9 265.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1420" d="M317.9 262C316.9 263.9 316.7 265.6 316.6 267M318.2 263.1C317.3 264 316.8 265.7 316 265.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1430" d="M312.4 259.3C311.7 260.1 310.4 260.3 309.2 260.6M312.9 258.5C311.2 259.7 311.1 260.1 309.6 260.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1440" d="M312.8 252.7C310.6 252.8 309.6 251.9 308.1 251.7M312.4 252.7C310.4 252.8 308.7 251.2 309 251.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1450" d="M316.8 248C315.3 245.8 314.8 245.7 313.9 244.4M316.3 248C315.3 247.1 315.4 245.4 314.2 244.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1460" d="M321.9 247.1C323.3 245.9 323.2 243.9 324.1 243.8M321.9 247.2C322.9 245.7 323.9 244.8 324 243.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a1470" d="M327.4 251.4C328.7 250.8 329.9 250.4 331 249.4M326.9 251.3C328.8 251.1 329.8 249.9 330.6 249.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a150" d="M213 300.1Q177.6 330.9 172 345.5L166.4 360.2M211.2 298.8Q177.8 328.8 171.9 344L166.1 359.3M166.1 359.9C165.6 356 165.6 351.6 165.8 348.9M166.2 359.8C165.8 356.5 165.6 351.6 165.5 349.1M166 360.2C170 356.4 171.5 354.4 173.8 352.3M165.8 360.1C169.6 356.8 171.7 354.4 173.9 352.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a160" d="M291.2 299Q321.4 328.7 326.7 344L332 359.3M293.2 299.9Q322.8 329.9 327.3 345L331.8 360.2M332 359.8C328.3 356.5 325.9 353.3 324.5 352.2M331.8 360C329.3 357.4 325.9 353.4 324.5 351.6M332.1 360.3C332.6 355.7 332.6 352.5 333.2 348.9M332.3 359.9C332.4 356.1 333 352.2 332.8 349" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a920a170" x="106.5" y="366.5" width="112" height="49" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a920a171" d="M105.1 364.4C155.1 363 189.7 363.8 220.8 365.8M106 364.6C145.1 364.9 190.6 363.1 219.1 366M221 364.3C217.7 383.6 220.6 407.2 219.3 419.7M219.2 363.9C218.7 389.8 220.6 403.1 220.4 419.6M219.4 417.9C163.8 418.7 129.5 416.5 103.6 416.7M219.7 416C171.2 417.7 121 417.1 102.4 416.6M105.4 416.7C106.6 399.7 106.2 373.8 104.4 363.7M104.3 418.2C105 396.9 104.9 377.7 104.9 362.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a180" x="168" y="387" font-size="14" fill="#DBD8CF" text-anchor="middle">LLM</text><text data-hk="000000010000000000004000010a920a190" x="168" y="405" font-size="14" fill="#DBD8CF" text-anchor="middle">GATEWAY</text><ellipse data-hk="000000010000000000004000010a920a2000" cx="97" cy="362" rx="5" ry="5" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a920a2001" d="M101.5 364Q100.5 365.9 98.7 366.9Q97 367.9 95.2 366.3Q93.3 364.8 92.1 363.4Q90.9 362 92.5 360.3Q94.2 358.6 95.6 358.3Q97 358 99.1 358.1Q101.3 358.1 101.9 360.1Q102.6 362 101.5 364M101.5 363.6Q101.1 365.3 99.1 366.1Q97 366.8 95.3 366.2Q93.5 365.5 92.3 363.7Q91.1 362 92.4 360Q93.8 358 95.4 357.3Q97 356.6 98.6 357.5Q100.3 358.4 101.1 360.2Q101.8 362 101.5 363.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2010" d="M101.9 367.3C107.3 372.6 113.5 376.4 117.8 379.7M101.7 365.8C107.6 370.1 111.8 376.8 119.2 378.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2020" d="M109.7 377.5C108.3 378.6 106.2 381.4 106.6 382.6M110 376.5C107.7 379.1 107.3 380.3 105.4 381.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2030" d="M115 381.2C114 383.2 112.5 384.7 110.7 386.5M115 380.6C113.1 382.5 111.9 385.1 111.3 385.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2100" d="M213.2 356.4Q212.6 347.9 215.3 346Q218 344.1 221.9 345.5Q225.8 346.9 226 350.8L226.1 354.6M212.9 355.6Q211.6 347.9 215.9 345.8Q220.2 343.7 222.8 346.4Q225.4 349 225.5 352.7L225.6 356.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><polygon data-hk="000000010000000000004000010a920a2110" points="206,356 232,356 232,372 206,372" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a920a2111" d="M205.6 372.1C205.2 366.1 204.8 358.8 205.8 355.2M205.5 371.2C206.7 364.2 205.9 360.5 207.1 355.7M206.2 354.9C214.9 356.9 227.5 355.1 232.2 356.4M206.6 357C218.3 356.3 226.1 355.2 231 355.2M231.4 356.3C231.5 363.1 231.7 367.8 232.3 371.1M231 355.3C231.7 362.4 230.8 368.5 232.1 371M231 372.7C222.6 372 211.3 370.7 206.8 371.4M232.8 371C220.8 371.9 209.9 371.9 206.5 372.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a220" x="162" y="444" font-size="13" fill="#DBD8CF" text-anchor="middle" transform="rotate(-1 162 444)">keys live here</text><rect data-hk="000000010000000000004000010a920a230" x="271.5" y="366.5" width="127" height="49" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a920a231" d="M270.3 365.2C335.4 366.8 381.6 365.1 401 364.4M270.7 366.4C331.2 364.9 365.9 364 401.5 363.8M399 364.3C399.5 386.5 401.1 407.2 399.3 418.1M399.8 363.3C398.9 383.1 402 406.1 399.3 419M400.1 416.1C336.8 415.8 297.2 418 271 416.3M402 416.6C358 415.3 300.7 419.6 269.6 416.4M270.9 419.1C269.2 391.9 269.5 381 270.1 364.4M269 418.4C271.8 399.1 270.4 380.4 268.7 362.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a240" x="354" y="387" font-size="14" fill="#DBD8CF" text-anchor="middle">SESSION</text><text data-hk="000000010000000000004000010a920a250" x="354" y="405" font-size="14" fill="#DBD8CF" text-anchor="middle">STORAGE</text><ellipse data-hk="000000010000000000004000010a920a2600" cx="290" cy="378" rx="13" ry="4.5" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a920a2601" d="M301.1 380Q299.5 381.9 294.7 381.8Q290 381.7 285.6 381.2Q281.3 380.6 279.3 379.3Q277.3 378 279.4 376.8Q281.5 375.5 285.7 374.9Q290 374.3 294.6 374.2Q299.2 374.1 300.9 376.1Q302.7 378 301.1 380M300.9 379.4Q299.3 380.9 294.7 381.3Q290 381.6 285.1 381.2Q280.2 380.8 278.1 379.4Q276.1 378 278.2 376.3Q280.3 374.6 285.2 374.1Q290 373.5 294.4 373.8Q298.8 374.1 300.6 376.1Q302.4 378 300.9 379.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2610" d="M276.5 378.1C278.2 387.3 276.8 390.6 277.3 395.1M277.5 377.1C276.8 386.4 278.9 392.9 276.6 396" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2620" d="M302.5 378.4C302.5 384.5 304.5 389.3 302.9 396M303.7 377.6C304.1 386 302.8 392.3 302.2 395.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2630" d="M276.7 395.3Q289.6 400.5 296.4 397.6L303.2 394.6M277.8 396.1Q291.2 400.1 296.8 397.9L302.4 395.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a2640" d="M276.1 388.7Q289.1 392.4 295.7 390.9L302.4 389.5M277.6 388Q289.7 393.6 296.8 390.3L303.9 387" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a270" x="335" y="444" font-size="13" fill="#DBD8CF" text-anchor="middle" transform="rotate(0.8 335 444)">single writer</text><rect data-hk="000000010000000000004000010a920a280" x="556.5" y="156.5" width="392" height="267" rx="22" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a920a281" d="M575.7 153.6C718.4 153.5 845.2 155.8 927.8 155.5M577.8 155.6C691.3 154.9 846.6 157.9 927.2 154M949.7 177.2C952.6 258.4 947.7 359.5 948.8 404M949.3 177.8C951.3 266.8 951 339.1 950 403.1M928.6 425.5C790.6 422.3 691.3 424.3 576 425.5M926.7 425.6C776.2 426.7 655.8 425.5 576.7 423.5M554.2 402.7C558.2 308.9 554.5 218.6 554 176M556.3 404C553.1 296.9 553.7 237.2 554.2 178.4M928.5 153.8Q950 155.2 948.6 178.2M950.7 402.6Q951 425.8 926.8 425.8M575.8 425Q554 424.6 554.6 403.9M554 178.3Q556.5 156.5 575.8 156.3" fill="none" stroke="#F4644A" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a290" d="M320.7 276.8C423 274.7 537 277.4 586.7 277M320 278.7C424.2 279.4 525.1 278.5 584.6 278.8M585.3 277.1C581 278.9 577.2 280.6 574.8 281.7M585 276.9C582.2 278.3 577.6 280.7 575.1 281.8M585.2 276.9C580.9 275.1 578.1 273.5 574.7 272.7M584.7 277.2C582.2 275.6 576.4 273.4 574.7 272.2M320.1 277.2C325 274.5 328.1 273.3 329.8 272.9M319.7 276.9C325.3 274.6 327.2 273.5 330.3 272.3M320.1 276.8C323.1 278.5 327.7 280.2 330.2 281.5M319.9 276.9C323.9 278.9 326.7 280 330.3 281.6" fill="none" stroke="#DBD8CF" stroke-width="2.4" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a300" x="438" y="260" font-size="15" fill="#DBD8CF" text-anchor="middle">typed RPC</text><polygon data-hk="000000010000000000004000010a920a3100" points="482,248 504,248 496,259 490,259" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a920a3101" d="M490.4 259.1C486.5 254.4 484 249 481.4 249.1M489.5 259.5C486.2 255.9 482.4 249.8 481.9 247.1M483 247.5C490.1 248 499.9 247.2 504.9 248.3M482 249C489.2 248.5 498.1 246.6 504.3 249M503.8 248.2C500.2 252.4 498.9 255.9 497 260M503.5 248.5C500.6 251.2 496.3 258.1 496.3 258.7M495.8 259.4C493.4 258.7 491.7 258.8 489.6 258.9M495.7 259C494.1 259.2 491.9 259.1 489.6 259.1" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a3110" d="M492.6 259.1C492.4 261.5 493.4 263.3 493.2 265.6M492.5 259C492.4 261.8 492.7 264.7 493 265.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a320" x="445" y="312" font-size="14" fill="#DBD8CF" text-anchor="middle" transform="rotate(-0.6 445 312)">the only door</text><text data-hk="000000010000000000004000010a920a330" x="752" y="192" font-size="19" fill="#DBD8CF" text-anchor="middle"><tspan data-hk="000000010000000000004000010a920a331" font-weight="bold">VM</tspan> <tspan data-hk="000000010000000000004000010a920a332" fill="#F4644A">(untrusted)</tspan></text><text data-hk="000000010000000000004000010a920a340" x="955" y="112" font-size="13" fill="#F4644A" text-anchor="end" transform="rotate(-1 955 112)">if popped: attacker gets</text><text data-hk="000000010000000000004000010a920a350" x="955" y="128" font-size="13" fill="#F4644A" text-anchor="end" transform="rotate(-1 955 128)">a stub, python, and grep</text><path data-hk="000000010000000000004000010a920a3600" d="M598.2 222.7Q599.2 214.4 601.5 212.5Q603.7 210.6 608.8 211.4Q613.9 212.3 614.5 214.7L615.2 217.2M598.4 222.4Q598.5 213.7 602 211.4Q605.4 209.1 609.5 211.2Q613.6 213.3 614.5 215.2L615.4 217.2" fill="none" stroke="#44CFFF" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a3610" d="M616.3 217.8Q616.2 227.5 614 229Q611.8 230.6 607.3 229.9Q602.8 229.3 601.2 225.8L599.7 222.3M617.4 217.8Q616.4 225.8 614.3 227.5Q612.1 229.1 608.3 228.4Q604.4 227.7 602.6 226.1L600.8 224.4" fill="none" stroke="#F5B04A" stroke-width="3.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a3620" d="M604 213.7Q604.4 214.4 603.7 214.2Q603 214 602.8 213.8Q602.6 213.6 602.5 213.3Q602.4 213 602.3 212.4Q602.2 211.8 602.6 211.3Q603 210.7 603.3 211.6Q603.6 212.4 603.6 212.7Q603.6 213 604 213.7M603.9 213.9Q604.1 214.7 603.6 214.3Q603 214 602.9 213.8Q602.7 213.6 602.2 213.3Q601.7 213 601.5 212.7Q601.3 212.3 602.1 211.4Q603 210.4 603.5 211.3Q604 212.1 603.8 212.6Q603.6 213 603.9 213.9" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a3630" d="M614.4 227.7Q614.7 228.3 613.9 228.9Q613 229.4 612.2 229.1Q611.5 228.8 611.9 227.9Q612.4 227 612.2 226.2Q612 225.3 612.5 225.6Q613 225.9 613.4 225.9Q613.8 225.9 613.9 226.4Q614 227 614.4 227.7M614.9 227.6Q614.6 228.2 613.8 227.9Q613 227.6 612.2 228.2Q611.4 228.8 611.2 227.9Q610.9 227 611.6 226.1Q612.3 225.2 612.6 225.8Q613 226.4 613.9 225.8Q614.8 225.3 615 226.2Q615.2 227 614.9 227.6" fill="none" stroke="#121419" stroke-width="2" stroke-linecap="round"></path><ellipse data-hk="000000010000000000004000010a920a3700" cx="652" cy="220" rx="9" ry="9" fill="#1A1E25"></ellipse><path data-hk="000000010000000000004000010a920a3701" d="M659.6 223.5Q657.6 227 654.8 228.3Q652 229.7 648.6 228Q645.2 226.4 644.3 223.2Q643.5 220 644.2 216.4Q644.9 212.9 648.5 212.4Q652 211.8 655 212.5Q657.9 213.1 659.8 216.6Q661.7 220 659.6 223.5M659.4 223.4Q658.2 226.8 655.1 228.4Q652 229.9 649.2 228.2Q646.4 226.5 645.1 223.3Q643.8 220 644.5 216.6Q645.2 213.3 648.6 211.7Q652 210.2 655.3 211.5Q658.7 212.9 659.6 216.4Q660.6 220 659.4 223.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010a920a3710" d="M658.9 226.9C665.3 231.5 667.4 234.3 668.9 238.8M658.5 226.3C664.6 231.8 667.7 234.7 670.7 238.7" fill="none" stroke="#DBD8CF" stroke-width="2.2" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010a920a380" x="586.5" y="251.5" width="117" height="49" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010a920a381" d="M584.6 248.9C642.3 250.5 665.7 249.1 707.6 248.8M584.6 248.5C632.2 249.8 671.7 250.5 708.5 251.4M704 249.2C705 273.8 704.4 290.6 705.7 303.8M704.2 248.3C706.1 269.7 706.1 291.7 704.6 303.3M706 302.5C647.4 301.6 614 301.9 584.9 300.6M707.5 301.5C652.5 301.7 626.9 301.5 585.3 302.5M585 303.7C583.8 279.8 583.9 257.1 586.2 250.1M586.4 302.5C584.7 280.6 586.8 259.9 586 248.8" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a390" x="645" y="272" font-size="13.5" fill="#DBD8CF" text-anchor="middle">EXECUTOR</text><text data-hk="000000010000000000004000010a920a400" x="645" y="290" font-size="13.5" fill="#DBD8CF" text-anchor="middle">STUB</text><text data-hk="000000010000000000004000010a920a410" x="645" y="322" font-size="12.5" fill="#9AA2AD" text-anchor="middle">py + rg</text><path data-hk="000000010000000000004000010a920a420" d="M708.8 275.9C748 275.4 771.1 276.3 789.8 276.9M709.8 275.8C736.7 277.6 772.1 276 790.7 275.5" fill="none" stroke="#9AA2AD" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="6 5"></path><text data-hk="000000010000000000004000010a920a430" x="750" y="264" font-size="13" fill="#9AA2AD" text-anchor="middle">mirrored</text><polygon data-hk="000000010000000000004000010a920a4400" points="795,296 795,258 800,254 821,254 826,261 867,261 867,296" fill="#1A1E25"></polygon><path data-hk="000000010000000000004000010a920a4401" d="M868.1 295.2C839.7 296.6 820.3 295.3 794.8 296M867.7 296.3C832.4 295.4 810.9 296.5 794.5 296.1M794.4 295.6C794.2 282.2 794 268.4 794.5 258.2M795 295.8C796.4 281 795.2 268.4 794.5 257.6M795.4 257.9C796.7 256.2 798.3 255.3 800 253.9M794.8 258.1C797.7 255.7 798.7 254.7 799.7 254M800.9 253.8C807.4 253.1 816.7 255.6 821.3 253.1M799.1 255C807.9 254.5 816.3 254.4 821.1 253.4M820.7 254.1C823.5 256.7 825.7 259.7 826.2 260.7M820.8 253.8C822.7 256.5 823.7 259.1 825.9 261.3M826.3 262C842.9 261.1 855.7 260.6 867.5 259.9M825.3 261.8C845.1 261.2 853.7 261 866.1 260.5M866.9 262C866.9 273.9 867.4 288.6 867.3 296.5M866.1 260.5C867.2 275.3 867 288.3 866.9 296.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010a920a4410" x="831" y="285" font-size="13.5" fill="#DBD8CF" text-anchor="middle">&lt;git&gt;</text><text data-hk="000000010000000000004000010a920a450" x="831" y="322" font-size="13" fill="#DBD8CF" text-anchor="middle" transform="rotate(-0.8 831 322)">RO overlay</text><text data-hk="000000010000000000004000010a920a460" x="720" y="372" font-size="13" fill="#9AA2AD">that's it.</text><text data-hk="000000010000000000004000010a920a470" x="720" y="388" font-size="13" fill="#9AA2AD">nothing else.</text><text data-hk="000000010000000000004000010a920a480" x="950" y="545" font-size="14.5" fill="#DBD8CF" text-anchor="end" transform="rotate(-0.5 950 545)">minimum viable prisoner</text></svg></figure>

这几张图指向同一条边界：

- **宿主**拥有会话状态、推理、策略、工具路由、审批、限制和日志记录。
- **沙箱**通过一个小而顺从的协议负责环境执行。
- 每一条回传的流，都在不受信任的一侧耗尽宿主内存或上下文之前被限定了上限。

这种安排满足了 Factorio 用例，又不会让本地使用变差。同一个宿主可以把存根指向本地进程、容器、VM 或远程机器。

### 子代理跨越同一条边界

放置问题不只是宿主与 VM 之争。子代理在文件系统层也需要同样的边界：worktree 只隔离被跟踪的文件，而 `pi-iso` 借助 APFS、btrfs、ZFS、overlayfs、ProjFS 或兜底的复制方案，给每个子代理一份整个工作区的写时复制视图。子代理自行分化；父代理收到一份 diff。

子代理拿到的是视图，交回的是变更。它并不共享父代理的可变权威。这就是同一条宿主/沙箱规则在文件系统上的形态。

### omp 教会我们的：一次调用，三个互不相干的 API

好，那我们该如何定义一个工具？我们最初做的那些改动稍后再谈，但核心契约基本原封不动地保留了下来：

```
export const myCustomTool: ToolDefinition = {
	name: "my_tool",
	parameters: mySchema,

	// 1. Called during argument streaming & before execute()
	renderCall(args, theme, context) {
		if (context.argsComplete) {
			// Trigger async preview computation
		}
		return new Text("Pre-execution preview UI...", 0, 0);
	},

	// 2. Main execution
	async execute(_id, params) {
		/* ... -> string */
	},

	// 3. Called after execute() settles
	renderResult(result, options, theme, context) {
		return new Text("Final execution result UI", 0, 0);
	},
};
```

这份契约看起来小巧可人，但它把一个操作拆成了三个互不相关的阶段。预览、执行、给模型的结果、给人看的结果、诊断信息、流式更新、取消和日志记录，描述的全是同一次调用。这个 API 却让它们假装不是。

### 回调拆分导致重复劳动

首先，拆分渲染路径让响应式变成了一件需要主动选择加入的事。即便渲染出来的工具不会“啪”地切换成新形态，作者也得把大部分展示逻辑重复写一遍。

更大的问题在于 `execute` 的工作方式。以 Edit 为例：

- `renderCall` 会打开文件，但愿能把读到的部分缓存在某处（哪儿？），应用编辑，然后渲染出一份 diff
- `execute` 接着会再次打开文件，应用全部编辑、写入，并以对模型友好的格式返回一份 diff
- `renderResult` 随后拿到这份 diff，却得去解析我们定下的那个格式！为什么？因为人类当然想看带颜色、带高亮的版本，最好行号也更好看些。

这导致了一种凭本能写出的实现：

- 浪费 I/O 时间：文件被打开两次
- 浪费 CPU 时间：编辑的应用不是算一次，也不是两次，而是每变一个字符就从头再算一遍（renderCall 可不是协程！）
- 对任意格式做不必要的序列化/反序列化：为了实现 renderResult，我们得去解析模型输出（或者在 details 里塞一些片段，让记入日志的数据重复一份）

要让这事高效起来，你得实现一个在这份定义之外驱动的协程，找个地方存放它的句柄，而且结果反序列化那一整套活儿你仍然逃不掉。

问题不仅仅是代码重复。这份契约里没有一个权威对象，其状态能从“参数流式传入”经过“运行中”走到“已完结”。每个实现都得为这个生命周期自己发明一条旁路信道。

### omp² 的改变：执行是一条状态流

此外也没有通用的办法来添加结构化的警告、诊断信息或截断提示。大多数 Pi 工具实现最终都写成了这样：

```
text += `\n${theme.fg("warning", `[Truncated: ${truncation.outputLines} lines shown (${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit)]`)}`;
```

模型于是只能猜测工具数据在哪里结束、harness 附加的说明从哪里开始。由于 `execute` 不是生成器，流式输出还得在更新信道之上再叠一层协议。

DOM 模型把这两个特例都消除了：

- 流式输出就是修改 `<result>` 的主体；
- 添加警告就是创建一个 `<diag severity="warn">`。

执行进行期间，客户端收到的是针对这份状态的补丁。一旦执行完结，相对于前一状态的最终 diff 会被记入日志。

在统一的会话模型里，一次调用就是一个带结构化子节点的元素：

```sql
<Edit id="e41" status="running" version="3">
   <input i="Update the parser without changing the public API">…</input>
   <result>…streaming structured state…</result>
   <diag severity="warn">…</diag>
   <usage tokens="0" elapsed-ms="842"/>
</Edit>
```

执行器在运行过程中修改这个元素。模型、用户、日志、远程客户端和测试 harness 观察到的是同一份状态的不同投影。完结时最终 diff 被冻结；没有哪个客户端需要去解析一个结果字符串，来还原序列化之前那个更丰富的对象。

### 限制是原语的一部分

Pi 的工具没有任何限制：返回 1 MB 文本，它就原封不动地转发给模型。这个原语太底层了，不适合直接暴露出去。

#### 只在一处限定输出

Pi 自己在 `Bash` 和 `Read` 上就碰到了这个问题，它的回应是导出一个截断工具函数供各实现共用。omp 在这个工具函数之上加了一套工件（artifact）系统，让模型可以把保留下来的完整输出读回来，但责任仍然留在 Pi 放它的地方：每个实现自己头上。

把 1 MB 发给模型或许是一项值得保留的能力，但它应该是可以选择退出的——一个集中的实现，外加一个显式的 `notrunc` 属性——而不是让截断成为一种需要主动选择才能获得的良好设计。把这个辅助函数留作可选，会在两方面失败。

大多数工具都需要某种程度的截断，所以一个需要主动选用的辅助函数必然导致覆盖参差不齐：

- 不知道有这个辅助函数的作者会自己造一个，每个的提示语都略有不同；
- 从没想过结果会很大的作者则什么都不做。

在工具实现内部截断，而不是在对话渲染层截断，会破坏 Code 模式：

- 智能体在 `Eval` 里永远无法信赖工具的输出；每次使用都得先把 harness 附加的说明从数据里解析剔除；
- `Eval` 的结果本身也可能被截断，于是每次调用都在同一份数据外面叠上 N+1 层彼此独立的截断。

#### 只在一处限定阻塞时间

把*任何东西*放到后台，以及给一次调用可以阻塞多久设上限，同样属于库这一层——而不是属于每一个恰好跑得很久的工具。

第一个理由是缓存和用户体验。否则一次意外漫长的调用会让智能体无法察觉并调整、用户回来时面对一个卡住的会话、自主任务无限期等待，而提供商的 KV 缓存则在调用返回前就过期了。

第二个理由是重复，这一点 omp 也搞错了。当每个工具都长出自己的后台化机制，每个工具也就都长出了自己的 spawn、poll、message、kill 和 list 辅助函数。看看 Claude 围绕它自己的 `Task` 和 `Bash` 工具画的这张图：

<figure data-hk="000000010000000000004000010b135"><svg data-hk="000000010000000000004000010b13600" viewBox="0 0 1000 630" role="img" aria-label="Mapping of Claude Code's background Bash tool surface against its Task subagent surface: spawn, stream out, message in, stop, result, and list each have a counterpart on both sides — run_in_background/Task, BashOutput/system-reminder, stdin/SendMessage, KillShell/interrupt, exit code/tool_result, /bashes/ListAgents." font-family="var(--st-font-sketch)"><defs><pattern id="bvt-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="630" fill="#121419"></rect><rect width="1000" height="630" fill="url(#bvt-dots)"></rect><rect data-hk="000000010000000000004000010b136010" x="101.5" y="49.5" width="277" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b136011" d="M110.2 49.5C224.2 49.2 325.3 48.1 371.1 48.6M111.1 47.3C216 47.5 291 47.6 371 49.2M378.5 59C381.7 69.2 381.2 77.8 379.2 81.4M380.8 56.6C380.7 66.8 380.5 74.4 381.4 82.9M371.3 90.9C285.5 91.7 160.6 89.8 111.3 91.7M369.7 92.4C287.9 92.3 178.9 91.2 110.3 92.6M99.5 81C99.5 71.1 100.4 64.2 100.3 57.8M100.5 82.8C99.3 70.5 98.2 63.5 99.4 58.6M371 49.4Q381 47 380.9 59M378.9 80.6Q380.4 92.3 369.7 92.2M110.9 90.9Q100.3 93.5 101.5 82.6M99.8 57.2Q99.5 46.7 109 48.3" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b136020" x="240" y="76" font-size="15.5" fill="#4ADE80" text-anchor="middle" stroke="#4ADE80" stroke-width="0.8">Background Bash</text><rect data-hk="000000010000000000004000010b136030" x="431.5" y="49.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b136031" d="M439.8 49.1C502 46.9 547.8 47.2 580.2 47M440.2 48.1C509.4 48.1 534.6 48.8 579.1 49.4M589.6 58C590.4 67.4 588.5 76.6 589.2 83.2M590.7 57C588.2 65.6 588.6 74 591.5 80.6M579.1 92.2C530.2 94.3 471.1 93.4 440.2 92.9M579.4 90.8C533.2 93.7 480.5 89.8 439.7 91.4M428.6 83C428.7 72.8 429.2 64.9 430.7 59.2M429 83.3C428.1 70.5 428.7 61.1 431.4 57.7M581.4 47.7Q589 47.3 588.8 58.1M590.1 80.7Q590.7 92.3 580.6 90.6M440.2 92Q429.2 90.7 428.6 83.2M429.5 57.9Q428.9 48 439.3 49.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b136040" x="510" y="76" font-size="15.5" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8">Interface</text><rect data-hk="000000010000000000004000010b136050" x="651.5" y="49.5" width="277" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b136051" d="M660.1 48.8C744.9 51.4 862.3 50.1 919.8 47.1M660 47.4C779.1 46.4 858.6 47.1 919.9 47.8M929.4 58.2C931 70.6 928.3 76.4 930.4 83M928.5 59C928.8 70.4 930.6 76.9 931.4 83.2M920.6 91.2C799.5 93.4 741.1 89.8 659.7 93M920.9 92.5C802.6 91.4 729.7 90.7 660.7 92.6M650.3 83.3C649.5 71 651.6 64.8 650.6 57.3M650.4 80.9C650.1 70.1 651.2 64.3 650 56.8M919.9 47.4Q929.4 48.5 931.2 57.1M930.1 80.7Q930.3 92.2 918.7 91.8M661.3 91.2Q648.6 93.1 649 82.9M649 57.3Q650.3 46.9 660.9 49.2" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b136060" x="790" y="76" font-size="15.5" fill="#A78BFA" text-anchor="middle" stroke="#A78BFA" stroke-width="0.8">Subagent</text><rect data-hk="000000010000000000004000010b13607000" x="101.5" y="117.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607001" d="M109.1 115.2C224.2 115.9 314.1 112.7 371.1 115.4M110.4 116.4C209.6 117.3 300.8 117.3 370.8 117.4M380.3 125.3C381 141.7 381.1 150.9 379.4 161.1M381.1 127C380.9 138.7 382.3 153.6 380.7 162.8M369.6 170.8C281.3 173.5 163.5 171.2 110.8 171.4M371.2 172.1C287.4 170.6 186.7 172.6 108.8 171.7M100.7 162.7C101.1 147 100.6 139 99.8 125.8M100 162.9C101.1 145.1 100.9 136.9 99.9 127M370.3 115.4Q379.6 114.7 379.5 127M380.6 161.1Q378.9 172.8 371 170.6M110.6 172Q100.8 172 100.8 160.5M99.9 126.3Q100.7 115.9 110.1 115.2" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607010" x="240" y="141" font-size="14.5" fill="#4ADE80" text-anchor="middle">Bash</text><text data-hk="000000010000000000004000010b13607020" x="240" y="160" font-size="12.5" fill="#9AA2AD" text-anchor="middle">run_in_background: true</text><rect data-hk="000000010000000000004000010b1360710" x="431.5" y="123.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b1360711" d="M440.4 121.3C493 122.2 534.9 119.9 580.8 120.8M439.1 122.7C507.9 121.5 550.3 121.4 581.1 120.7M588.8 131.9C590.3 142.6 588.9 151.4 588.5 155.1M590.6 133.1C591.1 140 590.7 149.5 588.9 155M579.7 165.7C536.5 164.3 486.8 165 438.7 165.3M579.5 166.6C517.8 165 469.8 168.1 441 165.2M430.8 155.9C429.7 143.6 430.4 137.3 431.1 133.4M430 156.2C431.3 145.7 430.9 138.2 428.6 132.7M579.6 121.8Q590.8 123 590.9 132M589.4 156.3Q591.5 164.9 580.1 167.3M439.2 166.8Q430.8 166.5 429.4 155.1M430.1 132.2Q430 123 439.7 120.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1360720" x="510" y="150" font-size="14.5" fill="#DBD8CF" text-anchor="middle">Spawn</text><rect data-hk="000000010000000000004000010b13607300" x="651.5" y="117.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607301" d="M661.1 117.4C788.3 117 839.4 113.6 918.5 117M659.2 114.7C770.3 115.7 835.6 118 920.2 114.5M929.7 124.6C931 145.2 931.7 153.6 928.7 163.4M931.2 127.3C930.8 139.5 930.4 154.4 930.3 161M919.1 173.4C791.7 173.5 702.9 171.1 658.7 172.4M921.1 170.6C827 171.8 737.7 172.3 660.1 171M649.8 162.6C650.3 148.5 649.3 133.8 648.9 125.3M651.1 162.7C651.1 150.7 649.7 136.3 649.9 125.2M919.6 117.5Q931.4 116.7 930.2 125.9M929.9 162.2Q931.4 171.8 919.1 171.5M660.9 173.4Q649.6 172.2 650 161.8M651 127.4Q649.8 117.2 659.4 116.4" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607310" x="790" y="141" font-size="14.5" fill="#A78BFA" text-anchor="middle">Task</text><text data-hk="000000010000000000004000010b13607320" x="790" y="160" font-size="12.5" fill="#9AA2AD" text-anchor="middle">prompt, subagent_type</text><path data-hk="000000010000000000004000010b1360740" d="M389.2 145.3C397.5 144.3 414.4 145.7 421.3 143.6M388.2 143.7C402.1 145.3 415.9 143.5 421.7 142.6" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b1360750" d="M597.7 143.9C618.7 142.8 634.4 143.9 642.2 143.2M598.1 143.3C616.4 142.9 631.8 143.8 643 144" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><rect data-hk="000000010000000000004000010b13607600" x="101.5" y="201.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607601" d="M109.5 199.3C199.2 199.2 295.2 199.5 368.8 198.9M111.1 201.1C189.2 203.5 320.8 202.9 369 200.9M379.8 209.1C381 224.5 379.2 233.9 380.1 244.9M381.1 209.9C379.3 225.2 381.7 238.1 380.2 245.4M369.4 254.6C262.4 258.2 167.7 252.4 108.6 256.7M371.4 255.9C286.9 253.9 191.8 255.8 111 256.7M99.8 244.8C99.5 230 99.9 218.2 99.9 208.9M100.4 247C100.9 232.8 100.5 219.4 101.1 210.8M369 199.1Q380.5 199.1 379.9 209.4M380.2 247.2Q380.3 257.3 370.4 255.7M111.3 254.8Q98.7 255.5 98.6 245.8M98.9 210.6Q98.8 200.8 109.2 199.7" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607610" x="240" y="225" font-size="14.5" fill="#4ADE80" text-anchor="middle">BashOutput</text><text data-hk="000000010000000000004000010b13607620" x="240" y="244" font-size="12.5" fill="#9AA2AD" text-anchor="middle">poll by bash_id</text><rect data-hk="000000010000000000004000010b1360770" x="431.5" y="207.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b1360771" d="M440.6 206.9C484.9 206.9 557.2 205.8 578.8 205.2M441.3 206C506.2 204.8 538.7 206.9 579.9 204.8M591.2 214.5C589.7 225.1 590.8 232 589.5 240.1M589.5 214.5C590 225.7 590.8 233.9 590.4 239.2M578.6 249.8C533.5 247.9 473.3 250.8 440.4 248.9M580.8 250.6C536.7 251.7 475.1 249.3 441 250.2M429.8 241.2C430.7 228.7 431.2 223.6 430 215M429.9 239C430.7 230.7 428.8 221.7 431.3 216.4M579.7 205.6Q590.2 205.4 589.4 215.2M590.6 240Q589.2 250.7 580.6 248.6M441.1 250.1Q430.6 250.2 431.1 238.9M429.1 216Q431.2 206.8 441.5 205.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1360780" x="510" y="234" font-size="14.5" fill="#DBD8CF" text-anchor="middle">Stream out</text><rect data-hk="000000010000000000004000010b13607900" x="651.5" y="201.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607901" d="M659.4 201.2C783.1 201.8 856.8 198.6 920.8 201.5M659.3 200.6C740.4 202.6 847.9 202.5 920.6 201.5M930.1 210.6C932 227.9 930.1 236.8 929.8 247.2M931.1 211C930.7 225.2 928.5 235.4 929.4 246.4M920.4 256.3C800.4 256.1 721.1 258.7 661.3 255.8M919.5 254.7C801.2 257.2 739.3 256.4 659.6 254.9M648.7 246.2C648.6 228.7 649.2 222.8 649.1 210.5M650 244.5C648.9 227.7 651.2 216.6 650.2 210.4M920.7 199.8Q930.9 200.2 928.9 210.4M930.6 245.7Q928.9 255.4 918.6 254.6M661.4 256Q649.8 255.9 649.5 246.7M651.3 209.5Q649 200.3 660.3 200.3" fill="none" stroke="#F5B04A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607910" x="790" y="225" font-size="14.5" fill="#F5B04A" text-anchor="middle">system-reminder</text><text data-hk="000000010000000000004000010b13607920" x="790" y="244" font-size="12.5" fill="#9AA2AD" text-anchor="middle">async agent notification</text><path data-hk="000000010000000000004000010b13607a100" d="M387.6 228.6C399.9 227.9 416.2 227.4 422 228.5M387 228.2C402.2 227.7 413 227.5 422.2 226.8" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b13607a110" d="M598.1 228.4C613.6 226.9 628.9 229.4 642.5 228.4M597.5 229.4C613.1 229.5 633.9 228.3 641.6 226.8" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><rect data-hk="000000010000000000004000010b13607a1200" x="101.5" y="285.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a1201" d="M109.8 282.8C214.2 281 304.5 284.7 371 283.6M109.6 285.3C208.7 285.1 327.9 283.2 369.9 282.5M381.3 294.8C379.9 309.9 378.9 322.7 380.5 329M380.1 295.4C380.8 308.6 379.1 319.8 380 329.8M369.6 341.4C277.3 341.4 151.3 342.7 108.6 339.5M369.4 339.5C274.4 338.9 188.6 342.3 111.2 340.9M99 330.3C98.1 319.3 101.4 304.8 98.5 292.9M100.4 328.8C100.5 319 99.2 304.3 99.4 294.2M371.2 284Q380.3 283 381.4 294.2M380.8 330.3Q381.5 340.7 369.9 338.6M111.5 340.2Q99.8 338.9 101 328.7M101.1 292.7Q99.5 285.4 109.3 284.9" fill="none" stroke="#F5B04A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a1210" x="240" y="309" font-size="14.5" fill="#F5B04A" text-anchor="middle">stdin</text><text data-hk="000000010000000000004000010b13607a1220" x="240" y="328" font-size="12.5" fill="#9AA2AD" text-anchor="middle">no tool exposed</text><rect data-hk="000000010000000000004000010b13607a130" x="431.5" y="291.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a131" d="M440.1 289.6C498.3 291.6 548.8 292.9 581.5 291M441.2 289.9C492.2 288.4 557.4 287.2 581.5 290M591.5 300.1C588.7 308 590 317.9 590.3 323.9M589.3 301.4C589.5 307.5 588.9 317.5 591 324.7M578.5 334.1C524 333.5 473.7 335.1 439.1 334.8M580 335.4C519.2 335.3 487.2 333.5 439.7 332.7M431.1 325.3C428.2 314.8 430.4 306.5 429.8 298.7M430.6 323.1C430.9 314.9 428.8 306.3 428.8 300.5M580.3 290.2Q590.5 291.1 588.6 299.4M590.6 324.1Q589.6 332.6 580.5 334.4M439.2 333.3Q430.7 335.3 429.8 324.4M429.8 301.2Q428.5 289.9 439.5 290.4" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a140" x="510" y="318" font-size="14.5" fill="#DBD8CF" text-anchor="middle">Message in</text><rect data-hk="000000010000000000004000010b13607a1500" x="651.5" y="285.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a1501" d="M659.9 282.5C766.9 280.4 853.6 283 920.3 283M661.5 283.1C765.3 284.2 873.1 287.4 920.8 285.1M929.7 293.8C929 309.2 930.4 322.8 931.2 328.6M931.1 295.3C928.9 307.8 930 319.1 929.4 329.1M918.8 340.8C805.6 342 722.8 341.1 660.2 340M918.8 340.2C830.9 342.9 745.4 337.9 658.7 341.4M649.8 329.9C651.9 314.8 649.6 305.3 648.7 294.7M651.4 329.7C651.4 317.5 649.3 302.4 650.7 295.2M919.2 285.5Q929.9 284.3 930.6 293.9M931.2 330.1Q930.3 339.8 921.2 340.6M660.1 340.5Q648.5 339.2 651.1 328.5M649.8 294.6Q649.5 285.1 659.8 284.7" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a1510" x="790" y="309" font-size="14.5" fill="#A78BFA" text-anchor="middle">SendMessage</text><text data-hk="000000010000000000004000010b13607a1520" x="790" y="328" font-size="12.5" fill="#9AA2AD" text-anchor="middle">agent_id, message</text><path data-hk="000000010000000000004000010b13607a160" d="M386.6 311.9C401.1 312 412.3 311.1 421.7 311.2M389.4 311.4C403.3 310.3 416.7 313.5 421.1 311.1" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b13607a170" d="M597 311.6C613.6 312.3 627.4 309.8 640.9 310.7M598.9 312.7C612.9 312.4 629.2 312.7 642.6 313.1" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><rect data-hk="000000010000000000004000010b13607a1800" x="101.5" y="369.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a1801" d="M109.8 367C220 369.5 331.2 365.9 371 367.2M109.1 367.9C190 369.4 292.9 368.8 370.6 367M380.6 378.3C379.8 394.1 379.2 406.4 381.2 414.4M381.3 379C381.8 395.7 380.4 403.2 380.8 414.6M370.6 422.8C255.8 423.6 167.2 424.3 110.4 425.3M371 422.6C240.8 425.7 185.9 422.2 109.1 423.7M98.5 414.1C100.6 401.6 98.7 388.4 99 379.2M99.6 413.7C99.8 402.8 98.9 384.8 98.9 377.6M370.6 368Q381 367.2 380.4 377.8M380.4 412.8Q378.7 422.9 369.2 425.3M110.2 424.2Q101.3 423.9 101.3 414.5M99.8 377Q98.5 368.3 109.9 367.1" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a1810" x="240" y="393" font-size="14.5" fill="#4ADE80" text-anchor="middle">KillShell</text><text data-hk="000000010000000000004000010b13607a1820" x="240" y="412" font-size="12.5" fill="#9AA2AD" text-anchor="middle">shell_id</text><rect data-hk="000000010000000000004000010b13607a190" x="431.5" y="375.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a191" d="M439.1 373.3C487.5 371.6 550.1 375.5 580.6 374.9M440.7 375C499.4 373.5 555.5 373.3 580.6 373.1M590.1 382.7C590.1 393.3 589 402.2 591.2 407.3M591.4 383.2C589.4 395.8 590.8 402.6 588.6 408.9M581.4 418.8C526.8 417 463.6 417.3 439.9 417.4M578.6 416.9C536.1 418.1 467.7 416.5 440.8 418M431 409.4C430.2 397.9 428.8 390.6 431.1 385M429.8 408C430.8 397 429 388.2 430.1 382.7M579 373.1Q588.9 373.1 591.3 384.2M589.3 407.8Q588.7 418.4 580.8 419.5M440.6 419.3Q430.8 418 429.1 408.4M431.4 384.6Q428.7 373.4 440.3 374.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a200" x="510" y="402" font-size="14.5" fill="#DBD8CF" text-anchor="middle">Stop</text><rect data-hk="000000010000000000004000010b13607a2100" x="651.5" y="369.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a2101" d="M660.8 369.4C772 366.1 873.9 366.7 919.3 367.9M659 368.4C768.2 368.6 852.5 364.8 919.6 366.9M931.3 377.6C929.6 391.6 929.2 408 930.7 414.2M930.1 378.9C928.8 389.7 929.7 407.2 930.1 415.2M919.9 423.7C832.5 423.6 710 421 659.5 423.5M919.9 425.4C799.7 421.9 730.5 424.4 659.6 423M649.7 413.2C650 396.1 651.4 388 650.1 377.5M649.4 413.1C650.6 399.2 648.6 391.3 650.9 378.4M920.8 368.4Q929.7 367.2 930.1 379.5M929.8 413.7Q930.9 425.2 918.9 422.6M660.1 422.8Q649.6 425 650.2 413.2M649.2 376.7Q649 369.2 661 368" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a2110" x="790" y="393" font-size="14.5" fill="#A78BFA" text-anchor="middle">interrupt</text><text data-hk="000000010000000000004000010b13607a2120" x="790" y="412" font-size="12.5" fill="#9AA2AD" text-anchor="middle">cancel_queued: true</text><path data-hk="000000010000000000004000010b13607a220" d="M388.1 395.7C401.9 396.1 412.1 396 423.4 395.5M387 394.7C403.4 397 415.8 395.6 421 395.3" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b13607a230" d="M596.8 394.6C618.7 394.9 632.3 396.1 641.5 395.2M598.4 397.1C615.5 397 626.2 397.5 642 395" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><rect data-hk="000000010000000000004000010b13607a2400" x="101.5" y="453.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a2401" d="M111.5 451.4C226.7 450.4 283.4 454.8 369.4 452.2M109 452.2C234 452.5 279.7 448.8 368.5 452.2M380.8 462.4C379.4 476.1 379.2 486.7 381.3 498.2M379.5 463.3C380.8 475.3 380.4 492.4 379.5 497.1M368.7 507.1C286.9 509 180.7 505.8 109.6 509.3M369.9 508.6C269.2 508.4 153.3 509.8 110.1 507.4M99.2 498.5C100.4 488.1 99.7 470.8 100.3 461.8M100.7 499.5C100.1 487.4 101.2 469 100.2 460.9M369.8 451.9Q379.5 451.2 380.6 461M380.1 499.3Q379 507.8 371.5 508M110.7 508.4Q99.7 508.1 100.9 498.1M99.8 462.9Q99.6 453.2 111.2 453.2" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a2410" x="240" y="477" font-size="14.5" fill="#4ADE80" text-anchor="middle">exit code + tail</text><text data-hk="000000010000000000004000010b13607a2420" x="240" y="496" font-size="12.5" fill="#9AA2AD" text-anchor="middle">final BashOutput</text><rect data-hk="000000010000000000004000010b13607a250" x="431.5" y="459.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a251" d="M439.9 456.8C492.6 457 548.7 457 580.7 456.7M440.2 458.2C503.3 458.1 543.6 460.4 580.5 459.4M589.4 467.8C590.7 476.4 588.1 485.2 590.6 492.2M590.3 467.6C590.7 476.6 588.3 486.3 589.1 492.4M581.1 501.6C514.7 500.6 480 501 438.9 501.4M579.9 501.8C517.9 504.6 459.8 501.4 440.3 502.9M428.6 491.9C430 480.1 431.2 476.2 431.5 469M431.1 491.3C430.1 482.5 430 476.3 430.9 466.7M581.5 458.2Q589.9 458.7 590.5 469.2M589.6 490.9Q589.3 502.3 579.8 502M440.9 502.9Q430.2 503.4 430.6 492.5M429.1 467.9Q428.7 456.9 439.4 457.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a260" x="510" y="486" font-size="14.5" fill="#DBD8CF" text-anchor="middle">Result</text><rect data-hk="000000010000000000004000010b13607a2700" x="651.5" y="453.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a2701" d="M660.2 452.5C764 452.1 863.4 453.7 921.4 451.4M660.2 450.8C770.7 452.7 877.7 453.3 920.3 452M928.9 462.9C929.9 478.2 929.8 485.7 928.8 497.5M930.6 462.3C929.2 478.5 929.8 489.5 929.1 499.2M919.9 508.8C815.6 509.1 724.3 510.1 661.3 508.5M919.2 507.7C827.6 508.4 710.6 508.5 659 508.6M651 497.8C650.3 481 650.7 469.7 649.3 461M650.9 498.2C648.1 485.8 649.7 469.7 651.1 461.2M920.7 452.1Q929 451.7 929.1 461.4M930.5 498.5Q928.7 508.8 920.5 509.3M659.9 509.3Q649.3 509.3 649.3 496.5M649.7 462.9Q650.6 452.6 659.1 450.6" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a2710" x="790" y="477" font-size="14.5" fill="#A78BFA" text-anchor="middle">tool_result</text><text data-hk="000000010000000000004000010b13607a2720" x="790" y="496" font-size="12.5" fill="#9AA2AD" text-anchor="middle">Task result block</text><path data-hk="000000010000000000004000010b13607a280" d="M389.2 480C404.8 478.9 416.5 481.6 422.5 478.7M389.1 481.2C402.1 482 417.3 479.6 423.2 480.3" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b13607a290" d="M597.3 480.2C614 479.4 634.5 480.4 642.4 479.7M596.9 480.6C617.7 480.1 631.1 479.5 641.4 478.6" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><rect data-hk="000000010000000000004000010b13607a3000" x="101.5" y="537.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a3001" d="M109.3 536.5C199.3 534.7 308.2 537.3 369.3 535.8M111.2 535.5C197.2 539.1 312.9 537.1 370.4 535.9M379.9 545.2C379.7 561.1 380.1 570.4 378.6 582.4M380.9 546C382.1 560.3 380.5 571.9 381.2 582.5M370.8 591.7C257.7 589.9 187.4 588.5 108.8 593.2M369.9 591C259.5 590.7 184 593 108.8 591.8M100.3 582.4C100.8 566.4 99.8 553.2 99.6 547.1M101.4 582.3C97.7 568.1 101.8 551.5 101 544.9M370.6 537.2Q380.6 534.6 378.9 544.6M378.8 581.1Q381.3 592.3 369.5 592.1M109.1 591.1Q99.4 591.2 99.8 582.2M98.7 546.4Q99.5 535.3 109.8 536.3" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a3010" x="240" y="561" font-size="14.5" fill="#4ADE80" text-anchor="middle">/bashes</text><text data-hk="000000010000000000004000010b13607a3020" x="240" y="580" font-size="12.5" fill="#9AA2AD" text-anchor="middle">running shells</text><rect data-hk="000000010000000000004000010b13607a310" x="431.5" y="543.5" width="157" height="41" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a311" d="M438.5 541.2C483.7 539.2 534.8 542.1 581.4 540.9M440.7 542.8C483.9 541.5 539.1 543.5 580.6 541M589.1 550.6C590.3 563.6 589.5 569.5 590.4 577M589.1 551C590.5 561.7 590 568.1 590 576.5M579.1 587.2C531.8 585 485.1 587.7 440.4 585.8M581.3 587.1C533.3 583.5 487.2 585.7 440.7 584.5M428.6 575.8C431.1 564.2 428 556.6 429.1 553.2M429.7 576.1C430.1 567.9 429.5 558.5 430.5 550.9M579.2 541.4Q590.9 542 590.9 550.9M590.9 574.7Q590.1 587.2 578.9 584.9M439.6 586.1Q429.9 585.2 429.7 576.7M431 551Q428.5 542.4 439.8 542.7" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a320" x="510" y="570" font-size="14.5" fill="#DBD8CF" text-anchor="middle">List</text><rect data-hk="000000010000000000004000010b13607a3300" x="651.5" y="537.5" width="277" height="53" rx="10" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b13607a3301" d="M660.4 534.8C782.6 534.1 856.2 536.6 921.2 537M659.9 536.1C748.6 537.1 857.8 536.3 921.4 536M929.7 546.6C929.9 561 931.3 574.1 930.2 582.8M931.4 545.9C930.6 559.2 930.3 574 930.3 581.5M921 592.7C831.3 590.1 717.6 593.3 660.5 592.6M919.4 592.3C823.4 594.5 708.2 592.2 660.7 591.1M650.8 581.9C650.1 571.3 650 557.9 648.7 546.3M650.2 582.4C649.2 567.7 649.5 554.8 648.6 545.1M920.5 537.2Q929.9 536.6 929.2 545.2M929.9 581.8Q929.1 593.3 918.6 592.7M660.4 591.7Q650.5 590.7 651.4 581.9M651 547.1Q651.4 537.1 660.8 535.1" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b13607a3310" x="790" y="561" font-size="14.5" fill="#A78BFA" text-anchor="middle">ListAgents</text><text data-hk="000000010000000000004000010b13607a3320" x="790" y="580" font-size="12.5" fill="#9AA2AD" text-anchor="middle">running agents</text><path data-hk="000000010000000000004000010b13607a340" d="M388 564.6C401.9 565.9 415.4 563.6 420.9 564.7M387.1 563.6C400.5 564.2 412.3 563.4 422.2 563.6" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b13607a350" d="M598.2 562.7C614.7 564.1 628.2 564.7 640.5 562.8M597.2 564.7C614.9 563.2 635 564.3 642.8 564.3" fill="none" stroke="#9AA2AD" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="6 5"></path><text data-hk="000000010000000000004000010b136080" x="952" y="616" font-size="13" fill="#9AA2AD" text-anchor="end" transform="rotate(-0.6 952 616)">claude's map of its own tools</text></svg></figure>

两者都收敛到进程的接口上：`signal` + `stream in` + `stream out`。后台化的 shell、子代理、开发服务器守护进程、远程函数，以及一次超出预算的普通调用，全都是同一种对象——一个带 stdin、stdout、退出状态和信号句柄的任务。一个 stdio 形态的任务原语就应该把它们全部封装起来。这样阻塞预算只在一处强制执行，输出只溢出到一条工件路径，而检视、发消息或终止其中任何一个，都是同一个操作面，而不是每个工具各抄一份。

对可观测性的期待也以同样的方式收敛。想看子代理状态的用户，也想看后台化的 shell。跨 harness 实例给同伴发消息的智能体，也想看到那些同伴运行的守护进程，这样同一目录下的 N 个智能体就能共用一个 HMR `bun dev`，而不是在 N 个端口上启动 N 份副本。

### 取消需要一条终止边界

扩展——因而也包括自定义工具——与引擎共享同一个 JavaScript isolate，会通向灾难。像样的热重载几乎不可能实现，而一次工具调用一旦逃出了协作式取消的掌控，就再也无法被强行停止。

JavaScript 和 Go 分别通过 `AbortSignal` 和 `context.Context` 暴露取消机制：有用的协议，但并非强制执行的协议。忘了传递信号、调用了一个不接受信号的依赖、跑了同步工作，或者陷入无限重试循环，那么超时只是告诉智能体继续往下走；那份工作本身可能还在后台持续烧资源。

因此一个安全的宿主需要一个它真正能够终止的执行单元——进程、worker、子解释器、VM 请求，或等价的边界，其死亡不会把会话权威一并带走。取消属于运行时契约，而不是寄望于每位工具作者的良好自觉。

### 让这条强制边界用起来舒服

一个刻意做得很笨的沙箱存根带来了最后一个 SDK 问题：扩展作者现在面对的是两个文件系统。不然的话，一个自定义的编辑函数可能得在一侧读取文件、整个传过去、再在另一侧写回。

这就是 omp² 为扩展选择 Python 的原因。Python 可以用标准库审视自己的 AST，把一个函数所需的源码打包起来，提交给另一个运行时；一个 `@remote` 属性就能把一个看起来像本地的函数变成 RPC。正是这一特性，让远程函数在 Modal 的 Python SDK 这类系统里用起来如此自然。

自带 Python 运行时还让 `Eval` 变得可靠，而不再取决于机器上碰巧装了哪个解释器。一石二鸟。

当工作有了可信的所有者和可取消的执行原语之后，harness 仍然需要一种连贯的方式来控制各种值和多轮次行为。那就是控制平面。

## 控制平面

运行时掌握着两种不同类型的控制。**值**回答的是哪个模型、哪个服务档位、哪个主题或哪条策略当前生效。**行为**回答的是智能体是否可以让出（yield）、是否必须再跑一轮、或者是否临时需要某项能力。一旦每个调用方都各自持有一个私有的 setter 或标志位，这两者都会变得混乱不堪。

### 值：策略随设置一同声明

配置系统同样成了一片雷区：既有脏数据跟踪，又有好几层配置（全局、会话级、临时……）。大多数 get/set 操作都像在 Pi 里那样经由 `AgentSession` 类型中转，因为变更必须持久化到 JSONL。

你知道哪个配置系统在多年前就把这些问题全部解决了吗？没错，Source 引擎！

尤其了不起的是，大多数碰过 Valve 游戏的人都能脱口而出 `sv_cheats` 是干什么的。这么多年来大家一直在自定义自己的配置，我却想不起有哪怕一个不满意的用户。其他任何软件的任何一项配置，你还能记得吗？

一个 [convar](https://developer.valvesoftware.com/wiki/ConVar) 就是一个带类型的变量，有名字、默认值、帮助文本，以及一组按位表示的 **flags**，在定义处一次性声明完毕：

```
ConVar sv_gravity("sv_gravity", "800", FCVAR_REPLICATED | FCVAR_NOTIFY, "World gravity.");
```

持久化、归属权、作用域、复制，甚至回放时的如实性：全都是**变量自身的属性**，在它诞生之处一并声明。没有人需要把 `set` 绕道经过一个上帝对象，也没有人需要手搓脏数据跟踪。

<figure data-hk="000000010000000000004000010b158"><svg data-hk="000000010000000000004000010b15900" viewBox="0 0 1000 610" role="img" aria-label="Convar model: the server owns sv_cheats, sv_gravity, mp_friendlyfire, and a protected sv_password; REPLICATED forces server values onto every read-only client copy, USERINFO sends the client-owned name upward, ARCHIVE persists cl_interp to config.cfg, CHEAT locks r_drawothermodels unless sv_cheats is 1, and every change is stamped into the .dem so replay stays honest" font-family="var(--st-font-sketch)"><defs><pattern id="cv-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="610" fill="#121419"></rect><rect width="1000" height="610" fill="url(#cv-dots)"></rect><text data-hk="000000010000000000004000010b1590100" x="500" y="48" font-size="26" fill="#DBD8CF" text-anchor="middle" letter-spacing="2" stroke="#DBD8CF" stroke-width="0.8">FLAGS, NOT PLUMBING</text><path data-hk="000000010000000000004000010b1590110" d="M298.6 61.4C472.2 60.1 563.9 63.3 701.2 58.7M300.6 59.3C431.2 59.1 623.3 62.4 700.6 60.6" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b159020" x="500" y="88" font-size="13.5" fill="#9AA2AD" text-anchor="middle">ConVar("sv_gravity", "800", <tspan data-hk="000000010000000000004000010b159021" fill="#44CFFF">REPLICATED</tspan> | <tspan data-hk="000000010000000000004000010b159022" fill="#F5B04A">NOTIFY</tspan>, "World gravity.")</text><rect data-hk="000000010000000000004000010b159030" x="49.5" y="113.5" width="369" height="281" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b159031" d="M48 112.9C205.4 109.6 304.8 108.5 422.6 110.8M46.6 111.7C169.4 112.6 326.8 113.9 422.3 111.1M421.1 110.3C418.9 233 421.4 330.8 421.5 395.7M420.2 111.7C418.7 232.1 422.5 333.7 420.8 397.7M421.4 394.7C281.3 393.4 158.8 395.7 47.6 396M421.3 397.1C283.5 391.7 173.2 396.9 47.5 395.4M47.3 398.4C45.5 261.9 45.7 165.6 47 111M47.2 398.5C47.2 272.3 46.2 162.1 47.6 111.3" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="7 5"></path><text data-hk="000000010000000000004000010b159040" x="68" y="144" font-size="17" fill="#DBD8CF" stroke="#DBD8CF" stroke-width="0.8">SERVER</text><text data-hk="000000010000000000004000010b159050" x="158" y="144" font-size="15" fill="#4ADE80">(one authority)</text><path data-hk="000000010000000000004000010b159060" d="M265.1 134.2Q273.7 143.7 282.5 132.4L291.3 121.1M265.1 135.4Q273.2 142.9 283.2 132.6L293.1 122.2" fill="none" stroke="#4ADE80" stroke-width="2.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b159070" x="68" y="186" font-size="14.5" fill="#DBD8CF">sv_cheats <tspan data-hk="000000010000000000004000010b159071" fill="#9AA2AD">0</tspan></text><text data-hk="000000010000000000004000010b159080" x="68" y="226" font-size="14.5" fill="#DBD8CF">sv_gravity <tspan data-hk="000000010000000000004000010b159081" fill="#9AA2AD">800</tspan></text><text data-hk="000000010000000000004000010b159090" x="68" y="266" font-size="14.5" fill="#DBD8CF">mp_friendlyfire <tspan data-hk="000000010000000000004000010b159091" fill="#9AA2AD">0</tspan></text><text data-hk="000000010000000000004000010b1590a100" x="68" y="306" font-size="14.5" fill="#DBD8CF">sv_password <tspan data-hk="000000010000000000004000010b1590a101" fill="#9AA2AD">•••</tspan></text><text data-hk="000000010000000000004000010b1590a110" x="400" y="186" font-size="13" fill="#DBD8CF" text-anchor="end"><tspan data-hk="000000010000000000004000010b1590a111" fill="#44CFFF">REPLICATED</tspan> <tspan data-hk="000000010000000000004000010b1590a112" fill="#F5B04A">NOTIFY</tspan></text><text data-hk="000000010000000000004000010b1590a120" x="400" y="226" font-size="13" fill="#DBD8CF" text-anchor="end"><tspan data-hk="000000010000000000004000010b1590a121" fill="#44CFFF">REPLICATED</tspan> <tspan data-hk="000000010000000000004000010b1590a122" fill="#F5B04A">NOTIFY</tspan></text><text data-hk="000000010000000000004000010b1590a130" x="400" y="266" font-size="13" fill="#44CFFF" text-anchor="end">REPLICATED</text><text data-hk="000000010000000000004000010b1590a140" x="400" y="306" font-size="13" fill="#9AA2AD" text-anchor="end">PROTECTED</text><rect data-hk="000000010000000000004000010b1590a150" x="581.5" y="113.5" width="369" height="281" rx="18" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b1590a151" d="M599.1 112C719.4 115.7 839.5 112.7 934.7 112.6M596.7 113.1C724.8 111.1 872.5 113.8 934.5 111.4M953 128.9C955 242.2 952.6 314.5 952.2 378.3M951.1 130.9C949.3 224.4 952.7 322.4 950.9 378.9M933.1 395.1C806.9 397.4 673.8 398.2 598 396.7M934.6 394.8C811.5 397.1 684 394.3 599.2 396.2M581.4 379C578 261.1 583.9 171.3 580 130.9M579.7 378.9C580.6 297 577.5 187.7 580.5 129.9M933.8 112.6Q950.8 110.6 950.8 131.4M951.9 377.8Q952.5 395.5 933.3 395.8M597.7 395.8Q579.8 395.6 581 376.8M581.4 129.4Q579.7 111.7 599.3 112.8" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a160" x="600" y="144" font-size="17" fill="#F4644A" stroke="#F4644A" stroke-width="0.8">CLIENT</text><text data-hk="000000010000000000004000010b1590a170" x="688" y="144" font-size="15" fill="#F4644A">(every player)</text><text data-hk="000000010000000000004000010b1590a180" x="600" y="186" font-size="14.5" fill="#44CFFF">sv_cheats <tspan data-hk="000000010000000000004000010b1590a181" fill="#9AA2AD">0</tspan></text><text data-hk="000000010000000000004000010b1590a190" x="600" y="226" font-size="14.5" fill="#44CFFF">sv_gravity <tspan data-hk="000000010000000000004000010b1590a191" fill="#9AA2AD">800</tspan></text><text data-hk="000000010000000000004000010b1590a200" x="600" y="266" font-size="14.5" fill="#DBD8CF">cl_interp <tspan data-hk="000000010000000000004000010b1590a201" fill="#9AA2AD">0.031</tspan></text><text data-hk="000000010000000000004000010b1590a210" x="600" y="306" font-size="14.5" fill="#DBD8CF">r_drawothermodels <tspan data-hk="000000010000000000004000010b1590a211" fill="#9AA2AD">1</tspan></text><text data-hk="000000010000000000004000010b1590a220" x="600" y="346" font-size="14.5" fill="#DBD8CF">name <tspan data-hk="000000010000000000004000010b1590a221" fill="#9AA2AD">"can"</tspan></text><text data-hk="000000010000000000004000010b1590a230" x="932" y="186" font-size="12.5" fill="#9AA2AD" text-anchor="end">read-only</text><text data-hk="000000010000000000004000010b1590a240" x="932" y="226" font-size="12.5" fill="#9AA2AD" text-anchor="end">read-only</text><text data-hk="000000010000000000004000010b1590a250" x="932" y="266" font-size="13" fill="#A78BFA" text-anchor="end">ARCHIVE</text><text data-hk="000000010000000000004000010b1590a260" x="932" y="306" font-size="13" fill="#F4644A" text-anchor="end">CHEAT</text><text data-hk="000000010000000000004000010b1590a270" x="932" y="346" font-size="13" fill="#4ADE80" text-anchor="end">USERINFO</text><text data-hk="000000010000000000004000010b1590a280" x="600" y="322" font-size="12" fill="#F4644A" transform="rotate(-1 600 322)">locked unless sv_cheats = 1</text><path data-hk="000000010000000000004000010b1590a290" d="M425.3 180C496.7 180.3 544.4 182.7 574.8 181.2M423.8 181.9C482.7 180.1 524.7 181.7 576 180.5M575.9 180.2C571.1 181.8 569.2 183.5 566 184.8M575.9 180.1C572.8 181.6 567.5 183.7 565.7 184.5M575.7 179.8C571.8 178.5 568.2 176.8 565.7 175.4M576.1 179.9C572.3 178.1 567.9 176.1 565.7 175.7" fill="none" stroke="#44CFFF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b1590a300" d="M422.9 218.9C489.7 218.5 543.6 219.1 574.3 221.3M424.6 220.3C476.8 220.3 533.3 222.3 576 219.3M575.9 220.1C572.5 221.4 568.6 222.9 566.2 224.7M575.7 219.9C571.9 222.2 569 223.3 565.7 224.1M575.8 219.8C572 218.7 568.5 216.5 566.2 215.5M576.3 220C571.5 217.7 568.5 216.4 565.8 215.8" fill="none" stroke="#44CFFF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a310" x="500" y="198" font-size="13" fill="#44CFFF" text-anchor="middle" stroke="#44CFFF" stroke-width="0.8" transform="rotate(-1 500 198)">REPLICATED</text><text data-hk="000000010000000000004000010b1590a320" x="500" y="212" font-size="12" fill="#9AA2AD" text-anchor="middle">forced onto every client</text><path data-hk="000000010000000000004000010b1590a330" d="M576.2 339.6C500.3 339.1 463.3 341.4 422.2 341.3M575.1 340.5C506.4 339.2 463.6 341.3 426 341M423.8 339.8C428.5 338.2 431.1 337.2 433.9 335.2M423.7 339.9C428.6 337.9 431.9 337 433.8 335.8M424.3 340C427.9 341.7 431.4 343.2 433.8 344.5M423.8 340.2C427.9 341.8 431.3 343.5 434.3 344.4" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a340" x="500" y="328" font-size="12.5" fill="#4ADE80" text-anchor="middle">USERINFO · sent up</text><path data-hk="000000010000000000004000010b1590a350" d="M956.9 179.7Q986.5 222.4 985.7 241.4Q984.9 260.4 972.4 278.9L959.9 297.4M958.6 178.8Q985.8 221.9 986.1 240.8Q986.5 259.6 973.6 278.2L960.7 296.7M959.7 298.3C960.8 293.8 961.4 290.6 962.2 287.4M960.1 298.3C960.9 293.8 961.5 289.9 962 287.2M960.1 297.8C964.1 295.5 966.4 294.5 969.2 291.9M960.1 298.2C962.9 296.1 966.4 294.2 969.5 292.4" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b1590a360" d="M234.7 394C232.6 411.1 235 430.5 235.7 439.9M234.7 395.6C235.8 417.6 235.1 426.4 233.7 437.6M233.9 438.1C232.1 433.7 230.9 430.9 229.6 427.8M234.2 438.1C232.3 435 231 431.2 229.7 427.6M234.1 438.1C236.2 433 237.7 429.5 238.5 427.7M234.3 438.1C236.2 433.4 237.9 429.3 238.8 427.6" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010b1590a370" x="175.5" y="443.5" width="117" height="41" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b1590a371" d="M172.9 443.3C231.4 441.9 266.6 442.4 294.9 441.7M172.7 441.5C220.6 444.3 261.9 441.4 293.1 440.6M294.9 440.7C294.3 454.6 294.2 474.1 293.9 487.7M293.7 441.1C296.1 461 292.7 471.2 294 487.7M293.4 485.7C235.7 487.8 210 486.6 173.3 486.7M294 486.3C256.3 486.1 206.3 485.2 172.7 486.1M174 484.8C174.1 468.6 173.4 453.7 173.3 443.3M174.1 486.5C174.8 469.2 174.6 448.4 172.9 441.5" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a380" x="234" y="470" font-size="14" fill="#A78BFA" text-anchor="middle" stroke="#A78BFA" stroke-width="0.8">.dem</text><text data-hk="000000010000000000004000010b1590a390" x="252" y="414" font-size="12.5" fill="#9AA2AD" transform="rotate(-0.5 252 414)">every change stamped into the demo,</text><text data-hk="000000010000000000004000010b1590a400" x="252" y="429" font-size="12.5" fill="#9AA2AD" transform="rotate(-0.5 252 429)">replay stays honest</text><path data-hk="000000010000000000004000010b1590a410" d="M766.4 396.4C767.2 411 765.9 432.1 765.1 438.5M765.9 396.9C767.7 410.3 767.4 431.5 766.2 437.9M766.2 438C764.4 434.1 762.6 430.6 761.5 427.7M765.9 438.1C764.8 434.6 762.7 430.9 761.3 427.9M765.8 437.9C767.4 434.9 769.3 430.5 770.4 428.1M766 438.3C767.2 434.8 768.9 431.3 770.4 428.3" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010b1590a420" x="697.5" y="443.5" width="137" height="41" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b1590a421" d="M693.8 442.6C759.2 442 809.3 443.7 838.5 441.2M694.1 441.8C738.7 442.9 790.3 442.4 838.6 441.8M835.5 441.5C837 463 834.6 480.1 836.2 486.8M837.4 439.5C836.1 454.5 836.6 479.3 836.3 486.4M836.7 485.9C774.1 484.3 740.2 484.7 696.4 487.2M837.4 485.8C770.2 486.7 729.3 489.2 694.7 485.8M694.9 487.4C695.3 469.2 696.8 451.8 696 442.8M696.8 486.5C694.7 465.9 698 453.2 696.4 441.9" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a430" x="766" y="470" font-size="14" fill="#A78BFA" text-anchor="middle" stroke="#A78BFA" stroke-width="0.8">config.cfg</text><text data-hk="000000010000000000004000010b1590a440" x="784" y="414" font-size="12.5" fill="#9AA2AD" transform="rotate(-0.5 784 414)">ARCHIVE vars written to disk,</text><text data-hk="000000010000000000004000010b1590a450" x="784" y="429" font-size="12.5" fill="#9AA2AD" transform="rotate(-0.5 784 429)">everything else is ephemeral</text><text data-hk="000000010000000000004000010b1590a460" x="500" y="520" font-size="13" fill="#9AA2AD" text-anchor="middle"><tspan data-hk="000000010000000000004000010b1590a461" fill="#F5B04A">NOTIFY</tspan> = change announced to every player&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;PROTECTED = value never leaves the server</text><path data-hk="000000010000000000004000010b1590a470" d="M47.1 539.5C346.6 538.5 813.4 542.6 953.2 541M48.8 540.5C471.2 538.9 805.4 542.3 951.2 540.2" fill="none" stroke="#9AA2AD" stroke-width="1" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b1590a480" x="500" y="572" font-size="15.5" fill="#DBD8CF" text-anchor="middle"><tspan data-hk="000000010000000000004000010b1590a481" fill="#F4644A">set() through a god object + dirty tracking</tspan>&nbsp;&nbsp;-&gt;&nbsp;&nbsp;<tspan data-hk="000000010000000000004000010b1590a482" fill="#4ADE80">flags where the variable is born</tspan></text><text data-hk="000000010000000000004000010b1590a490" x="952" y="600" font-size="13" fill="#9AA2AD" text-anchor="end" transform="rotate(-1 952 600)">one store. flags decide the rest.</text></svg><figcaption>One authoritative server store, mirrored to every client. REPLICATED pushes values down, USERINFO sends client-owned vars up, CHEAT locks vars behind <code data-hk="000000010000000000004000010b16000">sv_cheats</code>, ARCHIVE decides what reaches <code data-hk="000000010000000000004000010b16100">config.cfg</code> — and every change is stamped into the <code data-hk="000000010000000000004000010b16200">.dem</code>.</figcaption></figure>

convar 并不是挂在会话 DOM 旁边的第二个设置数据库。一个会话作用域的 convar，就是权威树中又一个记入日志的节点；它的 flags 声明了它如何参与恢复、回退、派生（spawn）、复制与归档。

### 继承不该需要第二个设置

如今在 omp 里，服务档位（也就是 `/fast`）为子代理单独设了一项设置。

```
tier:
  openai: priority
  subagent: inherit   # separate setting
```

在 convar 的世界里，`ai_fastmode` 就是*一个*变量，带 `SESSION` 标志：随会话一起记入日志，所以恢复会话时值也会一并还原。继承根本不需要任何标志：派生出的子代理默认会用父级的实时值来初始化*每一个*变量。没有任何东西需要显式开启。

想让子代理固定为某个值？一行搞定：

```
# subagent.cfg — auto-exec'd for every spawn
ai_fastmode 0

# sonic.cfg — auto-exec'd when a sonic spawns, class config
ai_model @smol
ai_thinking low
```

主会话用 `config.cfg`，任意数量的用户 cfg 作为配置档案，每次派生时自动执行 `subagent.cfg`，再在其上叠加 `<agent>.cfg`，顺带也解决了那个有一千个属性的上帝对象。TF2 早就知道该怎么走了！

现在一个值就同时描述了主会话和它的子代理。继承规则住在值被定义的地方，而不是变成日益膨胀的会话上帝对象上的又一个属性。

### 配置档案与快捷键绑定都留在带内

而一旦有了 cfg，bind 会让事情更上一层楼：`bind`、`toggle` 和 `alias` 同样都是控制台命令，所以我们一直在为之反复发明 schema 的每一种输入模式，都能留在带内（in-band）。用户想要一个隐藏思考过程的快捷键？

```
bind ctrl+t "cl_showthinking 0"        # careful — one-way; the second press still writes 0
bind ctrl+t "toggle cl_showthinking"   # there we go; toggle also cycles value lists

alias +thinkhud "cl_showthinking 1"         # fires on key-down...
alias -thinkhud "cl_showthinking 0"         # ...and on key-up
bind ctrl+h +thinkhud                       # hold to peek at the thinking stream
```

我们的快捷键绑定层就该是这个样子：而不是一套自带默认值表的定制 schema！

命令流是把一切连在一起的结缔组织：cfg 文件、控制台输入、alias、bind、远程管理以及日志回放，全都基于同一批已声明的变量，讲同一种语言。自定义不再催生一个又一个一次性的 schema。

### 行为：loop 形状的洞

另一个值得关注的话题是可扩展性。我得说，Pi 的扩展层其实相当出色，但它确实有一个“loop”形状的洞。

于是我干脆去装了 Pi 上最流行的 Plan 与 Goal 实现。试着同时激活两者，你会看到：

![Pi 状态栏显示：警告：本会话中已有另一个工作流处于活跃状态。请先结束它再启动计划模式。](https://stencil.so/blog/harness-playbook/plan-goal-mutex.png)

好吧！有意思，可是并不存在什么“workflow”这样的 API。这是怎么做到的？原来这些实现自己定义了一套：

```javascript
export const WORKFLOW_MUTEX_CHANNEL = "workflow:mutex:v1";
export const AGENT_WORKFLOW_GROUP = "agent-workflow";

export class WorkflowMutex {
  private session: object | undefined;
  private readonly heldGroups = new Map<string, WorkflowMutexOwner>();
  private generation = 0;
  private readonly pi: Pick<ExtensionAPI, "events">;

  constructor(pi: Pick<ExtensionAPI, "events">) {
    this.pi = pi;
    pi.events.on(WORKFLOW_MUTEX_CHANNEL, (payload) => {
      this.answer(payload);
    });
  }
```

啊哈！两个实现出自同一位作者之手，这位作者早就遇到过这个问题，于是构建了一套在自家那一整套插件之间通用的解决方案。

引入一套系统来封装这种行为的复杂度，就这样被下放给了插件作者，而插件作者只能做出一套仅在自家扩展之间有效的系统。

omp 也有类似的问题：

```
// modes/interactive-mode.ts — the exclusivity "system", in its entirety
if (this.goalModeEnabled || this.goalModePaused) { this.showWarning("Exit goal mode first."); return; }
if (this.vibeModeEnabled)                        { this.showWarning("Exit vibe mode first."); return; }
// …restated by hand at six other entry points
```

只要各自独立编写的行为一碰头，缺失的那层抽象就暴露无遗。一把私有互斥锁能让同一位作者的 Plan 和 Goal 插件互不冲突，却无法让任意扩展彼此组合。omp 手写的模式检查也有同样的局限。

由此得出两个决定：给拥有 loop 的那个原语起个名字，叫 **Director**；并把更多内置行为搬到公开的扩展面上，让扩展面上的洞再也无法被视而不见。

### Director 拥有候选让出

智能体有一个 loop。越来越多的东西想要指挥这个 loop：计划模式想一直再跑一轮直到计划出炉，目标模式想一直再跑一轮直到目标达成，`/force` 想改动下一次推理，待办提醒则想在我们让出之前获得最后一次反对的机会。

那就给**智能体层**一个专门拥有这项决策的对象：一个 Director 栈。

这里说的“栈”，指的是会话 DOM 里一棵活生生的子树，而不是一个我们承诺以后再序列化的 Python 数组。DOM 是权威来源；运行时只负责遍历它。

```
candidate yield flows this way ────────────────────────────────┐
                                                               ▼
Base  →  TodoReminder  →  Goal  →  Plan  →  ForceTool(write)
                                                parent    child/top
```

loop 本身依旧无聊得很：

```
while True:
    request = directors.prepare_inference(base_request)  # outside → inside
    turn = await inference(request)
    await execute_tools(turn)

    if turn.has_tool_calls:
        continue

    decision = await directors.on_yield(turn)            # inside → outside
    match decision:
        case Continue(): continue
        case Yield():    return
```

`prepare_inference` 从外到内遍历这个栈，因此最内层的行为可以在父级即将发出的请求基础上进一步细化。`on_yield` 则反过来从内往外走。每个 Director 可以：

- **Pass（放行）**——让下一个 Director 来检视这次候选让出。
- **Continue（继续）**——吞下这次让出，再跑一轮。
- **Yield（让出）**——吞下它，并真正把控制权让出给用户。
- **Push（压入）**——在自己之上压入一个子 Director。
- **Done（完成）**——把自己弹出，然后把同一个候选让出交给父级。
- **Fail（失败）**——带着错误弹出。

于是，回退会移除 Director，恢复会把它们还原，远程检视器也能看到当前是哪个行为拥有这次候选让出。

### 完整的计划模式

假设计划模式处于激活状态，而模型在没有写出计划文件的情况下就试图让出。Plan 会先于任何外层行为看到这次候选让出：

```python
class Plan(Director):
    async def on_yield(self, agent, turn):
        if not turn.wrote(self.plan_file):
            return agent.force_tool(
                "write",
                until=lambda turn: turn.wrote(self.plan_file),
                reminder="Write the plan file before yielding.",
                retries=3,
            )

        if not turn.called("ask") and not turn.proposed_plan():
            return agent.force_tool(
                "required",
                until=lambda turn: turn.called("ask") or turn.proposed_plan(),
                reminder="Propose the plan, or ask the user what is missing.",
                retries=3,
            )

        return Yield()
```

这时 `force_tool("write")` 在软模式下会压入一个小巧的内置 Director，由它把这项能力注入到下一次推理请求中：

```python
class ForceTool(Director):
    def prepare_inference(self, request):
        return request.with_tool_choice(self.tool)

    async def on_yield(self, agent, turn):
        if self.until(turn):
            return Done()                    # pop; offer the yield back to Plan
        if self.retries_left:
            return Continue(self.reminder)
        return Fail("tool requirement exhausted")
```

栈上 Plan 的下面本来就已经有另一个 Director：

```
Base → TodoReminder → Plan
```

候选让出会先到达 Plan。只要 Plan 处于激活状态，它要么继续，要么压入一个子 Director，要么直接让出给用户。它不会 `Pass`，所以外层的 TodoReminder 永远看不到这次让出。

扩展使用的是一模一样的接口：

```
await agent.direct(VerifyBeforeYield(...))
```

```
<directors>
  <todo-reminder id="d1">
    <plan id="d2" plan-file="local://auth-plan.md">
      <force-tool id="d3" tool="write" attempts="1" max-attempts="3"/>
    </plan>
  </todo-reminder>
</directors>
```

这是一次完整的组合，而不是又一个特殊模式。Plan 拥有这次让出，临时压入 ForceTool，在子 Director 完成后重新拿回同一个候选让出，然后要么继续，要么把它交还给用户。

### 钩子、Director 与推理

- **钩子（hook）**观察或修改单次推理或单个轮次。
- **Director** 能跨轮次保持控制，并拦截让出。
- Director 之间可以真正地堆叠、嵌套、结束，并恢复其父级。

这就足以让计划、目标、vibe、autoresearch、提醒以及外部验证这些行为共用同一个智能体层原语，而无需让每一个都去了解其他所有行为的私有标志位。

`ForceTool` 表达的是一个语义层面的请求：“下一个成功的轮次必须调用 `write`。”它并不知道所选提供商是否原生支持 `tool_choice`，不知道强制调用会不会毁掉缓存，也不知道本地模型是否需要额外的提示。这层翻译属于推理层。

现在控制平面能够说出“应该发生什么”了。下一章要做的，是让这个请求在互不兼容的模型与提供商之间都意味着同一件事。

## 推理

控制平面提出的是语义层面的要求：流式调用这个模型、强制那项能力、约束成这个形状、数一数这些 token。推理层则必须把这些请求翻译成“这个确切的模型、在这个确切的宿主（host）上、通过这个确切的 API”实际能做到的事。

### omp 教会我们的：怪癖变成了架构

这一条很好解释，因为 omp v1 上已经有一个现成的前后对照提交。

在 `dd57045396` 之前，OpenAI 兼容性逻辑全都住在一个 880 行的文件里，围绕着一个巨大的 builder。打开它，迎面而来的是这个：

```javascript
const isCerebras = modelMatchesHost(hostModel, "cerebras");
const isZai = modelMatchesHost(hostModel, "zai");
const isKimiModel = isKimiModelId(spec.id);
const isMoonshotKimi = isKimiModel && isMoonshotNative;
const isAnthropicModel =
    modelMatchesHost(hostModel, "anthropic") ||
    isClaudeModelId(spec.id) ||
    isAnthropicNamespacedModelId(spec.id);
// …then DeepSeek, Qwen, MiMo, Grok, Mistral, OpenCode, local servers
```

然后这些布尔值再喂给另一些布尔值、几层嵌套的三元表达式，最后汇成一个巨大的 `compat` 对象。Kimi 在思考时允许强制工具调用吗？取决于是哪个 Kimi、在哪个宿主上、通过哪个 API。这个回环 URL 指的是 llama.cpp，还是 LiteLLM 在代理别的什么东西？那就再加一条特例吧。

单看任何一个分支，它都没有错！每一条都修复了一个真实的提供商 bug。问题在于，同一份知识最终被编码在了好几个地方：

- `compat/openai.ts`：880 行
- `model-thinking.ts`：977 行
- `variant-collapse.ts`：1,776 行
- 各自独立的 Bedrock、Anthropic 与 Devin 兼容性 builder
- 模型发现与提供商序列化器里还有更多的名字检测

取而代之的是什么？

```
taxonomy/   "what model is this string?"
classes/    "what is true of this model lineage?"
providers/  "what does this host change?"
```

于是 Anthropic 的思考配置现在读起来是这样：

```
class "anthropic" {
    on "anthropic" "amazon-bedrock" "google-vertex" {
        family "sonnet" {
            revision ">=3.7 <4.6" { thinking-mode "budget" }
        }
        revision ">=4.7" {
            thinking-mode "anthropic-adaptive"
        }
    }
}
```

这才是我们一直想表达的那份真正的知识！4.6 之前的 Sonnet 版本用预算式思考；Anthropic 4.7+ 用自适应思考；而且只在我们核实过的宿主上才这么声明。

KDL 本身并不神奇。真正把我们从“用更漂亮的格式重建同一堆烂摊子”里救出来的，是编译器：

- 未知的指令或取值？报错。
- 两条同等具体的规则设置同一项？报错，文件顺序不会偷偷胜出。
- 没有匹配的规则？未知，而不是“false”。

这样一来，提供商就没那么怪了吗？当然不。我们仍然有叫 `requires-mistral-tool-ids`、`qwen-preserve-thinking`、`strip-deepseek-special-tokens` 的兼容性轴，还有十种不同写法的“把推理关掉”。看看这些名字，哭一场吧。

它救我们脱离的，是把下一个怪癖再表达成四个不同函数里的又一个分支。现在它是一条规则，放在拥有该事实的地方，一旦优先级有歧义编译器就会冲你大喊，而推理层终于能够回答：*这个确切的模型，在这个确切的宿主上，究竟支持什么？*

赢的地方不在于怪癖变少了，而在于每个事实只有一个所有者、优先级是显式的、以及当库尚未确立答案时有一个 `unknown` 状态。harness 的其余部分不再通过提供商名字分支来反复重新发现模型身份。

### 提供商不只是 `stream`

从我为 Pi 实现 web-search 插件的那一秒起，这件事几乎注定要回来纠缠我。事实上，同样的压力也砸在了这个仓库极简主义的源头上，看看 Pi 新的[图像模型](https://github.com/earendil-works/pi/blob/main/packages/ai/src/image-models.ts)实现就知道了。

Pi 把提供商建模为 `stream` 和 `streamSimple`，差不多就这些了！要快速搭起一个提供商这很棒，但要在它上面越垒越多就不那么棒了，因为：

- Anthropic 的 token 计数接口怎么办？
- 或者，Codex 的 WebRTC 语音端点与远程压缩（compaction）？
- 或者，Anthropic/OpenAI 的网页搜索？
- 或者，嵌入向量？
- 或者，图像/视频生成？
- 或者，分词？
- 或者，用量查询？
- 或者，模型发现？

你觉得每一个做了其中某件事的扩展，也都正确实现了同步的 OAuth 刷新与重试吗？

除此之外，能用上推理提供商支持的最前沿控制项是一大胜利，举几个例子：

- 受限采样
- OpenAI 的文本详细程度选项
- Google 的上下文过滤选项
- 强制工具调用
- Developer 角色
- 会话中途的系统提示词
- ...

认证刷新、重试、token 计数、搜索、生成、发现以及提供商原生控制项，都是共享基础设施。把它们留给扩展去做，必然得到同一协议的好几份残缺实现。

### 能力策略：强制工具调用

强制工具调用说明了为什么“支持一个标志位”是不够的：

- **在不支持的提供商上报错：** 任何 harness 原生特性都无法使用它，除非把模型清单中的一大部分排除在外。
- **静默丢弃：** 调用方拿到一条出乎意料的尽力而为路径，只好自己发明一套强制执行循环。
- **盲目透传：** 提供商的副作用变成产品 bug；比如 Anthropic 就可能把强制调用变成整段对话的缓存失效。
- **干脆不暴露：** 知情的调用方绕过库自己动手，把上述三种失败模式全部重演一遍。

一个理想的 harness 实现：

1. 总是注入一段软提示，告诉模型下一轮必须调用该工具。这值得无条件去做：OpenAI 这类托管 API 会悄悄替你加上这句提醒，但开源推理引擎不会，于是 vLLM 后面的模型会遭遇一个从没人告诉过它的硬约束，在开启推理（reasoning）时手足无措。软提示抹平了这种不对等。
2. 只在免费时才设置原生标志位。如果提供商支持无副作用的强制工具调用，就透传。如果它带有代价，就跳过这个标志位，只靠软提示。
3. 不服从时升级。如果模型没有调用该工具，就在有限次数内重试；作为最后手段，即便要付出代价也设置原生标志位。劝说失败之后，正确性胜过缓存。

<figure data-hk="000000010000000000004000010b250"><div data-hk="000000010000000000004000010b2510" role="img" aria-label="Flowchart of the forced-tool-call strategy: always inject a soft prompt telling the model it must call the tool; set the native tool_choice flag only when the provider supports forcing without side effects; if the model still does not call the tool, bounded retries escalate to setting the flag despite its cost before surfacing failure to the caller."><svg id="forced-tool-call-0" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="max-width: 755.3125px;" viewBox="0 0 755.3125 1275.621826171875" role="graphics-document document" aria-roledescription="flowchart-v2"><g><marker id="forced-tool-call-0_flowchart-v2-pointEnd" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-pointStart" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-pointEnd-margin" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" style="stroke-width: 0; stroke-dasharray: 1, 0;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-pointStart-margin" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" style="stroke-width: 0; stroke-dasharray: 1, 0;"></polygon></marker><marker id="forced-tool-call-0_flowchart-v2-circleEnd" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="forced-tool-call-0_flowchart-v2-circleStart" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="forced-tool-call-0_flowchart-v2-circleEnd-margin" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="forced-tool-call-0_flowchart-v2-circleStart-margin" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="forced-tool-call-0_flowchart-v2-crossEnd" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-crossStart" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-crossEnd-margin" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5;"></path></marker><marker id="forced-tool-call-0_flowchart-v2-crossStart-margin" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"></path></marker><g><g></g><g><path d="M267.715,76L267.715,76L267.715,102L267.715,102L267.715,124" id="forced-tool-call-0-L_A_B_0" style=";" data-edge="true" data-et="edge" data-id="L_A_B_0" data-points="W3sieCI6MjY3LjcxNDg0Mzc1LCJ5Ijo3Nn0seyJ4IjoyNjcuNzE0ODQzNzUsInkiOjEwMn0seyJ4IjoyNjcuNzE0ODQzNzUsInkiOjEyOH1d" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M267.715,214L267.715,214L267.715,240L267.715,240L267.715,262" id="forced-tool-call-0-L_B_C_0" style=";" data-edge="true" data-et="edge" data-id="L_B_C_0" data-points="W3sieCI6MjY3LjcxNDg0Mzc1LCJ5IjoyMTR9LHsieCI6MjY3LjcxNDg0Mzc1LCJ5IjoyNDB9LHsieCI6MjY3LjcxNDg0Mzc1LCJ5IjoyNjZ9XQ==" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M293.308,430.813L318.012,430.813L318.012,498.006L355.931,498.006L355.931,536.748" id="forced-tool-call-0-L_C_E_0" style=";" data-edge="true" data-et="edge" data-id="L_C_E_0" data-points="W3sieCI6MjkzLjMwNzY4MDAyOTkxMTc1LCJ5Ijo0MzAuODEzNDEzNzIwMDg4MjV9LHsieCI6MzE4LjAxMTcxODc1LCJ5Ijo0OTguMDA2MjUwMzgxNDY5N30seyJ4IjozNTguNzI5MTQ2MTY2NTk3OTYsInkiOjUzOS42MDYyNTA3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M221.234,409.925L137.203,409.925L137.203,498.006L137.203,498.006L137.203,544.606" id="forced-tool-call-0-L_C_D_0" style=";" data-edge="true" data-et="edge" data-id="L_C_D_0" data-points="W3sieCI6MjIxLjIzMzYxMTA1MDQ0MTM3LCJ5Ijo0MDkuOTI1MDE3MzAwNDQxM30seyJ4IjoxMzcuMjAzMTI1LCJ5Ijo0OTguMDA2MjUwMzgxNDY5N30seyJ4IjoxMzcuMjAzMTI1LCJ5Ijo1NDguNjA2MjUwNzYyOTM5NX1d" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M322.881,401.24L456.211,401.24L456.211,498.006L423.471,498.006L423.471,536.557" id="forced-tool-call-0-L_C_E_2" style=";" data-edge="true" data-et="edge" data-id="L_C_E_2" data-points="W3sieCI6MzIyLjg4MDcyMjE3Nzg4NjIsInkiOjQwMS4yNDAzNzE1NzIxMTM3Nn0seyJ4Ijo0NTYuMjEwOTM3NSwieSI6NDk4LjAwNjI1MDM4MTQ2OTd9LHsieCI6NDIwLjg4MjIzMzY1MDU5ODk1LCJ5Ijo1MzkuNjA2MjUwNzYyOTM5NX1d" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M137.203,598.606L137.203,598.606L137.203,633.606L200.087,633.606L200.087,658.779" id="forced-tool-call-0-L_D_F_0" style=";" data-edge="true" data-et="edge" data-id="L_D_F_0" data-points="W3sieCI6MTM3LjIwMzEyNSwieSI6NTk4LjYwNjI1MDc2MjkzOTV9LHsieCI6MTM3LjIwMzEyNSwieSI6NjMzLjYwNjI1MDc2MjkzOTV9LHsieCI6MjAzLjgwMDc4MTI1LCJ5Ijo2NjAuMjY1NzMyNTk2NDUxN31d" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M392.008,607.606L392.008,607.606L392.008,633.606L329.124,633.606L329.124,658.779" id="forced-tool-call-0-L_E_F_0" style=";" data-edge="true" data-et="edge" data-id="L_E_F_0" data-points="W3sieCI6MzkyLjAwNzgxMjUsInkiOjYwNy42MDYyNTA3NjI5Mzk1fSx7IngiOjM5Mi4wMDc4MTI1LCJ5Ijo2MzMuNjA2MjUwNzYyOTM5NX0seyJ4IjozMjUuNDEwMTU2MjUsInkiOjY2MC4yNjU3MzI1OTY0NTE3fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M238.82,709.606L212.004,709.606L212.004,735.606L212.004,735.606L212.004,757.606" id="forced-tool-call-0-L_F_G_0" style=";" data-edge="true" data-et="edge" data-id="L_F_G_0" data-points="W3sieCI6MjM4LjgyMDM4OTA5MzEzNzI3LCJ5Ijo3MDkuNjA2MjUwNzYyOTM5NX0seyJ4IjoyMTIuMDAzOTA2MjUsInkiOjczNS42MDYyNTA3NjI5Mzk1fSx7IngiOjIxMi4wMDM5MDYyNSwieSI6NzYxLjYwNjI1MDc2MjkzOTV9XQ==" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M180.559,884.568L134.898,884.568L134.898,951.013L134.898,951.013L134.898,1028.817" id="forced-tool-call-0-L_G_H_0" style=";" data-edge="true" data-et="edge" data-id="L_G_H_0" data-points="W3sieCI6MTgwLjU1OTA0MTQxNzU1MDUsInkiOjg4NC41Njc2MzU5MzA0ODk5fSx7IngiOjEzNC44OTg0Mzc1LCJ5Ijo5NTEuMDEyNTAwNzYyOTM5NX0seyJ4IjoxMzQuODk4NDM3NSwieSI6MTAzMi44MTcxODgyNjI5Mzk1fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M243.449,884.568L289.109,884.568L289.109,951.013L289.109,951.013L289.109,982.013" id="forced-tool-call-0-L_G_I_0" style=";" data-edge="true" data-et="edge" data-id="L_G_I_0" data-points="W3sieCI6MjQzLjQ0ODc3MTA4MjQ0OTUsInkiOjg4NC41Njc2MzU5MzA0ODk4fSx7IngiOjI4OS4xMDkzNzUsInkiOjk1MS4wMTI1MDA3NjI5Mzk1fSx7IngiOjI4OS4xMDkzNzUsInkiOjk4Ni4wMTI1MDA3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M289.109,1129.622L289.109,1129.622L289.109,1164.622L313.366,1164.622L313.366,1196.441" id="forced-tool-call-0-L_I_J_0" style=";" data-edge="true" data-et="edge" data-id="L_I_J_0" data-points="W3sieCI6Mjg5LjEwOTM3NSwieSI6MTEyOS42MjE4NzU3NjI5Mzk1fSx7IngiOjI4OS4xMDkzNzUsInkiOjExNjQuNjIxODc1NzYyOTM5NX0seyJ4IjozMTUuNzkxMzI2OTkyNzUzNiwieSI6MTE5OS42MjE4NzU3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M404.389,1199.622L468.91,1199.622L468.91,1164.622L468.91,1164.622L468.91,1057.817L468.91,1057.817L468.91,951.013L468.91,951.013L468.91,838.809L468.91,838.809L468.91,735.606L329.291,735.606L329.291,700.754" id="forced-tool-call-0-L_J_F_0" style=";" data-edge="true" data-et="edge" data-id="L_J_F_0" data-points="W3sieCI6NDA0LjM4ODgxMzQwNTc5NzEsInkiOjExOTkuNjIxODc1NzYyOTM5NX0seyJ4Ijo0NjguOTEwMTU2MjUsInkiOjExNjQuNjIxODc1NzYyOTM5NX0seyJ4Ijo0NjguOTEwMTU2MjUsInkiOjEwNTcuODE3MTg4MjYyOTM5NX0seyJ4Ijo0NjguOTEwMTU2MjUsInkiOjk1MS4wMTI1MDA3NjI5Mzk1fSx7IngiOjQ2OC45MTAxNTYyNSwieSI6ODM4LjgwOTM3NTc2MjkzOTV9LHsieCI6NDY4LjkxMDE1NjI1LCJ5Ijo3MzUuNjA2MjUwNzYyOTM5NX0seyJ4IjozMjUuNDEwMTU2MjUsInkiOjY5OS43ODQ3NTI1NDEwNzQxfV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path><path d="M343.603,1075.129L625.313,1075.129L625.313,1164.622L625.313,1164.622L625.313,1204.622" id="forced-tool-call-0-L_I_K_0" style=";" data-edge="true" data-et="edge" data-id="L_I_K_0" data-points="W3sieCI6MzQzLjYwMjY4MTA5MDczMjc0LCJ5IjoxMDc1LjEyODU2OTY3MjIwNjh9LHsieCI6NjI1LjMxMjUsInkiOjExNjQuNjIxODc1NzYyOTM5NX0seyJ4Ijo2MjUuMzEyNSwieSI6MTIwOC42MjE4NzU3NjI5Mzk1fV0=" data-look="classic" marker-end="url(#forced-tool-call-0_flowchart-v2-pointEnd)"></path></g><g><g><g data-id="L_A_B_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_B_C_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(318.01171875, 498.0062503814697)"><g data-id="L_C_E_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g><g transform="translate(137.203125, 498.0062503814697)"><g data-id="L_C_D_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-77.609375" y="-0.9999990463256836" width="155.21875" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes,</tspan><tspan font-style="normal" font-weight="normal"> side-effect</tspan><tspan font-style="normal" font-weight="normal"> free</tspan></tspan></text></g></g></g><g transform="translate(456.2109375, 498.0062503814697)"><g data-id="L_C_E_2" transform="translate(0, -14.600001335144043)"><g><rect style="" x="-99.203125" y="-0.9999990463256836" width="198.40625" height="31.200000762939453"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes,</tspan><tspan font-style="normal" font-weight="normal"> but</tspan><tspan font-style="normal" font-weight="normal"> costly</tspan></tspan><tspan x="0" y="1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">(e.g.</tspan><tspan font-style="normal" font-weight="normal"> Anthropic</tspan><tspan font-style="normal" font-weight="normal"> cache</tspan><tspan font-style="normal" font-weight="normal"> miss)</tspan></tspan></text></g></g></g><g><g data-id="L_D_F_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_E_F_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_F_G_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(134.8984375, 951.0125007629395)"><g data-id="L_G_H_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-12.8046875" y="-0.9999990463256836" width="25.609375" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes</tspan></tspan></text></g></g></g><g transform="translate(289.109375, 951.0125007629395)"><g data-id="L_G_I_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g><g transform="translate(289.109375, 1164.6218757629395)"><g data-id="L_I_J_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-12.8046875" y="-0.9999990463256836" width="25.609375" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes</tspan></tspan></text></g></g></g><g><g data-id="L_J_F_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(625.3125, 1164.6218757629395)"><g data-id="L_I_K_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g></g><g><g id="forced-tool-call-0-flowchart-A-0" data-look="classic" transform="translate(267.71484375, 42)"><rect style="" x="-132" y="-34" width="264" height="68"></rect><g style="" transform="translate(-100, -18)"><rect></rect><foreignObject width="200" height="36"><p><span></span></p><p>Extension requests forced tool call</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-B-1" data-look="classic" transform="translate(267.71484375, 171)"><rect style="" x="-132" y="-43" width="264" height="86"></rect><g style="" transform="translate(-100, -27)"><rect></rect><foreignObject width="200" height="54"><p><span></span></p><p>Inject soft prompt:<br>"you must call tool X next turn"</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-C-3" data-look="classic" transform="translate(267.71484375, 361.203125)"><polygon points="95.203125,0 190.40625,-95.203125 95.203125,-190.40625 0,-95.203125" transform="translate(-94.703125, 95.203125)"></polygon><g style="" transform="translate(-61.203125, -18)"><rect></rect><foreignObject width="122.40625" height="36"><p><span></span></p><p>Provider supports<br>native forcing?</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-E-5" data-look="classic" transform="translate(392.0078125, 573.6062507629395)"><rect style="" x="-89.6015625" y="-34" width="179.203125" height="68"></rect><g style="" transform="translate(-57.6015625, -18)"><rect></rect><foreignObject width="115.203125" height="36"><p><span></span></p><p>Run turn with<br>soft prompt only</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-D-7" data-look="classic" transform="translate(137.203125, 573.6062507629395)"><rect style="" x="-129.203125" y="-25" width="258.40625" height="50"></rect><g style="" transform="translate(-97.203125, -9)"><rect></rect><foreignObject width="194.40625" height="18"><p><span></span></p><p>Set native tool_choice flag</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-F-11" data-look="classic" transform="translate(264.60546875, 684.6062507629395)"><rect style="" x="-60.8046875" y="-25" width="121.609375" height="50"></rect><g style="" transform="translate(-28.8046875, -9)"><rect></rect><foreignObject width="57.609375" height="18"><p><span></span></p><p>Run turn</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-G-15" data-look="classic" transform="translate(212.00390625, 838.8093757629395)"><polygon points="77.203125,0 154.40625,-77.203125 77.203125,-154.40625 0,-77.203125" transform="translate(-76.703125, 77.203125)"></polygon><g style="" transform="translate(-43.203125, -18)"><rect></rect><foreignObject width="86.40625" height="36"><p><span></span></p><p>Model called<br>the tool?</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-H-17" data-look="classic" transform="translate(134.8984375, 1057.8171882629395)"><rect style="" x="-46.40625" y="-25" width="92.8125" height="50"></rect><g style="" transform="translate(-14.40625, -9)"><rect></rect><foreignObject width="28.8125" height="18"><p><span></span></p><p>Done</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-I-19" data-look="classic" transform="translate(289.109375, 1057.8171882629395)"><polygon points="71.8046875,0 143.609375,-71.8046875 71.8046875,-143.609375 0,-71.8046875" transform="translate(-71.3046875, 71.8046875)"></polygon><g style="" transform="translate(-46.8046875, -9)"><rect></rect><foreignObject width="93.609375" height="18"><p><span></span></p><p>Retries left?</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-J-21" data-look="classic" transform="translate(341.7109375, 1233.6218757629395)"><rect style="" x="-125.6015625" y="-34" width="251.203125" height="68"></rect><g style="" transform="translate(-93.6015625, -18)"><rect></rect><foreignObject width="187.203125" height="36"><p><span></span></p><p>Retry — escalate:<br>set flag despite drawbacks</p><p></p></foreignObject></g></g><g id="forced-tool-call-0-flowchart-K-25" data-look="classic" transform="translate(625.3125, 1233.6218757629395)"><rect style="" x="-122" y="-25" width="244" height="50"></rect><g style="" transform="translate(-90, -9)"><rect></rect><foreignObject width="180" height="18"><p><span></span></p><p>Surface failure to caller</p><p></p></foreignObject></g></g></g></g></g><defs><filter id="forced-tool-call-0-drop-shadow" height="130%" width="130%"><fedropshadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><defs><filter id="forced-tool-call-0-drop-shadow-small" height="150%" width="150%"><fedropshadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><linearGradient id="forced-tool-call-0-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2A2A35" stop-opacity="1"></stop><stop offset="100%" stop-color="#44CFFF" stop-opacity="1"></stop></linearGradient></svg></div><figcaption>The forced call starts as a soft prompt; the native flag goes on only when the provider supports it without side effects, and if the model still doesn't call the tool, bounded retries escalate to setting the flag despite its cost before surfacing failure to the caller.</figcaption></figure>

这就是上一章的 Director 在提供商一侧的实现。`ForceTool` 陈述不变量；推理层选择最便宜且诚实的方式去满足它，并在模型不服从时升级。

### 工具 schema 是面向模型的协议

工具的 `parameters` 字段严格定义了它的参数形状。对面向人类的 API 来说这是理想的；但模型不是通用的 API 客户端。它们的错误往往特定于工具名字，以及训练数据里出现过的那些 harness。

被 RL 拉满的智能体可能会用另一个 harness 的 schema 来调用一个熟悉的工具。Composer 模型有时会按它们预期的形状发出 `Grep`，哪怕根本不存在 `Grep` 工具。Codex 看到 `paths: string[]` 时，可能发来一个用 `;` 或 `,` 分隔的单个字符串，全看当天的心情。

所以库应当既校验**又**纠正。对工具的语义契约要严格，对模型的方言要宽容：在映射无歧义时把 `paths: "a,b"` 修复成列表；否则返回一个结构化、可重试的错误。一个原始的 JSON Schema 校验器无法独自扛起这一层。

### 严格采样需要预算与方言

受限采样是我们最早给 Pi 加上的功能之一：

```typescript
+   strict?: boolean;
+   customFormat?: { syntax: "lark" | "regex"; definition: string };
+   customWireName?: string;
```

几个月后 Pi 跟进了 LARK 与严格模式支持，但只把它暴露为一个不透明的结构，交由提供商层透传。两个全局性约束让这种做法不够用：

1. **严格 schema 的容量是一份共享预算。** 许多提供商会限制严格 schema 的数量。足够多各自独立编写的扩展，就能让提供商拒绝每一个请求。用户不应该靠二分排查、逐个给插件打补丁来救回 harness。
2. **语法（grammar）方言是提供商特定的。** 把一份 LARK 语法传给每个提供商，这件事本身就可能是无效的。扩展无法维护这份兼容性映射，因为用户可能把同一个模型经由原生宿主、代理或自定义提供商来路由。

这就是为什么那个看起来“复杂”的实现属于推理层：

<figure data-hk="000000010000000000004000010b263"><div data-hk="000000010000000000004000010b2640" role="img" aria-label="Flowchart of constrained-sampling handling: an extension declares a tool strict; if the provider lacks grammar enforcement or the strict-schema budget is exhausted, ship JSON Schema only with charitable client-side repair; otherwise normalize the schema per provider dialect and inject the grammar on the wire; invalid output is repaired client-side and surfaced to the model as a structured error for a retry."><svg id="constrained-sampling-0" width="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="max-width: 542px;" viewBox="0 0 542 1458.015625" role="graphics-document document" aria-roledescription="flowchart-v2"><g><marker id="constrained-sampling-0_flowchart-v2-pointEnd" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-pointStart" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-pointEnd-margin" viewBox="0 0 11.5 14" refX="11.5" refY="7" markerUnits="userSpaceOnUse" markerWidth="10.5" markerHeight="14" orient="auto"><path d="M 0 0 L 11.5 7 L 0 14 z" style="stroke-width: 0; stroke-dasharray: 1, 0;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-pointStart-margin" viewBox="0 0 11.5 14" refX="1" refY="7" markerUnits="userSpaceOnUse" markerWidth="11.5" markerHeight="14" orient="auto"><polygon points="0,7 11.5,14 11.5,0" style="stroke-width: 0; stroke-dasharray: 1, 0;"></polygon></marker><marker id="constrained-sampling-0_flowchart-v2-circleEnd" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="constrained-sampling-0_flowchart-v2-circleStart" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="constrained-sampling-0_flowchart-v2-circleEnd-margin" viewBox="0 0 10 10" refY="5" refX="12.25" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="constrained-sampling-0_flowchart-v2-circleStart-margin" viewBox="0 0 10 10" refX="-2" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto"><circle cx="5" cy="5" r="5" style="stroke-width: 0; stroke-dasharray: 1, 0;"></circle></marker><marker id="constrained-sampling-0_flowchart-v2-crossEnd" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-crossStart" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-crossEnd-margin" viewBox="0 0 15 15" refX="17.7" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5;"></path></marker><marker id="constrained-sampling-0_flowchart-v2-crossStart-margin" viewBox="0 0 15 15" refX="-3.5" refY="7.5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 1,1 L 14,14 M 1,14 L 14,1" style="stroke-width: 2.5; stroke-dasharray: 1, 0;"></path></marker><g><g></g><g><path d="M276,76L276,76L276,102L276,102L276,124" id="constrained-sampling-0-L_A_B_0" style=";" data-edge="true" data-et="edge" data-id="L_A_B_0" data-points="W3sieCI6Mjc2LCJ5Ijo3Nn0seyJ4IjoyNzYsInkiOjEwMn0seyJ4IjoyNzYsInkiOjEyOH1d" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M221.255,285.255L125.398,285.255L125.398,375L125.398,375L125.398,496.203L125.398,496.203L125.398,617.406L130.611,617.406L130.611,648.461" id="constrained-sampling-0-L_B_G_0" style=";" data-edge="true" data-et="edge" data-id="L_B_G_0" data-points="W3sieCI6MjIxLjI1NDg2OTM5MDQ4ODk1LCJ5IjoyODUuMjU0ODY5MzkwNDg4OX0seyJ4IjoxMjUuMzk4NDM3NSwieSI6Mzc1fSx7IngiOjEyNS4zOTg0Mzc1LCJ5Ijo0OTYuMjAzMTI1fSx7IngiOjEyNS4zOTg0Mzc1LCJ5Ijo2MTcuNDA2MjV9LHsieCI6MTMxLjI3MjYyOTMxMDM0NDgzLCJ5Ijo2NTIuNDA2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M314.612,301.388L356.789,301.388L356.789,375L356.789,375L356.789,406" id="constrained-sampling-0-L_B_C_0" style=";" data-edge="true" data-et="edge" data-id="L_B_C_0" data-points="W3sieCI6MzE0LjYxMTY0NTM1NTU5NTUsInkiOjMwMS4zODgzNTQ2NDQ0MDQ1fSx7IngiOjM1Ni43ODkwNjI1LCJ5IjozNzV9LHsieCI6MzU2Ljc4OTA2MjUsInkiOjQxMH1d" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M311.208,536.825L220.789,536.825L220.789,617.406L191.01,617.406L191.01,649.475" id="constrained-sampling-0-L_C_G_0" style=";" data-edge="true" data-et="edge" data-id="L_C_G_0" data-points="W3sieCI6MzExLjIwNzg3MDU5MTg1MzQ2LCJ5Ijo1MzYuODI1MDU4MDkxODUzNX0seyJ4IjoyMjAuNzg5MDYyNSwieSI6NjE3LjQwNjI1fSx7IngiOjE4OC4yODc3MTU1MTcyNDE0LCJ5Ijo2NTIuNDA2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M383.767,555.428L412,555.428L412,617.406L412,617.406L412,666.406" id="constrained-sampling-0-L_C_D_0" style=";" data-edge="true" data-et="edge" data-id="L_C_D_0" data-points="W3sieCI6MzgzLjc2NzM4NDI5MTU1MDQsInkiOjU1NS40Mjc5MjgyMDg0NDk1fSx7IngiOjQxMiwieSI6NjE3LjQwNjI1fSx7IngiOjQxMiwieSI6NjcwLjQwNjI1fV0=" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M412,738.406L412,738.406L412,782.406L412,782.406L412,804.406" id="constrained-sampling-0-L_D_E_0" style=";" data-edge="true" data-et="edge" data-id="L_D_E_0" data-points="W3sieCI6NDEyLCJ5Ijo3MzguNDA2MjV9LHsieCI6NDEyLCJ5Ijo3ODIuNDA2MjV9LHsieCI6NDEyLCJ5Ijo4MDguNDA2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M412,876.406L412,876.406L412,902.406L340.55,902.406L340.55,929.2" id="constrained-sampling-0-L_E_F_0" style=";" data-edge="true" data-et="edge" data-id="L_E_F_0" data-points="W3sieCI6NDEyLCJ5Ijo4NzYuNDA2MjV9LHsieCI6NDEyLCJ5Ijo5MDIuNDA2MjV9LHsieCI6MzM2LjgwNDY4NzUsInkiOjkzMC42MDQ0OTIxODc1fV0=" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M140,756.406L140,756.406L140,782.406L140,782.406L140,842.406L140,842.406L140,902.406L211.45,902.406L211.45,929.2" id="constrained-sampling-0-L_G_F_0" style=";" data-edge="true" data-et="edge" data-id="L_G_F_0" data-points="W3sieCI6MTQwLCJ5Ijo3NTYuNDA2MjV9LHsieCI6MTQwLCJ5Ijo3ODIuNDA2MjV9LHsieCI6MTQwLCJ5Ijo4NDIuNDA2MjV9LHsieCI6MTQwLCJ5Ijo5MDIuNDA2MjV9LHsieCI6MjE1LjE5NTMxMjUsInkiOjkzMC42MDQ0OTIxODc1fV0=" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M276,978.406L276,978.406L276,1004.406L276,1004.406L276,1026.406" id="constrained-sampling-0-L_F_H_0" style=";" data-edge="true" data-et="edge" data-id="L_F_H_0" data-points="W3sieCI6Mjc2LCJ5Ijo5NzguNDA2MjV9LHsieCI6Mjc2LCJ5IjoxMDA0LjQwNjI1fSx7IngiOjI3NiwieSI6MTAzMC40MDYyNX1d" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M241.206,1139.222L175.594,1139.222L175.594,1209.016L175.594,1209.016L175.594,1258.016" id="constrained-sampling-0-L_H_I_0" style=";" data-edge="true" data-et="edge" data-id="L_H_I_0" data-points="W3sieCI6MjQxLjIwNjI3OTY5MTIxMTQsInkiOjExMzkuMjIxOTA0NjkxMjExNH0seyJ4IjoxNzUuNTkzNzUsInkiOjEyMDkuMDE1NjI1fSx7IngiOjE3NS41OTM3NSwieSI6MTI2Mi4wMTU2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M310.794,1139.222L376.406,1139.222L376.406,1209.016L376.406,1209.016L376.406,1240.016" id="constrained-sampling-0-L_H_J_0" style=";" data-edge="true" data-et="edge" data-id="L_H_J_0" data-points="W3sieCI6MzEwLjc5MzcyMDMwODc4ODYsInkiOjExMzkuMjIxOTA0NjkxMjExNH0seyJ4IjozNzYuNDA2MjUsInkiOjEyMDkuMDE1NjI1fSx7IngiOjM3Ni40MDYyNSwieSI6MTI0NC4wMTU2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path><path d="M376.406,1330.016L376.406,1330.016L376.406,1356.016L376.406,1356.016L376.406,1378.016" id="constrained-sampling-0-L_J_K_0" style=";" data-edge="true" data-et="edge" data-id="L_J_K_0" data-points="W3sieCI6Mzc2LjQwNjI1LCJ5IjoxMzMwLjAxNTYyNX0seyJ4IjozNzYuNDA2MjUsInkiOjEzNTYuMDE1NjI1fSx7IngiOjM3Ni40MDYyNSwieSI6MTM4Mi4wMTU2MjV9XQ==" data-look="classic" marker-end="url(#constrained-sampling-0_flowchart-v2-pointEnd)"></path></g><g><g><g data-id="L_A_B_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(125.3984375, 496.203125)"><g data-id="L_B_G_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g><g transform="translate(356.7890625, 375)"><g data-id="L_B_C_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-12.8046875" y="-0.9999990463256836" width="25.609375" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes</tspan></tspan></text></g></g></g><g transform="translate(220.7890625, 617.40625)"><g data-id="L_C_G_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g><g transform="translate(412, 617.40625)"><g data-id="L_C_D_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-81.21875" y="-0.9999990463256836" width="162.4375" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes,</tspan><tspan font-style="normal" font-weight="normal"> and</tspan><tspan font-style="normal" font-weight="normal"> priority</tspan><tspan font-style="normal" font-weight="normal"> wins</tspan></tspan></text></g></g></g><g><g data-id="L_D_E_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_E_F_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_G_F_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g><g data-id="L_F_H_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g><g transform="translate(175.59375, 1209.015625)"><g data-id="L_H_I_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-12.8046875" y="-0.9999990463256836" width="25.609375" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">Yes</tspan></tspan></text></g></g></g><g transform="translate(376.40625, 1209.015625)"><g data-id="L_H_J_0" transform="translate(0, -8.000000953674316)"><g><rect style="" x="-9.203125" y="-0.9999990463256836" width="18.40625" height="18"></rect><text y="-10.1" text-anchor="middle" style=""><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"><tspan font-style="normal" font-weight="normal">No</tspan></tspan></text></g></g></g><g><g data-id="L_J_K_0" transform="translate(0, 0)"><text y="-10.1" text-anchor="middle"><tspan x="0" y="-0.1em" dy="1.1em" text-anchor="middle"></tspan></text></g></g><g><rect style="stroke: none"></rect></g></g><g><g id="constrained-sampling-0-flowchart-A-0" data-look="classic" transform="translate(276, 42)"><rect style="" x="-132" y="-34" width="264" height="68"></rect><g style="" transform="translate(-100, -18)"><rect></rect><foreignObject width="200" height="36"><p><span></span></p><p>Extension declares tool as strict</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-B-1" data-look="classic" transform="translate(276, 234)"><polygon points="106,0 212,-106 106,-212 0,-106" transform="translate(-105.5, 106)"></polygon><g style="" transform="translate(-72, -18)"><rect></rect><foreignObject width="144" height="36"><p><span></span></p><p>Provider supports<br>grammar enforcement?</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-G-3" data-look="classic" transform="translate(140, 704.40625)"><rect style="" x="-132" y="-52" width="264" height="104"></rect><g style="" transform="translate(-100, -36)"><rect></rect><foreignObject width="200" height="72"><p><span></span></p><p>Ship JSON Schema only;<br>unconstrained sampling +<br>charitable client-side repair</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-C-5" data-look="classic" transform="translate(356.7890625, 496.203125)"><polygon points="86.203125,0 172.40625,-86.203125 86.203125,-172.40625 0,-86.203125" transform="translate(-85.703125, 86.203125)"></polygon><g style="" transform="translate(-61.203125, -9)"><rect></rect><foreignObject width="122.40625" height="18"><p><span></span></p><p>Budget remaining?</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-D-9" data-look="classic" transform="translate(412, 704.40625)"><rect style="" x="-104" y="-34" width="208" height="68"></rect><g style="" transform="translate(-72, -18)"><rect></rect><foreignObject width="144" height="36"><p><span></span></p><p>Normalize schema<br>per provider dialect</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-E-11" data-look="classic" transform="translate(412, 842.40625)"><rect style="" x="-122" y="-34" width="244" height="68"></rect><g style="" transform="translate(-90, -18)"><rect></rect><foreignObject width="180" height="36"><p><span></span></p><p>Inject grammar constraint<br>on the wire</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-F-13" data-look="classic" transform="translate(276, 953.40625)"><rect style="" x="-60.8046875" y="-25" width="121.609375" height="50"></rect><g style="" transform="translate(-28.8046875, -9)"><rect></rect><foreignObject width="57.609375" height="18"><p><span></span></p><p>Run turn</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-H-17" data-look="classic" transform="translate(276, 1102.2109375)"><polygon points="71.8046875,0 143.609375,-71.8046875 71.8046875,-143.609375 0,-71.8046875" transform="translate(-71.3046875, 71.8046875)"></polygon><g style="" transform="translate(-46.8046875, -9)"><rect></rect><foreignObject width="93.609375" height="18"><p><span></span></p><p>Output valid?</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-I-19" data-look="classic" transform="translate(175.59375, 1287.015625)"><rect style="" x="-46.40625" y="-25" width="92.8125" height="50"></rect><g style="" transform="translate(-14.40625, -9)"><rect></rect><foreignObject width="28.8125" height="18"><p><span></span></p><p>Done</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-J-21" data-look="classic" transform="translate(376.40625, 1287.015625)"><rect style="" x="-118.40625" y="-43" width="236.8125" height="86"></rect><g style="" transform="translate(-86.40625, -27)"><rect></rect><foreignObject width="172.8125" height="54"><p><span></span></p><p>Repair client-side,<br>surface structured error<br>to model</p><p></p></foreignObject></g></g><g id="constrained-sampling-0-flowchart-K-23" data-look="classic" transform="translate(376.40625, 1416.015625)"><rect style="" x="-96.8046875" y="-34" width="193.609375" height="68"></rect><g style="" transform="translate(-64.8046875, -18)"><rect></rect><foreignObject width="129.609375" height="36"><p><span></span></p><p>Model retries with<br>correction signal</p><p></p></foreignObject></g></g></g></g></g><defs><filter id="constrained-sampling-0-drop-shadow" height="130%" width="130%"><fedropshadow dx="4" dy="4" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><defs><filter id="constrained-sampling-0-drop-shadow-small" height="150%" width="150%"><fedropshadow dx="2" dy="2" stdDeviation="0" flood-opacity="0.06" flood-color="#000000"></fedropshadow></filter></defs><linearGradient id="constrained-sampling-0-gradient" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#2A2A35" stop-opacity="1"></stop><stop offset="100%" stop-color="#44CFFF" stop-opacity="1"></stop></linearGradient></svg></div><figcaption>What honoring <code data-hk="000000010000000000004000010b26500">strict</code> actually takes: provider capability, a strict-schema budget with priorities, per-dialect normalization, and a client-side repair path—none of which an opaque pass-through struct can provide.</figcaption></figure>

扩展声明意图：严格性、语法、优先级。推理层则拥有能力判定、预算、方言归一化、回退、修复以及最终的传输格式。

### 纠错式推理

推理库还需要：

1. 修复格式错误的 JSON；
2. 检测 Gemini、DeepSeek 等模型中的重复循环；
3. 解析每个模型的输出方言，并在结构化输出泄漏到文本里时合成规范的 `tool_call` 和 `think` 块。

![一段泄漏的工具调用在聊天记录里被当作散文渲染出来，因为模型的方言没有被解析成 tool_call 块](https://stencil.so/blog/harness-playbook/leaked-toolcall-wild.png)

*一段泄漏的工具调用被当作散文渲染出来，因为方言没有被解析成 tool_call 块。*

关于这个话题的工具调用一侧，可以读我[之前的文章](https://blog.can.ac/2026/08/03/the-minutiae-of-tool-calling/)。支持一个提供商或模型，除了接上一个 URL，还得处理它各自的怪癖。

一个提供商适配器并不是能打开一条流就算完成。当 harness 的其余部分在遇到格式错误的 JSON、重复、泄漏的推理或模型特有的工具调用方言时仍能收到一个规范的轮次，它才算完成。

### 压缩是调度出来的，而不是触发出来的

朴素设计在这里恰好也给出了最糟的用户体验。用户要在自己投入最深的那一刻，等待整个会话中最大的一次请求。

除了使用 **[Snapcompact](https://stencil.so/blog/snapcompact)** 这类方法之外，这里仍有大量改进空间。

![Claude 的聊天界面显示一个加载转圈、一条 43% 的进度条，以及文字：正在压缩我们的对话以便继续聊天。这大约需要 1-2 分钟。](https://stencil.so/blog/harness-playbook/compaction-wait.png)

*连前沿实验室交付的也是朴素设计。*

正确的做法是：在距离上限还差约 10% 的时候，就推测性地启动压缩过程。本质上你把对话分叉成两个并发版本，一个里面用户和模型继续工作；另一个里面模型在压缩对话。

![omp 的状态栏：模型 GPT-5.6-Sol、工作目录 pi、git 分支 main，以及一个 1M 窗口已用 3% 的上下文仪表，上面有两个刻度标记落在上限之前。](https://stencil.so/blog/harness-playbook/compaction-async.png)

*看到那个图层图标了吗？它显示的就是推测性压缩触发的时机。*

收到响应后，你再把它拼接进另一个分支。这也让你保住了工作的势头，因为模型不会被历史中孤零零只剩一条交接（handoff）消息的局面搞糊涂，而是会看到它本来*就应该*已经做完的全部进展。

除了提示词之外，其他值得考虑的方法还包括：

- **远程压缩**：由提供商在服务端完成。OpenAI 的 API 会返回一个不透明的状态 blob 作为结果，但由于它能访问解密后的思考内容，可以显著减少上下文的损失。
- **交接**：与其索要一份摘要，不如试试让模型把工作“交接”出去。
- **抖落（Shake）**：完全在本地进行，你可以直接把历史里沉重的工具结果裁掉。

请注意，这也是你在“UI 渲染 vs. 请求渲染”这层抽象里应当考虑的事情：用户查看历史时会期望所有消息原样保留，而对模型来说，那些消息一条都不存在；因此在构造请求 `fn(this, req) -> req` 时，你应当把提示词历史中的每一条记录建模为一次“折叠”，并在它的 `<Handoff>` 实现中处理。

### 用小型本地模型做 harness 的杂活

小型本地模型超级有用！哪怕你真的只跟前沿模型打交道，我也建议你内嵌一个 `tiny` 模型（尤其看看 LiquidAI 的模型），这会在分类任务上为你省下大量延迟和金钱，也适用于生成标题、翻译，或者判断用户对对话走向有多满意这类小任务。另一个用例当然是 TTS/STT，在本地你已经能拿到 SoTA 级别的表现。

这不是第二个“智能体”。它是一种廉价的内部能力，用于那些不该付出前沿模型延迟或成本的小任务。

一旦兼容性与修复被集中起来，常驻工具面就可以保持小巧。下一章要讲的是什么值得在每个请求里都带上 schema，以及什么坚决不值得。

## 工具面

运行时一章定义了工作如何执行。推理一章定义了 schema 如何在不同模型与提供商之间存活下来。现在终于可以问那个产品层面的问题了：哪些操作配得上占据模型的常驻语法（grammar）？

### 每个 schema 都有代价

把大多数工具呈现给模型的最佳方式，是**根本不把它们放进常驻工具清单**。

前阵子我收到一条抱怨，说 omp 在同一个任务上比 Codex 慢，不是 token 用量上的慢，而是实打实的挂钟时间。我本以为这纯属虚惊一场，结果让我意外的是，这是真的，甚至差了将近两倍！

<figure data-hk="000000010000000000004000010b294"><svg data-hk="000000010000000000004000010b2950" viewBox="0 0 720 406" role="img" aria-label="Median wall time and prefix size for six harness variants: omp stock with no fixes runs 86.2s at 25.1k tokens, dropping to 59.5s after a todo-batching fix, 45.4s after the /xdev rewrite cuts wire tool defs from 23 to 15, and 36.6s at a lean 5-tool floor; codex-cli and pi references sit near 42.2s and 37.0s" style="width:100%;height:auto;font-family:'BerkeleyMono Nerd Font', 'Berkeley Mono', ui-monospace, monospace"><rect x="196" y="10" width="18" height="8" fill="#44CFFF"></rect><text x="220" y="18" font-size="10" fill="#A3A3AC">MEDIAN WALL, SECONDS (sol:med)</text><rect x="464" y="13" width="18" height="3" fill="#63636D"></rect><text x="488" y="18" font-size="10" fill="#A3A3AC">PREFIX, K TOKENS</text><line data-hk="000000010000000000004000010b29510" x1="196" y1="30" x2="196" y2="382" stroke="#15151A" stroke-width="1"></line><text data-hk="000000010000000000004000010b29511" x="196" y="398" text-anchor="middle" font-size="10" fill="#63636D">0s</text><line data-hk="000000010000000000004000010b29512" x1="308.17391304347825" y1="30" x2="308.17391304347825" y2="382" stroke="#15151A" stroke-width="1"></line><text data-hk="000000010000000000004000010b29513" x="308.17391304347825" y="398" text-anchor="middle" font-size="10" fill="#63636D">20s</text><line data-hk="000000010000000000004000010b29514" x1="420.3478260869565" y1="30" x2="420.3478260869565" y2="382" stroke="#15151A" stroke-width="1"></line><text data-hk="000000010000000000004000010b29515" x="420.3478260869565" y="398" text-anchor="middle" font-size="10" fill="#63636D">40s</text><line data-hk="000000010000000000004000010b29516" x1="532.5217391304348" y1="30" x2="532.5217391304348" y2="382" stroke="#15151A" stroke-width="1"></line><text data-hk="000000010000000000004000010b29517" x="532.5217391304348" y="398" text-anchor="middle" font-size="10" fill="#63636D">60s</text><line data-hk="000000010000000000004000010b29518" x1="644.695652173913" y1="30" x2="644.695652173913" y2="382" stroke="#15151A" stroke-width="1"></line><text data-hk="000000010000000000004000010b29519" x="644.695652173913" y="398" text-anchor="middle" font-size="10" fill="#63636D">80s</text><g data-hk="000000010000000000004000010b29520"><text x="186" y="58" text-anchor="end" font-size="11" fill="#F5F5F6">omp · stock, no fixes</text><text x="186" y="71" text-anchor="end" font-size="9" fill="#63636D">23 defs · 12–16 turns</text><rect x="196" y="48" width="483.4695652173914" height="12" fill="#44CFFF"></rect><text x="685.4695652173914" y="58" font-size="11" fill="#F5F5F6">86.2s</text><rect x="196" y="65" width="417.79354838709673" height="3" fill="#63636D"></rect><text x="619.7935483870967" y="70" font-size="9" fill="#63636D">25.1k tok</text></g><g data-hk="000000010000000000004000010b29523"><text x="186" y="116" text-anchor="end" font-size="11" fill="#F5F5F6">omp · todo-batched</text><text x="186" y="129" text-anchor="end" font-size="9" fill="#63636D">23 defs, r9 · 6–8 turns</text><rect x="196" y="106" width="333.71739130434776" height="12" fill="#44CFFF"></rect><text x="535.7173913043478" y="116" font-size="11" fill="#F5F5F6">59.5s</text><rect x="196" y="123" width="417.79354838709673" height="3" fill="#63636D"></rect><text x="619.7935483870967" y="128" font-size="9" fill="#63636D">25.1k tok</text><text data-hk="000000010000000000004000010b295250" x="712" y="94" text-anchor="end" font-size="10" fill="#F5B04A">↓ −26.7s · todo-batching fix</text></g><g data-hk="000000010000000000004000010b29526"><text x="186" y="174" text-anchor="end" font-size="11" fill="#F5F5F6">omp · /xdev default</text><text x="186" y="187" text-anchor="end" font-size="9" fill="#63636D">15 defs, r11 · 6–8 turns</text><rect x="196" y="164" width="254.63478260869562" height="12" fill="#44CFFF"></rect><text x="456.6347826086956" y="174" font-size="11" fill="#F5F5F6">45.4s</text><rect x="196" y="181" width="342.89032258064515" height="3" fill="#63636D"></rect><text x="544.8903225806451" y="186" font-size="9" fill="#63636D">20.6k tok</text><text data-hk="000000010000000000004000010b295280" x="712" y="152" text-anchor="end" font-size="10" fill="#F5B04A">↓ −14.1s · 23→15 wire defs</text></g><g data-hk="000000010000000000004000010b29529"><text x="186" y="232" text-anchor="end" font-size="11" fill="#F5F5F6">omp · lean floor</text><text x="186" y="245" text-anchor="end" font-size="9" fill="#63636D">5 tools, r11 · 4–6 turns</text><rect x="196" y="222" width="205.2782608695652" height="12" fill="#44CFFF"></rect><text x="407.2782608695652" y="232" font-size="11" fill="#F5F5F6">36.6s</text><rect x="196" y="239" width="251.34193548387094" height="3" fill="#63636D"></rect><text x="453.34193548387094" y="244" font-size="9" fill="#63636D">15.1k tok</text><text data-hk="000000010000000000004000010b2952a110" x="712" y="210" text-anchor="end" font-size="10" fill="#F5B04A">↓ −8.8s · essential-5 only</text></g><g data-hk="000000010000000000004000010b2952a12"><text x="186" y="290" text-anchor="end" font-size="11" fill="#F5F5F6">codex-cli 0.144 (reference)</text><text x="186" y="303" text-anchor="end" font-size="9" fill="#63636D">3 tools · 4 turns</text><rect x="196" y="280" width="236.68695652173915" height="12" fill="#A3A3AC"></rect><text x="438.68695652173915" y="290" font-size="11" fill="#F5F5F6">42.2s</text><rect x="196" y="297" width="204.73548387096776" height="3" fill="#63636D"></rect><text x="406.73548387096776" y="302" font-size="9" fill="#63636D">9.6–12.3k tok</text></g><g data-hk="000000010000000000004000010b2952a15"><text x="186" y="348" text-anchor="end" font-size="11" fill="#F5F5F6">pi (reference)</text><text x="186" y="361" text-anchor="end" font-size="9" fill="#63636D">~5 tiny-schema tools · 6 turns</text><rect x="196" y="338" width="207.52173913043475" height="12" fill="#A3A3AC"></rect><text x="409.52173913043475" y="348" font-size="11" fill="#F5F5F6">37.0s</text><rect x="196" y="355" width="93.21290322580643" height="3" fill="#63636D"></rect><text x="295.21290322580643" y="360" font-size="9" fill="#63636D">5.6k tok</text></g></svg><figcaption>Median wall (thick bar, seconds) and request prefix (thin bar, k tokens) per variant · task <code data-hk="000000010000000000004000010b29600">sol</code>, median of 6 runs, fresh session each · cyan = omp variants, grey = external references · annotations are deltas vs the row above.</figcaption></figure>

罪魁祸首就是工具清单。把它限制在五个核心工具，你就能拿到 `36.6s`，领先于 Codex 的 `42.2s` 和 Pi 的 `37.0s`。为什么？工具语法！哪怕对模型来说它只是一段文本描述，在大多数前沿模型提供商那里，它都会实实在在地参与 token 生成，因为它影响着 token 生成过程，驱使模型始终给你输出合法的 JSON（这还不算用来描述它的那些 token）。

工具不是什么免费的好处，不能抱着“万一模型用得上呢”的心态随手往里加；动态工具发现的思路正源于此。但这种动态方式有个问题：只要你一改工具清单，缓存就失效了，所以我们不太喜欢它。

Pi 有一点做对了，我们也一直认同：MCP 的设计糟糕透顶，不该待在常驻工具层里。那么，我们该如何同时满足想要 Figma MCP 的用户和推理层的约束呢？

动态工具发现避开了常驻语法的成本，却在清单一变就让缓存失效。更好的目标是：一套稳定、精简的语法，外加一条通过普通组合就能触达的长尾。

### 把长尾藏到稳定的表面之后

来认识一下 `dyn` CLI！它当然不是真正的 CLI，而是我们的 Bash 实现暴露出的一个内置工具，给模型提供一套稳定的发现协议，以及一种顺手的使用方式：通过 Bash 调用，或者在 `Eval` 里当作 Python 函数调用。

```
dyn
dyn --q github
dyn github/list_prs --state open | jq '.[] | .title'
cat query.sql | dyn database/query - --params limit=5
dyn image_gen "blueprint of a frog" > result.json
```

一旦模型找到了感兴趣的工具，就像工具搜索那样，它可以用 `--help` 获取详情：

```bash
$ dyn github/create_pr --help
dyn github/create_pr <title> [OPTIONS]

Arguments:
  <title>

Options:
  -d, --draft / --no-draft
  -r, --reviewers <TEXT>[,…]  (repeatable)
  -p, --pr-meta.priority <INTEGER>
  -m, --pr-meta.notify / --no-pr-meta.notify
  -j, --json <JSON>
  -h, --help
```

这当然是从 JSON schema 合成出来的，而要生成一份漂亮的 CLI 映射，有 schema 就已经足够了。

在处理大输入时，这套方案尤其好用：

```sql
dyn database/query "SELECT 1"       # literal
dyn database/query @query.sql       # file contents
cat query.sql | dyn database/query - # stdin
```

有一个边界情况需要处理：返回图片的工具怎么办？想想看，omp 是怎么把图片显示给你的？Sixel 或者 Kitty 协议，对吧？那为什么不在 `Bash` 工具里解析同样的输出，然后把图片附上去呢！这样一来，你还能通过 ssh 查看远程机器上的图片，美滋滋。

当所有这些操作都属于同一个 API 时，还有第二种选择：暴露一个代码面。Browser 保留 `open` / `run` / `close`，针对一个持久标签页运行代码；Computer 则在一个持久会话中暴露 `desktop`、`wait` 和 `assert`。一个稳定的 schema，多个操作在一次调用内组合。**有界的操作集：schema。开放式的操作集：代码面。**

这两种形式服务于形态不同的 API。有界的操作集可以继续用 schema；开放式的操作集则需要一个代码面或命令面，让多个操作在一次调用内组合起来。两者在发现之后都不需要改动常驻清单。

### 契约卫生：意图与版本

契约上有一处小改动值得单独点出来：每个工具都会得到一个 `i` 意图参数。它在参数流式到达的过程中就会先到，所以 `renderCall` 能在调用完成之前就展示模型自认为正在做什么。日志也因此得到一份可读的摘要，而无需每个工具各自发明 `reason` / `purpose`。

大家应该**给工具加上版本**。

这会让追踪记录（trace）好用得多：你可以解析一个频繁变更的工具的输入输出，评估它的成功率随时间的变化，而不必猜每次调用是由哪一版契约产生的。

名称、版本、意图、输入、输出、诊断信息和用量都是协议数据。一旦追踪记录被用于评估或修复，对其中任何一项靠猜，都会变成本可避免的技术债。

### 深度内置工具

精简的清单只有在一种情况下才行得通：它的原语之所以宽泛，是出于语义上的理由，而不是因为一堆不相干的功能被倒进了同一个 switch 语句。omp 的内置工具是很好的例子。

#### Read：物化一个资源

`omp` 里最无聊的工具，实际上打包了在别家得用 20 个工具才能做到的事。

- 你可以直接读目录，不需要 `Ls`。
- 不需要额外的 `ReadNotebook` 工具，读一个 `.ipynb` 文件时默认就能得到漂亮的输出。
- `.pdf`、`.docx`、`.pptx`、`.xlsx`、`.epub`？你拿到的是提取出来的 markdown。
- `.cpuprofil, .sample.txt`？你猜对了！你拿到的是一份瓶颈摘要。
- `.sqlite`、`.sqlite3`、`.db`、`.db3`？你可以列出表、查看 schema 和行，甚至直接查询。
- 图片要么返回图片本身，要么在没有视觉能力时返回元数据。要预览 SVG，加上 `:img`。
- 归档文件无需解包即可寻址，不只是 ZIP 和 TAR，还包括 JAR、wheel 和 ASAR。
- 同样的投影对 `http://...` 上的在线资源也适用，范围按需读取；普通网页会变成 markdown，就像 `web_fetch` 一样。

这并不是为了耍聪明而搞的多态。从模型的视角看，这些全都是同一个操作：

> 把这个资源物化成我最便于推理的表示形式。

对于代码，它还能返回一份结构摘要，用省略号替代大段的声明体。模型不必仅仅为了找到类 `X` 就把整个大文件拉进上下文。

当字节本身才重要时，`:raw` 可以绕过投影。`:conflicts` 则为每个未解决的合并冲突块给出一行，而不是让模型在整个文件里翻找。

范围可以是开放式的、按长度指定的，或者不连续的：

```
:50
:50-
:50-200
:50+150
:5-16,960-973
:raw:50-100
:50-100:raw
```

然后还有那些非 web 的 URL：

```
artifact://<id>
agent://<id>
history://<id>
issue://123
pr://123/diff/2
skill://react
rule://foo
memory://...
local://...
vault://...
security://...
omp://...
xd://browser
ssh://host/path
mcp://...
```

仓库信息、MCP 资源、子代理的对话记录、技能、记忆、本地暂存空间、omp 文档，甚至通过 SSH 访问的远程机器，全都纳入同一套内部 URL 子系统。我们推荐这种设计。

`Read` 还处理一些不那么显眼的恢复工作：根据唯一的工作区后缀修正错误的绝对路径、在 Windows 上展开 `~`，以及避免其他浪费轮次的路径错误。

这本可以就写成：

```
return await Bun.file(path).text();
```

可以。但那样一来，扩展作者就会各自实现自己的读取器，或者模型会去找 shell 层面的变通办法，与此同时 harness 又以 `web_fetch` 之类的独立名字暴露着形态相似的功能。

这并没有减少复杂度。复杂度还是那么多，只是被复制进了 shell 命令、提示词、扩展和失败的工具调用里，在那里没人对它负责，而每个人都用略有不同的方式实现了其中的 30%。

`Read` 很复杂，所以读取本身不复杂。

复杂度有唯一的归属者。操作保持稳定，而资源特定的投影挪到了它背后。

#### Bash：一门策略感知的命令语言

Bash 工具不应该只是简单地把命令扔给 Bash 去跑。这听起来很离谱。

omp 自带一套完整的 bash 解析器、解释器，外加一整套 coreutils，全部在进程内运行；事实证明这是个不错的选择，理由很简单：

- 你保住了模型的肌肉记忆。它可以照旧伸手去用 `grep`；因为 omp 就是解释器，我们可以拦截这条命令，把合适的参数路由到我们的 ripgrep 引擎。没人需要在 `AGENTS.md` 里花费上下文求模型用 `rg`。
- 平台中立几乎是白送的。不需要 WSL 或 Git Bash：omp 可以在 Windows 上于进程内执行大多数 Bash 调用。无需多言。
- 控制台在多次调用之间保持有状态，包括变量、退出码、`$!` 等等。

更有意思的优势出现在 Claude 用下面这种东西调用它的时候：

```
INC="…/10.0.22621.0"; declare -A R
for d in um shared ucrt; do while IFS= read -r f; do b="${f##*/}"; R["${b,,}"]="$f"; done \
  < <(find "$INC/$d" -maxdepth 1 -type f -name "*.[hH]"); done
n=0
while IFS= read -r ref; do case "$ref" in */*) continue;; esac; r="${R[${ref,,}]:-}"; \
  [ -n "$r" ] || continue; rd="${r%/*}"; rn="${r##*/}"; \
  if [ "$ref" != "$rn" ] && [ ! -e "$rd/$ref" ]; then ln -s "$rn" "$rd/$ref"; n=$((n+1)); fi; \
done < <(grep -rhoiE "#[[:space:]]*include[[:space:]]*<[^>]+>" "$INC/um" "$INC/shared" "$INC/ucrt" \
  | sed -E "s/.*<([^>]+)>.*/\1/" | sort -u)
```

你能在 5 秒内告诉我这段在干什么吗？（如果你说能，那你在撒谎）

无论你对工具审批持什么看法，这都很糟糕：没人会去读它。Anthropic 最近的研究也指向同一个方向：自动模式，也就是让另一个 Claude 来读命令，以相当大的优势胜过了人类。

当 omp 自己来解释这条命令时，它可以等执行到 `ln` 的那一刻再发问；在那之前的一切都是只读的。如果用户已经允许对该目录写入，它甚至连这一次提示都可以跳过。

这让 harness 从“Bash”的 TSA 式安检口，变成了一个能力审批者：“我可以用 Git 推送吗？”`find`、`cat`、`ln` 这类常见命令在进程内运行，恰在需要时查询访问模型，并继承用户已有的读写策略。

因为宿主自己解释常见命令，审批可以发生在真正要紧的能力边界上，比如 `git push`、工作区之外的写入、一次网络请求，而不是发生在那个没法读懂的 shell 字符串边界上。第三章的运行时策略由此变得可以强制执行，同时不必丢掉模型的 shell 肌肉记忆。

#### AutoQA：给智能体一条报告 bug 的路径

我们在分叉一个月后就加了这个工具，比 Anthropic 往他们的产品里加等价物还早。

你知道，通常你都会在某个地方给用户提供一条反馈产品问题的渠道，对吧？这就是那东西的等价物，只不过是给智能体用的。它让你能完全自动地收集信息：它们喜欢某个工具的哪些地方、觉得哪里令人困惑，以及看到哪里表现出错。

当然，报告的质量算不上*出色*，比如 Codex 就特别爱在重命名没做对的时候抱怨文件被外部修改，把锅甩给 `Read` 或 LSP 工具（*不是我的错啊哥们，去问 TypeScript 那帮人*），不过这些很容易过滤掉，过滤之后，你就能获得海量信号：哪个工具会失败，以及它可以如何改进。

AutoQA 闭合了工具设计与实际部署行为之间的回路。它有噪声，但一旦过滤掉明显的错误归因，它就能揭示哪个操作让模型犯糊涂、哪个投影藏掉了需要的数据、哪项修复应该落在 harness 里。

工具现在有了有界的运行时、稳定的发现面和结构化的状态。用户不应该要求每一位工具作者（往往就是 Claude）都得成为终端渲染和安全专家，仅仅为了把这些状态安全地展示出来。

## 界面

267s → 90ms：单次会话的渲染时间

13%：性能剖析中一个 .includes 占用的 CPU

98.7s：耗在 wrapAnsi 反复折行上

0：该会话中的图片数量

会话 DOM 与工具状态流让每个客户端拿到的都是同一组事实。但仅凭这些，并不能自动得到一个安全、快速、一致的界面。渲染器仍然可以把这些事实变成反复重新解析的字符串、各扩展自成一派的样式约定，以及不可逆的回滚缓冲区（scrollback）bug。

### omp 教会我们的：字符串的代价会层层累加

这其实正是我给 [pi-mono](https://github.com/earendil-works/pi/pull/1084) 提的最早几个 PR 之一的主题。在那次改动之前，如果你在一个任务执行期间对 Pi 做性能剖析，再去看 CPU 占用，榜单会被——你猜对了——渲染器完全占满！

<figure data-hk="000000010000000000004000010b361"><canvas data-hk="000000010000000000004000010b3620" aria-hidden=""></canvas><figcaption>Renderer-dominated CPU profile of a Pi session — treemap of self time. String scanning (red) alone burns a fifth of the session. · hover a tile for the code it profiles.</figcaption></figure>

作为一个 TypeScript CLI，这里有一部分开销在所难免（光是字符串内部采用 UTF-16 这一点，就意味着每一帧都得经过一次相对昂贵的转码，除非你像疯子一样到处传 Uint8Array 来表示文本）。

但真正让这笔开销层层累加的，是契约本身。你想嵌入一个子组件？那你就得处理：

- 对这个 `string` 做净化，并丢弃 ANSI 转义序列或在解码时跳过它们
- 对每一行做填充、截断和宽度计算

雪上加霜的是，图片也可以作为 base64 文本，混在这些行里传递。仅仅是用 `.includes` 检查某一行是不是图片行，就占掉了一次会话全部 CPU 周期的 20%。这账单可不便宜（而且这个会话里压根一张图片都没有！）。

这还只是 JS 这一侧的图。在这种设置下，渲染管线就是一台不停折腾堆内存的机器：你不断地分配、拆解、丢弃字符串和字符串数组——拼接、切分、截断、填充，每一步都在反复来一遍。Not gud.

同一份契约还让扩展之间没有共同的设计语言。只要你用过*任何一个* Pi 扩展就知道，除了让 Clawd 把每个扩展逐一重新调样式——然后自己维护那份结果——之外，根本没办法让它们遵循同一套规范。

没有任何契约规定：该不该用圆角边框、能不能用 Nerd Font 图标、它会不会用你喜欢的颜色来表达自己正在做的事情的语义。你会发现：

- 99% 的情况下，它只会做最低限度的事（也就是截断/折行文本），你所有的工具都成了一模一样、无法区分的灰色矩形。
- 1% 的情况下，它又拼命想显得花哨，结果在你整体极简的配置里显得格格不入。

Pi 目录里的一个社区渲染器，展示了这份契约对最终呈现给用户的东西做了什么：

```javascript
  if (cq.sources.length > 0) {
    lines.push("");
    for (const s of cq.sources) {
      const domain = s.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const title = s.title.length > 50 ? s.title.slice(0, 47) + "..." : s.title;
      lines.push(theme.fg("muted", ` \u25b8 ${title}`) + theme.fg("dim", ` \u00b7 ${domain}`));
    }
  }
  lines.push("");
} else {
  const textContent = result.content.find((c) => c.type === "text")?.text || "";
  const preview = textContent.length > 500 ? textContent.slice(0, 500) + "..." : textContent;
  for (const line of preview.split("\n")) lines.push(theme.fg("dim", line));
}

if (details?.fetchUrls?.length) {
  if (details.curated) {
    lines.push(theme.fg("muted", `Fetching ${details.fetchUrls.length} URLs in background`));
  } else {
    lines.push(theme.fg("muted", "Fetching:"));
    for (const u of details.fetchUrls.slice(0, 5)) {
      const display = u.length > 60 ? u.slice(0, 57) + "..." : u;
      lines.push(theme.fg("dim", "  " + display));
    }
    if (details.fetchUrls.length > 5) lines.push(theme.fg("dim", `  ... and ${details.fetchUrls.length - 5} more`));
  }
}
```

这里的问题可不少：

1. 它按码点而不是可见宽度来切片文本，所以一旦你把终端调到 40 列以下，它就会冲出自己那一行，把下面的一切都撞得稀烂
2. 它完全不知道终端宽度，所以哪怕空间足够，你也照样会看到省略号！
3. 最重要的是，它无视 Pi 组件的第一条规则，不对外部输入做净化。这意味着它抓取的那个东西只要喂给它合适的 ANSI 转义序列，就能把你的整个 UI 换成一张鸭子的图片。[绝对](https://www.sentinelone.com/vulnerability-database/cve-2023-32712/)[没法](https://socprime.com/active-threats/cve-2025-55752/)[拿它](https://github.com/boxdot/gurk-rs/issues/384)[干别的了](https://www.packetlabs.net/posts/weaponizing-ansi-escape-sequences/)！

当你把复杂度一股脑推给毫无防备的开发者——而这个开发者往往是 Claude——出现这种事再自然不过。

每次被要求“做个工具 UI 吧”的时候，LLM 是不会记得你 harness 的每一个内部细节的。说实话，有时候我自己也不想记，而冒烟测试一跑通就算“能用”了。

性能、安全和一致性这三类问题同出一源：一个已经渲染好的字符串，被同时当作布局树、样式树、内容、传输载体和终端程序来用。

### omp² 的改变：一次通过的原语

最底层的消费者（也就是说，不是你，除非你来提 PR）把 *RichText* `(Style, String)` 推进交到它们手里的抽象管线 `(&mut impl Out)` 中。

这把 267 秒的渲染时间砍到了 90ms：

<figure data-hk="000000010000000000004000010b381"><svg data-hk="000000010000000000004000010b38200" viewBox="0 0 1000 772" role="img" aria-label="Render pipeline: before, N + N·M buffers per frame; after, a single-pass sink with an O(cache) RichText replay" font-family="var(--st-font-sketch)"><defs><pattern id="pl-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#2E333C"></circle></pattern></defs><rect width="1000" height="772" fill="#121419"></rect><rect width="1000" height="772" fill="url(#pl-dots)"></rect><text data-hk="000000010000000000004000010b3820100" x="500" y="48" font-size="26" fill="#DBD8CF" text-anchor="middle" letter-spacing="2" stroke="#DBD8CF" stroke-width="0.8">RENDER ONCE, REPLAY FOREVER</text><path data-hk="000000010000000000004000010b3820110" d="M219.6 59.1C397.5 59 594.7 60 780.9 60.3M219.2 59.6C460.8 61 638.4 61.7 780.3 59.7" fill="none" stroke="#DBD8CF" stroke-width="2" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b382020" x="48" y="112" font-size="16" fill="#F4644A" stroke="#F4644A" stroke-width="0.8">before</text><text data-hk="000000010000000000004000010b382030" x="130" y="112" font-size="13" fill="#9AA2AD">render(): string[]</text><rect data-hk="000000010000000000004000010b382040" x="49.5" y="145.5" width="117" height="39" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b382041" d="M49.1 142.5C84.8 145.1 135.5 143.9 167.3 142.7M48.2 145.4C86.1 145.8 136.9 144.6 168.3 143.4M169.4 143.6C167.5 159.8 168.6 181.4 166.8 186.7M168.2 143.8C168.6 161.6 168.8 173.4 167.9 186.6M168.7 185.7C127.9 187 86.1 185.6 48.1 184.6M169.3 184.6C108.4 187.1 81.8 186.9 47.2 186.7M48.3 185.7C47.3 170.6 47.3 153.6 48.6 142.9M48.5 186.2C47.2 165 48.2 156 47.8 141.5" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b382050" x="108" y="170" font-size="14" fill="#DBD8CF" text-anchor="middle">string[]</text><rect data-hk="000000010000000000004000010b382060" x="249.5" y="145.5" width="117" height="39" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b382061" d="M246.4 143C284.1 142.9 330.4 144.1 367 142.8M246.6 143.1C285 146 345.1 144.9 369.5 143.4M367.8 144.3C369 160.1 367.8 173.6 368.9 185.4M367.8 142.9C370.1 158 367.8 177.8 367 185.9M369.4 186.8C319.3 186.9 282.3 187.7 246 185M369.3 185C327.2 187.7 266.7 187.5 245.3 187M248.5 186.6C246.7 167.8 246.8 152.3 248.9 143.8M248.4 187.3C248.3 168.9 249.1 157.8 248 144.1" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b382070" x="308" y="170" font-size="14" fill="#DBD8CF" text-anchor="middle">string[]'</text><rect data-hk="000000010000000000004000010b382080" x="449.5" y="145.5" width="117" height="39" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b382081" d="M446.4 143.3C507.3 143 544.8 143.4 568 144M447.4 144.8C494.6 141.9 545.4 144.1 567.9 145.2M566.5 142.2C568.8 157.1 567.5 178.5 566.8 186.2M567.8 143.3C566.9 163.3 568.8 175.9 569.4 186.8M570.6 185.9C514.5 185.4 465.5 187.9 445.9 186.2M568.6 184.9C533.4 187.9 479.4 185.7 447.6 186.7M449.1 189.6C447.9 166.6 447.4 158.5 448 141.4M448.4 187.8C449.7 169.5 446.3 149.5 449 142.6" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b382090" x="508" y="170" font-size="14" fill="#DBD8CF" text-anchor="middle">string[]''</text><rect data-hk="000000010000000000004000010b3820a100" x="649.5" y="145.5" width="117" height="39" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a101" d="M645.6 142.7C694.7 143.5 743.6 143.6 771 143.5M647.6 145.5C692.6 143.1 748.3 143.8 771.5 144.8M768.8 142C766.7 157.1 767.9 177.4 768.6 186.3M766.6 142.2C769.4 163.3 766.7 178 768.9 186M770.3 187.3C730.3 185 680.4 185.8 645.4 186.6M770.8 186.3C713.4 187.7 687.5 186.4 645.3 186.4M646.7 188.1C646.9 174 648.7 151.2 646.6 144.2M647.4 187.2C648.9 169.7 649.1 154.6 649.4 142" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a110" x="708" y="170" font-size="14" fill="#DBD8CF" text-anchor="middle">string[]'''</text><rect data-hk="000000010000000000004000010b3820a120" x="849.5" y="145.5" width="101" height="39" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a121" d="M847.7 143.8C896.3 143.1 927.1 143.1 955.3 143.8M847.3 143.2C895.9 143.2 923.7 144 953 145.5M951.6 143.8C952.3 162 950.1 174.1 951.3 187.3M951.3 142.4C953.9 156.5 952.2 177.8 952.3 187.1M953.2 185.8C908.7 186.9 868.1 184.9 847.6 186.8M953.5 187.4C912.4 183.1 882.2 184.6 846.4 186.2M848.9 186.8C847 168 847.9 152 848.4 145M848.1 186.6C847.3 166.2 848.6 150 847.5 142.9" fill="none" stroke="#F4644A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a130" x="900" y="163" font-size="13" fill="#DBD8CF" text-anchor="middle">parent</text><text data-hk="000000010000000000004000010b3820a140" x="900" y="179" font-size="13" fill="#DBD8CF" text-anchor="middle">string[]</text><path data-hk="000000010000000000004000010b3820a150" d="M167.2 164.2C200 164.2 218.3 165.7 243.4 166.1M168.9 165C200.2 164.7 220.5 164.1 244.2 163.1M243.9 164.8C239.9 166.8 236.4 168.2 234.1 169.7M243.7 165.2C239.2 167.5 237.4 168.1 233.9 169.4M243.7 165C239.9 163.6 237.6 162.2 233.8 160.6M243.8 164.8C240.3 164 236.6 161.5 233.7 160.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a160" d="M367.5 163.8C400.9 165.7 427.8 164.5 443.8 162.6M367.1 165C406.6 164.6 421.7 167.2 443.5 166.4M444.3 165.1C440.6 166.4 435.6 168.8 433.8 169.8M444.1 164.8C438.7 167.2 435.5 168.7 433.8 169.8M444.1 165.3C440 163.2 435.8 161.2 433.7 160.2M443.8 164.9C439.8 163.6 437.2 162.1 434.1 160.2" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a170" d="M567.1 164.3C598.6 165 623.4 164.8 644.9 163.1M567.9 164.9C597.6 165.2 618.8 166.3 645.9 166.1M644.1 165.2C640.1 166.6 635.5 168.6 634.1 169.7M644.2 165.3C639.4 166.9 637.1 168.8 633.6 169.2M643.7 165.1C639.7 163.1 637 162.2 634.1 160.8M644.2 164.7C639.3 162.8 635.7 160.8 633.9 160.5" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a180" d="M766.4 166.5C803.9 164.4 823.9 164.7 842.8 164.7M767.7 163.7C796.3 164.3 825 162.6 844.4 164M844 165.3C839.3 166.4 836.9 168.3 833.7 169.3M844.2 165.3C839.3 167.5 836.3 168.9 833.8 169.4M843.8 165.1C840.4 163.1 837.2 162.1 834.3 160.4M843.8 165.2C839.5 162.9 835.9 161.5 834.1 160.6" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a190" x="206" y="138" font-size="13" fill="#F4644A" text-anchor="middle" transform="rotate(-1.5 206 138)">parse</text><text data-hk="000000010000000000004000010b3820a200" x="406" y="138" font-size="13" fill="#F4644A" text-anchor="middle" transform="rotate(1 406 138)">wrap</text><text data-hk="000000010000000000004000010b3820a210" x="606" y="138" font-size="13" fill="#F4644A" text-anchor="middle" transform="rotate(-1 606 138)">pad</text><text data-hk="000000010000000000004000010b3820a220" x="806" y="138" font-size="13" fill="#F4644A" text-anchor="middle" transform="rotate(1.5 806 138)">concat</text><text data-hk="000000010000000000004000010b3820a230" x="206" y="202" font-size="13" fill="#F4644A" text-anchor="middle">alloc</text><text data-hk="000000010000000000004000010b3820a240" x="406" y="202" font-size="13" fill="#F4644A" text-anchor="middle">alloc</text><text data-hk="000000010000000000004000010b3820a250" x="606" y="202" font-size="13" fill="#F4644A" text-anchor="middle">alloc</text><text data-hk="000000010000000000004000010b3820a260" x="806" y="202" font-size="13" fill="#F4644A" text-anchor="middle">alloc</text><text data-hk="000000010000000000004000010b3820a270" x="48" y="236" font-size="13" fill="#9AA2AD">N components × M transforms — every buffer re-parsed, re-measured, thrown away. Every frame.</text><path data-hk="000000010000000000004000010b3820a280" d="M47.4 274.6C427.3 271.2 639.7 275.7 950.7 273.2M46.7 272.6C455.2 275.1 638.7 274.8 952.1 274.4" fill="none" stroke="#9AA2AD" stroke-width="1" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a290" x="48" y="324" font-size="16" fill="#4ADE80" stroke="#4ADE80" stroke-width="0.8">after</text><text data-hk="000000010000000000004000010b3820a300" x="122" y="324" font-size="13" fill="#9AA2AD">push run(style, &amp;str) into a sink</text><text data-hk="000000010000000000004000010b3820a310" x="48" y="392" font-size="14" fill="#DBD8CF">markdown</text><text data-hk="000000010000000000004000010b3820a320" x="48" y="422" font-size="14" fill="#DBD8CF">latex · syntax</text><text data-hk="000000010000000000004000010b3820a330" x="48" y="452" font-size="14" fill="#44CFFF">decompose(ansi)</text><text data-hk="000000010000000000004000010b3820a340" x="48" y="480" font-size="13" fill="#9AA2AD">external text, parsed once</text><path data-hk="000000010000000000004000010b3820a350" d="M179 389Q221.2 396.8 235.5 405.4L249.8 414.1M181 388.5Q220.8 397.1 234.8 405.3L248.9 413.4M250.2 413.9C246.5 413.2 241.8 413.2 239.4 412.3M249.9 414.3C245.1 413.3 242.7 413.4 238.9 412.6M250.3 413.7C247.7 411.2 245.9 407.1 244.2 404.9M250.2 413.9C247.4 410.1 245 406.8 244 404.9" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a360" d="M176.1 418.9C203.8 417.9 230.2 416.6 249.6 417.8M178.5 417C202 418.6 234.3 418.9 250.7 419.3M249.9 418.9C245.4 421 242 422.6 239.8 423.6M250.1 419.1C246.6 420.3 243.3 421.9 240.1 423.5M250.2 419.1C245.1 416.8 241.2 415 240.3 414.2M249.7 418.8C245.7 417.4 242 415.7 240 414.7" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a370" d="M185.1 448.3Q223 441.4 235.9 432.9L248.7 424.3M187.1 448.9Q222.7 440.9 236.2 432L249.7 423.1M250.3 424C247.7 426.7 245.3 431.3 243.7 432.9M249.8 424.2C247.9 427.2 244.9 431.6 243.9 433.5M249.7 424.2C245.2 424.7 242.5 425.5 239.3 425.5M250.1 424C246.3 424.7 240.9 425.4 238.9 425.4" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010b3820a380" x="257.5" y="397.5" width="313" height="45" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a381" d="M254.5 396C407.3 397.3 478.5 394.3 573.3 396.3M254.5 395.3C400.3 396.1 519 394.1 573 396.4M570.7 393.8C573 409.5 574.3 431.4 573.1 444.7M571.7 394.5C572.7 419.5 573.6 433.7 572.5 445.5M574.8 444.5C422.5 443.4 302.4 443.5 254.9 442.9M574 444.6C456 441.5 359 440.5 255.2 443.6M254.8 444.3C254.9 427.7 257.6 403.7 257 394.9M255.8 445.4C255.5 428.3 257.1 408.8 255.3 395" fill="none" stroke="#44CFFF" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a390" d="M362.9 398.3C363.8 413.4 361.5 427.3 363.4 440.8M363 396.9C363.1 412.7 362.2 429 362.6 441.8" fill="none" stroke="#44CFFF" stroke-width="1" stroke-linecap="round" stroke-dasharray="6 5"></path><path data-hk="000000010000000000004000010b3820a400" d="M467.9 398.9C468.1 414.4 468.4 425.8 469.4 442.9M467.5 396.6C466.6 419.5 467.9 434.4 467.2 441.1" fill="none" stroke="#44CFFF" stroke-width="1" stroke-linecap="round" stroke-dasharray="6 5"></path><text data-hk="000000010000000000004000010b3820a410" x="309" y="426" font-size="13.5" fill="#44CFFF" text-anchor="middle">.wrap(w)</text><text data-hk="000000010000000000004000010b3820a420" x="415" y="426" font-size="13.5" fill="#44CFFF" text-anchor="middle">.clip(w,'…')</text><text data-hk="000000010000000000004000010b3820a430" x="520" y="426" font-size="13.5" fill="#44CFFF" text-anchor="middle">.restyle(f)</text><text data-hk="000000010000000000004000010b3820a440" x="414" y="472" font-size="13" fill="#4ADE80" text-anchor="middle" transform="rotate(-0.7 414 472)">single pass · no intermediate row buffers</text><path data-hk="000000010000000000004000010b3820a450" d="M572.4 418C614.2 419.7 640.4 421.7 661 421.4M571.5 422.1C604.9 421.8 635.5 420.1 659 418.6M660.1 420.3C657.3 421.3 653.1 423.4 649.7 424.7M660.4 420C655.9 422 651.6 423.3 649.7 424.3M659.9 420C654.8 418.3 652.5 417 650.2 415.7M659.9 419.7C656.2 418.2 653.2 416.9 649.8 415.9" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><path data-hk="000000010000000000004000010b3820a460" d="M791.1 420.4C820.6 419.4 842.9 420.8 869.6 421.6M792.7 420.9C824.5 422 851.1 418.2 867.8 422M868.3 420.2C863.8 421.7 860.4 423.4 858.3 424.6M867.7 420C864.9 421.7 860.9 422.8 857.7 424.3M868.1 420.1C864.8 418.8 860.2 416.6 858.3 415.5M868.1 420.2C863.2 417.8 861.1 417 858.2 415.7" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><rect data-hk="000000010000000000004000010b3820a470" x="665.5" y="397.5" width="121" height="45" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a471" d="M663.6 396.4C706.6 395.4 757.7 393.6 788.3 396.3M662 395.5C717.6 397.4 768.2 397 788.7 397.2M788.8 393.8C790.3 408.7 789.3 431.1 786.6 444M788.2 393.1C788.5 419 787.1 429.4 789.1 444.7M788.7 443.6C738.8 445 701.8 443.3 661.8 444.9M788.7 443.5C742.1 445.4 704.9 442.6 662.1 443.3M664.1 444.4C664 423.2 664.5 406.9 665.3 394.7M662.5 446.7C664 420.2 662.8 407 664.5 392.9" fill="none" stroke="#DBD8CF" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a480" x="726" y="426" font-size="14" fill="#DBD8CF" text-anchor="middle" stroke="#DBD8CF" stroke-width="0.8">Frame</text><text data-hk="000000010000000000004000010b3820a490" x="830" y="410" font-size="13" fill="#9AA2AD" text-anchor="middle">diff</text><rect data-hk="000000010000000000004000010b3820a500" x="873.5" y="397.5" width="77" height="45" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a501" d="M872.9 395.9C896 396.5 927.3 396.4 955 396.7M873 396C900.9 397.4 932.6 396 953.4 395.4M953.3 397C952.9 410.1 951 432.4 952.1 443.2M952.7 395.4C953 417.8 952.5 427.9 951.2 443.9M954.4 443.1C925.4 445.8 882.8 444.4 870.7 444.7M952.7 444.5C929.4 446.3 883.8 444.8 869.4 442.8M870.9 444.8C871.9 427.7 870.9 409.1 873.2 393.8M871.5 446.7C871.8 425.4 870.7 409.4 871.2 395" fill="none" stroke="#4ADE80" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a510" x="912" y="426" font-size="14" fill="#4ADE80" text-anchor="middle" stroke="#4ADE80" stroke-width="0.8">stdout</text><text data-hk="000000010000000000004000010b3820a520" x="952" y="472" font-size="13" fill="#9AA2AD" text-anchor="end">ANSI written here, once</text><path data-hk="000000010000000000004000010b3820a530" d="M615.1 419Q607.6 481.4 586.6 498.3Q565.6 515.1 543.1 530.1L520.5 545.2M613.2 419Q607.1 481.7 586.8 498.7Q566.5 515.8 542.8 530.4L519.1 544.9M520.1 544.3C522.6 540 524 537.9 526.2 534.8M519.7 543.7C522.9 540.6 525.4 536.6 526.5 535.1M520 543.8C525.5 543.7 528.7 542.6 530.6 542.3M519.7 543.8C524.1 544 527.7 543 530.6 542.4" fill="none" stroke="#F5B04A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a540" x="628" y="498" font-size="13" fill="#F5B04A" transform="rotate(-2 628 498)">.tee(cache)</text><rect data-hk="000000010000000000004000010b3820a550" x="257.5" y="545.5" width="313" height="121" rx="0" fill="#1A1E25"></rect><path data-hk="000000010000000000004000010b3820a551" d="M254.2 543.7C362 542 521.3 543.3 573.1 544M255.4 542.8C351.7 541.4 510.2 547 572.5 543.7M572.4 543.4C571.6 588 571.1 643.7 572.4 667.4M572.9 542.6C572.8 589.7 570.8 624.8 570.8 669.3M574.7 668.1C446.3 668.8 323.5 668.4 255.1 668.6M573 669C468.1 664.4 320.1 670 254.6 667M255.5 668.2C256.2 614.7 257.6 585.2 257.3 542.3M255.9 669.2C257 609.7 254.5 564.1 256.2 540.9" fill="none" stroke="#F5B04A" stroke-width="1.5" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a560" x="280" y="576" font-size="15" fill="#F5B04A" stroke="#F5B04A" stroke-width="0.8">RichText</text><text data-hk="000000010000000000004000010b3820a570" x="280" y="604" font-size="13.5" fill="#DBD8CF">pool: String</text><text data-hk="000000010000000000004000010b3820a580" x="280" y="626" font-size="13.5" fill="#DBD8CF">runs: [(Style, ..end)]</text><text data-hk="000000010000000000004000010b3820a590" x="280" y="648" font-size="13.5" fill="#DBD8CF">rows: [(run_end, width)]</text><text data-hk="000000010000000000004000010b3820a600" x="256" y="694" font-size="13" fill="#9AA2AD">clear() keeps capacity — streaming re-renders allocate nothing</text><path data-hk="000000010000000000004000010b3820a610" d="M575.1 606.4Q675.8 596.8 699.2 558.9Q722.7 520.9 724.7 485L726.7 449.2M575.6 607Q676.1 597 699.5 559.5Q722.9 522.1 724.3 485.4L725.7 448.8M726.1 449.9C727.6 454.5 729.3 458.6 729.8 460.3M726.1 449.6C727.4 454.7 728.8 457.2 729.8 460M725.9 450.3C724.1 453.2 722.9 456.3 721.3 459.8M726.3 450.1C723.9 454.3 721.7 458.5 721.2 459.6" fill="none" stroke="#F5B04A" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="6 5"></path><text data-hk="000000010000000000004000010b3820a620" x="746" y="566" font-size="13" fill="#F5B04A" transform="rotate(-1 746 566)">replay()</text><text data-hk="000000010000000000004000010b3820a630" x="746" y="584" font-size="13" fill="#9AA2AD">next frame, no re-render</text><path data-hk="000000010000000000004000010b3820a640" d="M48.8 717.8C459.1 721 764.8 719.3 952 718.1M47 718.8C378.3 718.9 635.3 718.9 952.6 717.4" fill="none" stroke="#9AA2AD" stroke-width="1" stroke-linecap="round"></path><text data-hk="000000010000000000004000010b3820a650" x="500" y="750" font-size="15.5" fill="#DBD8CF" text-anchor="middle"><tspan data-hk="000000010000000000004000010b3820a651" fill="#F4644A">N + N·M buffers per frame</tspan>&nbsp;&nbsp;-&gt;&nbsp;&nbsp;<tspan data-hk="000000010000000000004000010b3820a652" fill="#4ADE80">O(cache)</tspan></text></svg><figcaption>Before: <code data-hk="000000010000000000004000010b38300">render(): string[]</code> — N components × M transforms, every buffer re-parsed, re-measured, and re-allocated, every frame. After: RichText runs stream through the abstract pipeline in a single pass into the frame diff.</figcaption></figure>

临时对象、ANSI 解析、字素处理：在帧渲染器以下的每一层里，统统消失了，这不是显而易见的嘛！

既然我们可以直接……流式输出填充，再输出你的一行，如此重复，那为什么还要先给你的组件加好填充再往下传？既然我们可以直接……在省略号之后丢掉你的流，或者在变换过程中由我们自己把它拆成行，那为什么要让你先把一份 255 行的 diff 全彩渲染出来，再 `.slice(0, 3)` 截断成另一个字符串缓冲区数组？

底层原语只做一次测量与变换，并对此全权负责。更高的层次永远不该去解析 ANSI，来重新发现它们自己发出的结构。

### 类型化的组件模型

接下来，`string[]` 会被一个像样的组件模型取代。更高层的消费者只需要把盒子一层层堆起来，享受 LSP 一路指引：

![编辑器中显示 omp² 组件标记，在 <text> 内嵌套 <text> 元素被标记出来：<text> 内不允许出现元素](https://stencil.so/blog/harness-playbook/component-model-lint.png)

*标记是类型化的：在 <text> 内嵌套元素，在编辑时就是一个 lint 错误，而不是运行时的一帧乱码。*

![omp² TUI 实时渲染标记：一个带标题行的盒子、一个图标、文本上从洋红到青色的水平渐变，以及渲染出的 LaTeX 分数二分之一](https://stencil.so/blog/harness-playbook/component-markup-render.png)

*标记进，帧出：<box>、<row>/<col>、一个 <ico:new/> 图标、一段洋红..青色的水平渐变，以及由 $ \frac{1}{2} $ 实时渲染出的 ½。*

说起来，我可能不喜欢搞前端，但我真的太喜欢一个好的抽象了。`(Element, Props, Children)` 再配上一个布局引擎，就真的是你所需要的全部了，相比之下简直美妙。

DOM 那一章承诺过，一个工具元素可以由任何 actor 来渲染。下面就是这个承诺的具体形态：

这就是 `Read` 组件的样子。还不赖，对吧？

```html
<box bc=muted>
	<row kind=title gap=1>
		<text>•</text>
		<text bold>Read</text>
		<a href={input.path}>{input.label}</a>
		{#if status=error}<badge tone=error>exit {code}</badge>{/if}
	</row>
	{#if result.head}<pre lang={result.lang} wrap=word start={result.start}>{result.head}</pre>{/if}
	{#if @expanded}
		{#if result.blob}<pre lang={result.lang} numbers start={result.start} blob={result.blob}></pre>{/if}
	{/if}
	{#each diag as d}<callout tone={d.severity}>{d.msg}</callout>{/each}
	{#if result.src}
		<hr title="Output"/>
		<row gap=1 fg=muted>
			<text>⟨Resolved path:</text>
			<text>{result.src}⟩</text>
		</row>
	{/if}
	{@render usage}
</box>
```

工具作者描述结构和语义。TUI、Web 客户端、快照测试和远程检视器各自决定这份结构在自己的表面上如何布局。

### 表现策略归渲染器所有

组件模型白送了两个有用的特性：

1. `<ico:new/>` 给每个插件一个顺手的图标，同时尊重用户在 ASCII、Unicode 或 Nerd Font 之间的选择。边框也是同样的机制。
2. 语义颜色不再需要把一个主题对象穿过每一个渲染器。Claude 可以直接要 `info`，而不用挑一个具体的颜色值，然后祈祷它和用户的主题搭得上。

![使用 border=round bc=info 与 fg=red..blue 的 omp² 标记，渲染成主题 info 色的圆角盒子，并带有渐变字形](https://stencil.so/blog/harness-playbook/theme-gradient-markup.png)

*border=round bc="info" 会解析为主题的语义颜色；fg="red..blue" 则是一段渐变。没有任何地方需要穿一个主题对象。*

你还需要掌控文本流的节奏。Claude 和 Codex 吐出分块的节律截然不同——一个一次几个词，另一个一次几个字符。抹平这些差异会改变 harness 给人的响应感：平稳的运动读起来像是在推进；一阵爆发接着一段卡顿则不然。Heh.

语义图标、边框、颜色、截断和流节奏现在都只有一个归属者。扩展只管要 `info`、`error` 或 `<ico:new/>`；它们不会把主题对象穿过每一个函数，也不会替每个用户挑选 Nerd Font 字形。

### 验证是界面的一部分

在当前的“meta”（主流打法）里，投入产出比最高、而且不花你一分钱的投资，就是让智能体为任何交互式 TUI / GUI 实现一套调试协议。如果“如何验证”既未知又未定义，智能体就会另辟蹊径弄出一个看起来像那么回事的替代品，也就是说，它会写一个大多数情况下什么都没真正检查的测试文件。

提前定义好“验证”意味着什么，并给它一个顺手的形态，就能大幅降低摩擦，这意味着它会成为开发循环中一个活跃的环节。

![两次 TUI Debug 工具调用：一次向名为 chat 的会话注入八个合成按键事件，另一次导出无头布局树，包含组件名称、位置和可聚焦标志](https://stencil.so/blog/harness-playbook/tui-debug-tool.png)

形态本身其实不重要，而且随时可以更新：它可以是一个自定义工具、一个 Python 包或者一个 API，但绝对必须提供一个非破坏性的、离屏的、可多实例的*东西*，用来阻止智能体重新定义（通常是降低标准地重新定义）什么叫成功。

换句话说，调试协议成了“UI 是什么”的机器可读定义——而不只是一个测试辅助工具。

### 对话记录是一个协议

TUI 真正不可能做到的部分，是做到没有一条 GH issue 抱怨它坏了。人们对自己不了解的东西总是理想主义的，而不幸的是，很多人并不知道他们想要的那种完美 TUI 体验根本不可能实现（每个组件无论位于何处都完全保持最新，还能动态变更）。

#### 块

我们把规范的对话记录（transcript）定义为一个块列表。一个块产出若干行文本，并经历一个生命周期：

活跃 → 已定稿 → 已提交

存活期间，块 *i* 展示一个当前快照 *Wi*，它是一个行数组。定稿时，它冻结为一个不可变快照 *Fi*。

块有两种模式：

- 可变：每个新快照都可以整体替换前一个（旋转指示器、进度条）。快照是推测性的，永远不会成为历史；只有 *Fi* 会。
- 仅追加：快照只增不减：每个快照都是下一个快照的前缀，最后一个快照是 *Fi* 的前缀（流式文本）。

当一个块超出了分配给它的视口空间时，这个区别就很重要。可变快照不能提前进入历史，因为后续更新可能会替换它；那样我们就得把已经滚上去的行硬拽回来。而像助手思考这样的仅追加块只会延长一个稳定前缀，所以这个前缀可以立即开始提交。

#### 终端

宽 *W*、高 *H* 的终端有两个缓冲区：

- *V*：视口，有 *H* 行可见
- *S*：原生回滚缓冲区，无界，仅追加

技术上，我们可以清空并覆写回滚缓冲区，但这会导致用户经常抱怨的那种行为；所以它现在是一条不变量。

折行 *wrapW* 把逻辑行变成物理行，并取决于当前宽度。视口下方没有可寻址的区域。写过它的底部会让终端滚动，把顶部的行不可逆地推进 *S*。

逻辑历史 *L* 以未折行的行来保存，因此与宽度无关：按块顺序排列的已提交定稿，每个恰好出现一次，再加上当前正在流式输出的块中已经放行的那部分。设 *c* 为最后一个已提交的块，*j = c+1*：

L = F1 · F2 ⋯ Fc · Wj\[1..ej\]

其中 *ej* 是流式头部已经发进历史的行数（除非块 *j* 是一个正在流式输出中的仅追加块，否则 *ej = 0*）。

因此：

- 已提交的定稿恰好出现一次，连续，且按块顺序排列；
- 可变的推测性快照永远不会进入 *L*；
- 仅追加的头部可以在仍在流式输出时逐行进入 *L*；
- 定稿不写入任何东西；
- 提交只追加 *Fj* 中尚未发出的那些行

#### 调整尺寸

调整尺寸（resize）不改变任何逻辑层面的东西：每个 *Wi*、每个 *Fi* 和 *c* 都原封不动地保留下来。只有折行和视口分配会被重新计算。已经进入原生回滚缓冲区的行无法重写，所以调整尺寸需要为它们指定一条明确的策略：

- 保留：原样保留终端模拟器折行后的历史。
- 追加：追加一份重新渲染的历史，物理行可能会重复。
- 重建：开启一个新的物理纪元，把历史回放进去。

这些规则把三件容易混为一谈的事情分开了：视口中可变的表现、与宽度无关的逻辑历史，以及不可逆的原生终端行。一旦给它们起了名字，调整尺寸和流式输出就变成了策略选择，而不是口口相传的经验之谈。

### 为不可能的部分写规约

那么，我为什么要拉着你过一遍这些“数学”？因为要验证这个算法是否正常，是件非常复杂的事；上一代实现里，我们不得不写一个模糊测试器才达到稳定状态，这一次我想避免这种事。

取而代之的是，我们按上面描述的方式用 [TLA+](https://lamport.azurewebsites.net/tla/tla.html) 对这套行为建了模，然后要求对这些块的提交与定稿处理方式做迭代修改，直到清晰定义的不变量全部满足为止。

现在，如果我们真想改点什么，比如说，yolo 式地提交部分内容，或者不允许块截断，我们就有了一份可以更新的参考规约，以及一种极其简单的方式来判断它能不能行得通，失败时还会给出反例。

论文和完整的 `ElasticSlots.tla` 源码放在[附录 B](#appendix-b-elastic-speculative-slots)。

### 这解锁了什么

例行秀一下肌肉，然后我们就可以往下走了！*现在要是有人抱怨 TUI 坏了，我可以直接给对方一份形式化证明，说明它为什么不可能修好，棒极了。*

![omp² TUI：一个覆盖在实时工作分片列表之上的命令面板、一条带 diff 统计的会话侧栏、一个状态栏，以及一张内联图片缩略图](https://stencil.so/blog/harness-playbook/tui-flex.png)

*任务进行中的 omp² TUI：命令面板覆盖在实时并行分片之上，会话侧栏带有逐文件的 diff 统计，还有一张内联图片缩略图——每个元素都是同一条流式管线上的组件。*

TUI、Web 客户端和远程检视器可以在布局上各不相同，而在事实上完全一致。工具作者描述语义状态；组件系统掌管表现；对话记录协议掌管恰好一次的历史。

这又是同一个设计动作的再次重复：把难啃的不变量下推到能强制执行它的那一层。实现技术栈应当加固这些不变量，而不是引诱每一个贡献者——以及每一个编码智能体——去发明一套自己的局部风格。

## 技术栈

前面几章讲的是架构。而语言的选择，决定了代码库会在这套架构与下一个“善意的”局部例外之间设置多少摩擦。当实现中的很大一部分由智能体产出，而这些智能体又是在各个生态的默认做法与病态习惯上训练出来的，这一点就更加要紧。

### 语言选择即架构

**眼下，除非你别无选择、必须和前端代码打交道，否则 TypeScript 是一个糟糕的选择。**

现在启动一个项目时，你能做的最有影响力的决定之一就是：选对工具。要是三年前我看到一篇文章这样开头，肯定已经开骂了，但是……如果你不信我，试试把描述同一个小组件的同一段提示词交给 Claude。

然后把 macOS（Swift）换成 Linux（Qt/JS）。前者会给你一个毛玻璃风格、看上去就像系统自带的小组件；后者则给你一个 UI 元素互相重叠、UX 取舍令人生疑的矩形，让你感觉自己刚啃完定义 UI 所需的那套 XML schema，而这是你第一次把它编译出来。

当然，你怎么写提示词确实有影响，你也确实可以描述得更细，但用不了多久你就会发现，无论你怎么做，其中一方几乎毫不费力就能胜过另一方。macOS 历来做得好的一件事，就是强迫开发者遵循同一种一致的设计风格，而这对 LLM 来说同样成立。

重点不在于 Swift 有品味而 JavaScript 没有。而在于默认值、标准库、规范的项目形态、编译器反馈以及生态惯例，共同构成了生成代码的先验。一门允许二十种同样“正常”的局部风格并存的语言，等于要求模型在触及产品问题之前先做二十个决定。

### TypeScript 会变成你自己的语言

不幸的是，我曾经最喜欢 TypeScript 的那一点，恰恰是它最终总会变成*你的*语言：

- 用 `camelCase` 还是 `snake_case`？或者干脆把你的库命名为 `$`？
- 写横跨 200 行的泛型，还是一个泛型都不写？
- 用 `Buffer` 还是 `Uint8Array`？
- 用 Zod 还是 Typebox？
- 用 `Array<T>` 还是 `T[]`？
- 用 ESM 还是 CJS？（那扩展名呢？`.ejs, .cjs, .mjs, .js?`）
- 用 TypeScript 还是 JSDoc？
- 用 Class，还是继续用对象（或者干脆 new function()）？
- 默认导出还是不默认导出？
- 用星号重导出，还是逐个点名？
- 用 `private foo` 还是 `#foo`？
- 用 `module/index.ts` 还是 `module.ts`？
- 用 `const x = () => ..` 还是 `function x() {`？
- 用 `function x(args)` 还是 `function x(...args)`？
- 如果选后者，用 `...args: any[]` 还是 `...args: unknown[]`？
- 用 `const X = 1`、`enum E { X = 1 }`，还是 `const enum E { X = 1 }`？

你看，我在那门最大的“只写不读”语言（也就是 C++）上耗了十年人生，对这种事确实乐在其中。可当被迫在 Zod 和 Typebox 之间二选一时，你那位初级小伙伴只会随手撸一个我们所谓的 `isRecord`。能直接把类型 union 起来，何必用泛型？能用一点 typeof 做特化，何必费脑子确保每个分支对两种类型都成立？何必用类，不就是对象加原型嘛，不是吗？

也许是因为外面烂 JS 代码实在太多，也许是因为它们一路上多半吞下了一堆压缩过的代码，反正我受够了。考虑到同一个初级小伙伴能找出 Linux 0-day，换作是我，就不会再指望*正确的模型*或*正确的代码质量工具*了，也别再费劲钻那些圈子了。

也许 EffectJS 会改变这一局面；但在我看来，最终赢家会是 Go（尤其是等 WASM 的 GC 提案定稿之后），理由与 Swift 在设计上胜出的理由类似（尤其是编译速度和交叉编译的便利性）。不过有些场景需要更底层的系统语言，所以我们这里选了 Rust。

它们仍然需要相当频繁地被纠偏，因为它们总走通往目标的最短路径：宁可分配副本也不去处理精细的借用，把错误当字符串传递而不用 `thiserror`；但它们工作所需的大部分东西都在 `std` 加上 `serde` 生态里了，而且编译器提供了相当程度的安全保障，所以就这么定了。

### 用 Python 做扩展

下一个决定是：要不要为了可扩展性把 TS 请回来。我们说不，主要因为：

1. 智能体能写出像样的 Py => 顺理成章，扩展也就像样
2. 想在小体积下实现一个符合规范的 JS *运行时* 基本不可能（谢谢你，Locale），而没有生态的话，我们还不如直接跑 Lua
3. 扩展连运行时间的 1% 都占不到，所以我们其实不需要 JIT
4. 内嵌一个完整的 Py 运行时之后，我们还能保证 `eval` 工具开箱即用，而不是要求用户自己安装 py3，然后在我们发布的流程里永远没法指望它
5. Python 代码开箱就能审视自己的 AST。正是这一点让运行时那一章的 `@remote` 设计成为可能。

运行时那一章引入了 `@remote` 边界。Python 的自省能力和属性模型正是让这条边界用起来顺手的原因：SDK 可以审视一个函数、打包相关源码，并在沙箱运行时里执行它，而不必要求每位扩展作者手写一套 RPC。

自带运行时也让 `Eval` 成为一个可靠的内置工具，而不是只有在用户恰好装了兼容版本 Python 时才能用的功能。

## 结语

“可是为什么？”是开篇的问题。直接的回答是：上面每一章都对应着一个有几十年先例可循的软件门类：复制、沙箱、配置、调度、协议兼容、实时渲染，以及语言/运行时设计。

omp² 仍在对照这份文档构建之中，各部分的状态从已交付到仍在思考不等；但我们真诚感谢每一位试用过它的人，感谢你们与我们分享各种精彩的 omp 用法：从让它运营一座软件工厂，到让它在它自己所在的那部手机上给自己造一个相机 app。

是你们塑造了 omp，我们期待未来同样精彩！

---

## 附录 A：官方示例中的状态故障

状态那一章按类别总结了这些故障。本附录保留原始证据：源码链接、最小代码摘录和复现视频。

这一论断并非纸上谈兵。我们查看了 78 个官方扩展示例：60 个是无状态的；在 17 个带状态的示例里，只有两个是正确的。

#### 1\. 检查点在 `/fork` 能用上它之前就被清空了：`git-checkpoint.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/git-checkpoint.ts#L11-L51)：缺少持久的检查点所有权；`/fork` 在空闲时被调用，而此时 `agent_settled` 早已清空了唯一存放 stash 引用的 map。

```javascript
const checkpoints = new Map<string, string>();
// …
pi.on("agent_settled", async () => {
  checkpoints.clear();
});
```

[视频](https://stencil.so/blog/harness-playbook/bugs/git-checkpoint.mp4)

#### 2\. 树导航不会恢复状态：`plan-mode/index.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/plan-mode/index.ts#L340-L352)：缺少 `session_tree` 和 `getBranch()`；回退之后计划模式及其工具限制仍然生效，而恢复则可能让一条死分支的快照复活。

```javascript
const entries = ctx.sessionManager.getEntries();
const planModeEntry = entries
  .filter((e) => e.type === "custom" && e.customType === "plan-mode")
  .pop();
```

[视频](https://stencil.so/blog/harness-playbook/bugs/plan-mode.mp4)

#### 3\. 计数器数不清历史：`status-line.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/status-line.ts#L10-L23)：缺少分支推导；从第 3 轮回退到第 1 轮，下一轮却显示 4，而恢复后又从零开始数。

```javascript
let turnCount = 0;
// …
pi.on("turn_start", async (_event, ctx) => {
  turnCount++;
```

[视频](https://stencil.so/blog/harness-playbook/bugs/status-line.mp4)

#### 4\. 动态添加的工具挺过了回退，却在恢复后消失：`dynamic-tools.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/dynamic-tools.ts#L25-L33)：`/add-echo-tool echo_branch` 只写入活跃的扩展注册表；`/tree` 不会重启这个注册表，所以回退后工具还在，但 `--continue` 会新建一个注册表，工具就消失了。

```javascript
const registeredToolNames = new Set<string>();
// …
registeredToolNames.add(name);
pi.registerTool({
```

[视频](https://stencil.so/blog/harness-playbook/bugs/dynamic-tools.mp4)

#### 5\. 一份存档从被放弃的分支上回来了：`snake.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/snake.ts#L320-L328)：恢复逻辑会扫描整个会话文件；在分支 A 上存档，回退到存档之前，打开 `/snake`，那份死掉的存档就回来了。

```javascript
const entries = ctx.sessionManager.getEntries();
for (let i = entries.length - 1; i >= 0; i--) {
  const entry = entries[i];
  if (entry.type === "custom" && entry.customType === SNAKE_SAVE_TYPE) {
```

[视频](https://stencil.so/blog/harness-playbook/bugs/snake.mp4)

#### 6\. “最后一条消息”指的是文件里的最后一条：`bookmark.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/bookmark.ts#L19-L25)：缺少 `getBranch()`；回退之后，`/bookmark` 可能给一条位于被放弃分支上、用户根本看不到的助手消息打上标签。

```javascript
const entries = ctx.sessionManager.getEntries();
for (let i = entries.length - 1; i >= 0; i--) {
  const entry = entries[i];
  if (entry.type === "message" && entry.message.role === "assistant") {
```

[视频](https://stencil.so/blog/harness-playbook/bugs/bookmark.mp4)

#### 7\. 回退到发现之前，`Calculator` 仍处于激活状态：`kimi-deferred-tools.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/kimi-deferred-tools.ts#L47-L60)：`tool_search` 激活了 `Calculator`，但没有任何 `session_tree` 处理器重新推导激活的工具清单；导航到发现之前的某个点后，`Calculator` 仍然是激活的。

```javascript
const active = pi.getActiveTools();
const added = active.includes("Calculator") ? [] : ["Calculator"];
if (added.length > 0) pi.setActiveTools([...active, ...added]);
// Missing: session_tree → derive active tools from selected branch.
```

[视频](https://stencil.so/blog/harness-playbook/bugs/kimi-deferred-tools.mp4)

#### 8\. 切换会话会提交 worktree：`auto-commit-on-exit.ts`

[源码](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/auto-commit-on-exit.ts#L11-L42)：缺少一条仅限退出的边界；`/new`、`/resume` 和 `/fork` 都会触发 `session_shutdown`，进而把脏 worktree 暂存并提交。

```
pi.on("session_shutdown", async (_event, ctx) => {
  // …
  await pi.exec("git", ["add", "-A"]);
  await pi.exec("git", ["commit", "-m", commitMessage]);
});
```

[视频](https://stencil.so/blog/harness-playbook/bugs/auto-commit-on-exit.mp4)

#### 9\. 实时状态与恢复后的状态不一致：`tic-tac-toe.ts`

[恢复逻辑](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/tic-tac-toe.ts#L631-L645)；[用户落子](https://github.com/earendil-works/pi/blob/853a80d26c90a14c1886f0ebb8ffaae133ca2185/packages/coding-agent/examples/extensions/tic-tac-toe.ts#L802-L810)：重建时只接受工具结果，但用户落子是自定义条目；在 X 落子之后、O 落子之前崩溃，X 就消失了。

```
if (entry.type !== "message") continue;
if (msg.role !== "toolResult") continue;
// User moves take a different path:
pi.appendEntry(SAVE_TYPE, getBoardDetails());
```

[视频](https://stencil.so/blog/harness-playbook/bugs/tic-tac-toe.mp4)

## 附录 B：弹性推测槽（Elastic Speculative Slots）

界面那一章把协议和结论留在了主阅读路径里。本附录收录论文，以及用于检查对话记录不变量的完整 [TLA+](https://lamport.azurewebsites.net/tla/tla.html) 模型。

![弹性推测槽论文的第一页：一个经过形式化验证的渲染协议，用于把并发的流式输出块经由有界的终端视口送入仅追加的回滚缓冲区](https://stencil.so/blog/harness-playbook/elastic-slots-p1.png)

*“弹性推测槽”（Elastic Speculative Slots）论文：三层契约、安全性定理以及条件性进展结果，与下方的完整规约一一对应。· 点击可查看完整 PDF。*

ElasticSlots.tla — 完整规约

```typescript
---- MODULE ElasticSlots ----
\* =========================================================================
\* Elastic Speculative Slots: a formally verified rendering protocol for
\* streaming concurrent output blocks through a bounded terminal viewport
\* into append-only scrollback.
\*
\* Three decoupled layers, related by invariants (see ELASTIC_SLOTS2.tex):
\*   1. semantic block state   (phase/mode/want/final/emitted per block)
\*   2. logical history ledger (`history`: width-independent, exactly-once)
\*   3. physical native rows   (`native`: width-rendered, source-tagged)
\* =========================================================================
EXTENDS Naturals, Sequences, FiniteSets, TLC
\* Naturals: arithmetic; Sequences: <<>>/Len/SubSeq/\o; FiniteSets:
\* Cardinality/IsFiniteSet; TLC: model-checking utilities.

CONSTANTS N, H, MaxResizes, MaxLive, RowValues, SnapshotValues,
          NoFinal, Placeholder, Blank, OverflowMarker
\* N            : number of block identities (blocks are 1..N, in commit order)
\* H            : maximum viewport (live transcript) height, in rows
\* MaxResizes   : bound on resize events (keeps the state space finite)
\* MaxLive      : uncommitted-block count that constitutes "pressure"
\* RowValues    : finite row alphabet (what a semantic line of output "is")
\* SnapshotValues: finite universe of block contents (sequences of rows)
\* NoFinal      : sentinel "this block has no final snapshot yet"
\* Placeholder  : synthetic viewport row shown for an empty slot
\* Blank        : synthetic viewport row for unused screen space
\* OverflowMarker: synthetic viewport row summarizing hidden older blocks

ASSUME
    ∧ N ∈ ℕ \ {0}                                  \* at least one block
    ∧ H ∈ ℕ \ {0}                                  \* viewport can be nonempty
    ∧ MaxResizes ∈ ℕ                               \* zero resizes is allowed
    ∧ MaxLive ∈ ℕ \ {0}                            \* pressure threshold >= 1
    ∧ IsFiniteSet(RowValues)                           \* finite row alphabet
    ∧ RowValues ≠ {}                                   \* ... and nonempty
    ∧ IsFiniteSet(SnapshotValues)                      \* finite snapshot universe
    ∧ SnapshotValues ⊆ Seq(RowValues)          \* snapshots are row sequences
    ∧ ⟨⟩ ∈ SnapshotValues                          \* the empty snapshot exists
    ∧ (∃ snapshot ∈ SnapshotValues : Len(snapshot) = 1)  \* a length-1 snapshot exists
    ∧ (∃ snapshot ∈ SnapshotValues : Len(snapshot) > 1)  \* a longer one exists too
    ∧ NoFinal ∉ SnapshotValues                    \* sentinel distinct from real data
    ∧ Placeholder ∉ RowValues                     \* synthetic rows are not
    ∧ Blank ∉ RowValues                           \* ... confusable with
    ∧ OverflowMarker ∉ RowValues                  \* ... semantic rows,
    ∧ Placeholder ≠ Blank                              \* and are pairwise
    ∧ Placeholder ≠ OverflowMarker                     \* distinct from
    ∧ Blank ≠ OverflowMarker                           \* each other.

Blocks ≜ 1‥N                                          \* the block identities
ModelRows ≜ {"row-a", "row-b"}                         \* tiny concrete row alphabet for TLC
ModelSnapshots ≜                                       \* a richer snapshot universe (unused by the shipped cfg)
    {⟨⟩,                                              \* empty block
     ⟨"row-a"⟩,                                       \* one-liner
     ⟨"row-b"⟩,                                       \* one-liner, other row
     ⟨"row-a", "row-b"⟩,                              \* two distinct rows
     ⟨"row-b", "row-a"⟩,                              \* order matters
     ⟨"row-a", "row-b", "row-a"⟩}                     \* length three, with repeat
SmallModelSnapshots ≜ {⟨⟩, ⟨"row-a"⟩, ⟨"row-a", "row-b"⟩}  \* the cfg's universe: lengths 0, 1, 2

WidthValues ≜ {"Wide", "Narrow"}                       \* two-point abstraction of terminal width
ResizeModes ≜ {"Preserve", "Append", "Rebuild"}        \* policy chosen at a width-changing resize
ReplayModes ≜ {"None", "Append", "Rebuild"}            \* pending replay (None = no replay in flight)
BlockModes ≜ {"Undeclared", "Mutable", "AppendOnly"}   \* presentation contract, fixed at Create
Phases ≜ {"Absent", "Queued", "Active", "Finalized", "Committed"}  \* block lifecycle, monotone left-to-right
StopReasons ≜ {"Running", "Graceful", "Detach", "WriteFailure"}    \* why the host stopped (Running = it hasn't)
NativeSources ≜ {"Append", "Retire", "Replay", "Resize", "FailedWrite", "Exit"}  \* provenance tag on every native row
CellRows ≜ RowValues ∪ {Placeholder, Blank, OverflowMarker}     \* what a viewport cell may display
Cells ≜ [owner : 0‥N, row : CellRows]                 \* a viewport cell: owning block (0 = chrome) + row
TaggedRows ≜ [owner : Blocks, row : RowValues]         \* a ledger row: semantic, width-independent
NativeRows ≜ [source : NativeSources, owner : 0‥N, row : CellRows, width : WidthValues]
\* a native row: provenance source, owner, rendered row, and the width it was rendered at

SnapshotLengths ≜ {Len(snapshot) : snapshot ∈ SnapshotValues}  \* set of occurring snapshot lengths
MaxSnapshotLength ≜                                    \* L_max: the longest snapshot length
    CHOOSE maximum ∈ SnapshotLengths :                \* (CHOOSE is fine here: the maximum
        ∀ length ∈ SnapshotLengths : length ≤ maximum  \*  of a finite set is unique)
MaxFailureRows ≜ 2 * N * MaxSnapshotLength             \* K_max: upper bound on one physical write batch
                                                        \* (factor 2 = worst-case Narrow doubling)

BlankCell ≜ [owner ↦ 0, row ↦ Blank]               \* the unused-screen-space cell
OverflowCell ≜ [owner ↦ 0, row ↦ OverflowMarker]   \* the "N older blocks hidden" summary cell

\* -------------------------------------------------------------------------
\* State variables (one tuple entry per column of Table 1 in the paper).
\* -------------------------------------------------------------------------
VARIABLES c, phase, mode, want, final, emitted, alloc, target,
          history, native, width, height, resizes, epoch,
          replayMode, replayCursor, replayEnd, replayPartial,
          replayPrepared, replayCut,
          flush, shutdown, running, stopReason
\* c              : commit frontier -- blocks 1..c are committed (retired)
\* phase          : lifecycle phase per block
\* mode           : Mutable / AppendOnly contract per block
\* want           : current speculative snapshot per block
\* final          : frozen final snapshot per block (NoFinal until finalized)
\* emitted        : rows of the head block already streamed into history
\* alloc          : painted slot height per block (rows on screen now)
\* target         : requested slot height per block (animation target)
\* history        : the logical ledger (layer 2)
\* native         : the physical scrollback of the current epoch (layer 3)
\* width, height  : current terminal geometry
\* resizes        : how many resizes happened (bounded by MaxResizes)
\* epoch          : display epoch; Rebuild resets native and bumps this
\* replayMode     : pending replay policy (None / Append / Rebuild)
\* replayCursor   : first committed block to replay (invariantly 1 while replaying)
\* replayEnd      : last committed block to replay (= c at replay start)
\* replayPartial  : how many stable head rows to replay
\* replayPrepared : replay frame computed and cut fixed (gates the scheduler)
\* replayCut      : rows of the replay frame that must scroll into native
\* flush          : explicit "retire everything" request (never reset)
\* shutdown       : graceful shutdown initiated
\* running        : host still alive; every action requires it
\* stopReason     : why we stopped (Running while alive)

vars ≜ ⟨c, phase, mode, want, final, emitted, alloc, target,
          history, native, width, height, resizes, epoch,
          replayMode, replayCursor, replayEnd, replayPartial,
          replayPrepared, replayCut,
          flush, shutdown, running, stopReason⟩
\* the full variable tuple, used for stuttering ([Next]_vars) and UNCHANGED

Maximum(left, right) ≜ IF left ≥ right THEN left ELSE right  \* max of two naturals

\* -------------------------------------------------------------------------
\* Width rendering: the two-point abstraction of soft-wrap reflow.
\* -------------------------------------------------------------------------
RECURSIVE DoubleRows(_)
DoubleRows(snapshot) ≜                                 \* Narrow rendering:
    IF Len(snapshot) = 0 THEN ⟨⟩                      \* empty stays empty;
    ELSE ⟨Head(snapshot), Head(snapshot)⟩ ∘ DoubleRows(Tail(snapshot))
    \* every semantic row occupies TWO physical rows (models a wrapped line)

Render(snapshot, wx) ≜ IF wx = "Wide" THEN snapshot ELSE DoubleRows(snapshot)
\* rho_omega: Wide = identity, Narrow = row doubling; prefix-monotone by construction

Tag(i, snapshot) ≜                                     \* tg_i: stamp each row with its owner
    [j ∈ 1‥Len(snapshot) ↦ [owner ↦ i, row ↦ snapshot[j]]]

SnapshotSlice(snapshot, lo, hi) ≜                      \* s[lo..hi], empty when lo > hi
    IF lo > hi THEN ⟨⟩ ELSE SubSeq(snapshot, lo, hi)

TagSlice(i, snapshot, lo, hi) ≜ Tag(i, SnapshotSlice(snapshot, lo, hi))  \* owner-tagged slice

NativeTag(source, i, snapshot, wx) ≜                   \* ntg: render at width wx, then tag
    [j ∈ 1‥Len(Render(snapshot, wx)) ↦             \* one native row per RENDERED row
        [source ↦ source, owner ↦ i,                \* provenance + owner
         row ↦ Render(snapshot, wx)[j], width ↦ wx]]  \* rendered row + width it used
NativeTagSlice(source, i, snapshot, lo, hi, wx) ≜      \* native-tag a semantic slice
    NativeTag(source, i, SnapshotSlice(snapshot, lo, hi), wx)

NativeCells(source, cells, wx) ≜                       \* lift screen cells to native rows
    [j ∈ 1‥Len(cells) ↦                            \* (used when the emulator itself
        [source ↦ source, owner ↦ cells[j].owner,   \*  pushes viewport rows into
         row ↦ cells[j].row, width ↦ wx]]           \*  scrollback, e.g. on resize/exit)

PrefixOf(sequence, count) ≜ [j ∈ 1‥count ↦ sequence[j]]  \* first `count` elements

\* -------------------------------------------------------------------------
\* The logical ledger as a FUNCTION of state (invariant ECH says
\* `history` always equals CommittedRows(c, final) \o PartialHeadRows).
\* -------------------------------------------------------------------------
RECURSIVE CommittedRows(_, _)
CommittedRows(k, finals) ≜                             \* C(k): finals of blocks 1..k,
    IF k = 0 THEN ⟨⟩                                  \* tagged, concatenated in
    ELSE CommittedRows(k - 1, finals) ∘ Tag(k, finals[k])  \* block (= commit) order

RECURSIVE TaggedRange(_, _, _)
TaggedRange(lo, hi, finals) ≜                          \* tagged finals of blocks lo..hi
    IF lo > hi THEN ⟨⟩                                \* (empty range allowed)
    ELSE Tag(lo, finals[lo]) ∘ TaggedRange(lo + 1, hi, finals)

RECURSIVE NativeRange(_, _, _, _, _)
NativeRange(source, lo, hi, finals, wx) ≜              \* same, but width-rendered and
    IF lo > hi THEN ⟨⟩                                \* source-tagged for `native`
    ELSE NativeTag(source, lo, finals[lo], wx)
         ∘ NativeRange(source, lo + 1, hi, finals, wx)

RetirementRows(lo, hi, finals, firstEmitted) ≜         \* logical retirement batch:
    IF lo > hi THEN ⟨⟩                                \* head block lo contributes only
    ELSE TagSlice(lo, finals[lo], firstEmitted + 1, Len(finals[lo]))  \* its UNstreamed suffix,
         ∘ TaggedRange(lo + 1, hi, finals)             \* later blocks contribute in full

NativeRetirementRows(source, lo, hi, finals, firstEmitted, wx) ≜
    IF lo > hi THEN ⟨⟩                                \* physical twin of RetirementRows:
    ELSE NativeTagSlice(                                \* the same rows,
             source,                                    \* provenance-tagged
             lo,                                        \* (Retire on success,
             finals[lo],                                \*  FailedWrite on failure),
             firstEmitted + 1,                          \* starting after the already-
             Len(finals[lo]),                           \* streamed head prefix,
             wx                                         \* rendered at the current width
         )
         ∘ NativeRange(source, lo + 1, hi, finals, wx) \* then full later finals

FinalizedRange(lo, hi) ≜                               \* "blocks lo..hi are all Finalized"
    ∀ i ∈ lo‥hi : phase[i] = "Finalized"            \* (a retirement batch precondition)

Unemitted(snapshot, i, emission) ≜                     \* U_i(s): the part of s not yet
    IF mode[i] = "AppendOnly"                           \* streamed into history --
    THEN SnapshotSlice(snapshot, emission[i] + 1, Len(snapshot))  \* suffix for append-only,
    ELSE snapshot                                       \* everything for mutable blocks

\* -------------------------------------------------------------------------
\* Live-viewport geometry: who is presented, who is visible, how much
\* space is reserved. All operators take the ambient tuple explicitly so
\* that action guards can evaluate them at SUCCESSOR values.
\* -------------------------------------------------------------------------
Presented(ph, finals, emission, i, wx) ≜               \* block i occupies viewport iff
    ∨ ph[i] = "Active"                                 \* it is actively producing, or
    ∨ ∧ ph[i] = "Finalized"                           \* it is finalized AND still has
     ∧ Len(Render(Unemitted(finals[i], i, emission), wx)) > 0  \* unstreamed content to show

PresentedSet(ph, finals, emission, wx) ≜               \* the set of presented blocks
    {i ∈ Blocks : Presented(ph, finals, emission, i, wx)}
PresentedCount(ph, finals, emission, wx) ≜             \* pi: how many are presented
    Cardinality(PresentedSet(ph, finals, emission, wx))
Overflow(ph, finals, emission, wx, hx) ≜               \* ovf: more presented blocks
    PresentedCount(ph, finals, emission, wx) > hx       \* than viewport rows
SummaryRows(ph, finals, emission, wx, hx) ≜            \* sigma: one summary row is
    IF hx > 0 ∧ Overflow(ph, finals, emission, wx, hx) THEN 1 ELSE 0  \* shown iff overflowing (and h>0)

NewerPresented(ph, finals, emission, wx, i) ≜          \* how many presented blocks are
    Cardinality({                                       \* NEWER (higher index) than i --
        j ∈ Blocks :                                  \* used to privilege recency
            j > i ∧ Presented(ph, finals, emission, j, wx)
    })

VisiblePresented(ph, finals, emission, wx, hx, i) ≜    \* vis(i): presented AND, under
    ∧ Presented(ph, finals, emission, i, wx)           \* overflow, among the hx-1
    ∧ IF Overflow(ph, finals, emission, wx, hx)        \* newest presented blocks
       THEN ∧ hx > 0                                   \* (one row is sacrificed to
            ∧ NewerPresented(ph, finals, emission, wx, i) < hx - 1  \* the summary marker)
       ELSE TRUE                                        \* no overflow: presented = visible

RECURSIVE AllocationTotal(_, _)
AllocationTotal(al, i) ≜                               \* sum of painted heights,
    IF i > N THEN 0 ELSE al[i] + AllocationTotal(al, i + 1)  \* blocks i..N

RECURSIVE ReservationTotal(_, _, _)
ReservationTotal(al, requested, i) ≜                   \* Res: each block is charged
    IF i > N THEN 0                                     \* max(painted, requested) --
    ELSE Maximum(al[i], requested[i]) + ReservationTotal(al, requested, i + 1)
    \* growth pays up front, shrink keeps its old charge until painted

AllocationStateOK(al, requested, ph, finals, emission, wx, hx) ≜  \* A_OK: allocation admissibility
    ∧ al ∈ [Blocks → 0‥H]                          \* painted heights in range
    ∧ requested ∈ [Blocks → 0‥H]                   \* requested heights in range
    ∧ ∀ i ∈ Blocks :
           IF VisiblePresented(ph, finals, emission, wx, hx, i)
           THEN IF ph[i] = "Active"
                THEN ∧ al[i] ∈ 1‥H                  \* visible active: painted >= 1,
                     ∧ requested[i] ∈ 1‥H           \* target >= 1 (may differ: animating)
                ELSE ∧ al[i] ∈ 1‥H                  \* visible finalized: painted >= 1,
                     ∧ requested[i] = al[i]            \* and frozen (no more animation)
           ELSE ∧ al[i] = 0                            \* invisible blocks hold
                ∧ requested[i] = 0                     \* no space at all
    ∧ ReservationTotal(al, requested, 1)               \* reservation invariant:
       + SummaryRows(ph, finals, emission, wx, hx) ≤ hx  \* reservations + summary fit in h

CanonicalAllocation(ph, finals, emission, wx, hx) ≜    \* kappa: the safe default --
    [i ∈ Blocks ↦                                   \* one row per visible block,
        IF VisiblePresented(ph, finals, emission, wx, hx, i) THEN 1 ELSE 0]  \* zero otherwise

SnapshotHeight(ph, wants, finals, i, wx) ≜             \* dm(i): row demand of block i
    CASE ph[i] = "Active" →
             Maximum(1, Len(Render(Unemitted(wants[i], i, emitted), wx)))  \* live: >= 1 row
      □ ph[i] = "Queued" →
             Maximum(1, Len(Render(Unemitted(wants[i], i, emitted), wx)))  \* queued demands space too
      □ ph[i] = "Finalized" →
             Len(Render(Unemitted(finals[i], i, emitted), wx))  \* finalized: exactly its unstreamed rows
      □ OTHER → 0                                     \* absent/committed demand nothing

RECURSIVE FullRows(_, _, _, _, _)
FullRows(ph, wants, finals, wx, i) ≜                   \* D: total row demand of
    IF i > N THEN 0                                     \* blocks i..N
    ELSE SnapshotHeight(ph, wants, finals, i, wx)
         + FullRows(ph, wants, finals, wx, i + 1)

CreatedCount ≜ Cardinality({i ∈ Blocks : phase[i] ≠ "Absent"})  \* gamma: how many blocks exist

PartialHeadExists ≜                                    \* PH: the head block (c+1) has
    ∧ c < CreatedCount                                 \* been created,
    ∧ mode[c + 1] = "AppendOnly"                       \* is append-only,
    ∧ phase[c + 1] ∈ {"Active", "Finalized"}         \* is live,
    ∧ emitted[c + 1] > 0                               \* and has streamed some rows

PartialHeadRows ≜                                      \* A(c): the head's streamed
    IF PartialHeadExists                                \* prefix as tagged ledger rows
    THEN TagSlice(c + 1, want[c + 1], 1, emitted[c + 1])  \* (prefix of `want`, stable by
    ELSE ⟨⟩                                           \*  the append-only contract)

RowPressure ≜ FullRows(phase, want, final, width, 1) > height  \* demand exceeds viewport
Pressure ≜                                             \* pressure = row pressure OR
    ∨ RowPressure                                      \* too many uncommitted
    ∨ CreatedCount - c ≥ MaxLive                      \* blocks piling up
RetirementRequested ≜ flush ∨ Pressure                \* Req: when retirement may fire
Replaying ≜ replayMode ≠ "None"                        \* a replay is in flight

PreviewSource(i) ≜                                     \* what a slot displays:
    IF phase[i] = "Active"                              \* live blocks show their
    THEN Unemitted(want[i], i, emitted)                 \* unstreamed speculation,
    ELSE Unemitted(final[i], i, emitted)                \* others their unstreamed final

PreviewCell(i, snapshot) ≜                             \* the representative cell of a slot:
    LET rendered ≜ Render(snapshot, width) IN          \* render at current width;
    [owner ↦ i,
     row ↦ IF Len(rendered) = 0                       \* empty content shows the
             THEN Placeholder                           \* placeholder row, otherwise
             ELSE rendered[Len(rendered)]]              \* the LAST rendered row (tail view)

Repeat(value, count) ≜ [j ∈ 1‥count ↦ value]      \* value^count as a sequence
Slot(i, snapshot, allocation) ≜ Repeat(PreviewCell(i, snapshot), allocation)
\* a slot = its preview cell repeated alloc[i] times (abstracting the real tail window)

RECURSIVE PresentedCells(_)
PresentedCells(i) ≜                                    \* all slots, ascending block
    IF i > N THEN ⟨⟩                                  \* order (newest at the bottom,
    ELSE (IF alloc[i] = 0 THEN ⟨⟩ ELSE Slot(i, PreviewSource(i), alloc[i]))  \* next to the cursor);
         ∘ PresentedCells(i + 1)                       \* zero-alloc blocks contribute nothing

Screen ≜                                               \* Q: the whole viewport, top to bottom:
    Repeat(
        BlankCell,                                      \* blank filler first,
        height - AllocationTotal(alloc, 1) - SummaryRows(phase, final, emitted, width, height)
    )                                                   \* (exactly the unclaimed rows)
    ∘ (IF SummaryRows(phase, final, emitted, width, height) = 1
        THEN ⟨OverflowCell⟩                           \* then the overflow summary if any,
        ELSE ⟨⟩)
    ∘ PresentedCells(1)                                \* then the block slots

\* -------------------------------------------------------------------------
\* Replay geometry: what a width-changing resize must re-render.
\* -------------------------------------------------------------------------
ReplayRows ≜                                           \* R: the full replay frame --
    IF ¬Replaying
    THEN ⟨⟩                                           \* nothing when no replay pending
    ELSE NativeRange("Replay", replayCursor, replayEnd, final, width)  \* committed finals 1..c
         ∘ (IF replayPartial = 0                       \* re-rendered at the NEW width,
             THEN ⟨⟩                                  \* plus the head's already-
             ELSE NativeTagSlice(                       \* streamed stable prefix
                     "Replay",                          \* (if it had streamed rows
                     replayEnd + 1,                     \*  at resize time) --
                     want[replayEnd + 1],               \* prefix of want, immutable
                     1,                                 \* under the append-only
                     replayPartial,                     \* contract, so stable while
                     width                              \* the replay is in flight
                  ))

ReplayRoom ≜                                           \* how many blank rows the
    Cardinality({j ∈ 1‥height : Screen[j] = BlankCell})  \* viewport can absorb scroll-free

RequiredReplayCut ≜                                    \* cut*: replay rows that do NOT
    IF Len(ReplayRows) > ReplayRoom THEN Len(ReplayRows) - ReplayRoom ELSE 0
    \* fit in the blank region and must scroll into native scrollback

PreparedReplayTail ≜                                   \* the part painted bottom-first
    IF replayPrepared                                   \* into blank rows (no scroll);
    THEN SnapshotSlice(ReplayRows, replayCut + 1, Len(ReplayRows))  \* only meaningful once
    ELSE ⟨⟩                                           \* the frame is prepared

Prefix(left, right) ≜                                  \* left is a prefix of right
    ∧ Len(left) ≤ Len(right)                          \* (the partial order behind the
    ∧ ∀ j ∈ 1‥Len(left) : left[j] = right[j]       \*  append-only contract)

NoEarlierQueued(i) ≜ ∀ j ∈ 1‥(i - 1) : phase[j] ≠ "Queued"  \* FIFO admission guard

\* =========================================================================
\* Initial state: nothing created, full-height wide viewport, empty
\* histories, no replay, host running.
\* =========================================================================
Init ≜
    ∧ c = 0                                            \* nothing committed
    ∧ phase = [i ∈ Blocks ↦ "Absent"]              \* no block exists
    ∧ mode = [i ∈ Blocks ↦ "Undeclared"]           \* no contract chosen
    ∧ want = [i ∈ Blocks ↦ ⟨⟩]                   \* empty speculation
    ∧ final = [i ∈ Blocks ↦ NoFinal]               \* nothing finalized
    ∧ emitted = [i ∈ Blocks ↦ 0]                   \* nothing streamed
    ∧ alloc = [i ∈ Blocks ↦ 0]                     \* no slot painted
    ∧ target = [i ∈ Blocks ↦ 0]                    \* no slot requested
    ∧ history = ⟨⟩                                   \* empty ledger (= CommittedRows(0,...))
    ∧ native = ⟨⟩                                    \* empty scrollback
    ∧ width = "Wide"                                   \* initial geometry:
    ∧ height = H                                       \* wide, full height
    ∧ resizes = 0                                      \* no resizes yet
    ∧ epoch = 0                                        \* first display epoch
    ∧ replayMode = "None"                              \* no replay pending
    ∧ replayCursor = 0                                 \* replay window empty
    ∧ replayEnd = 0
    ∧ replayPartial = 0
    ∧ replayPrepared = FALSE                           \* no frame prepared
    ∧ replayCut = 0
    ∧ flush = FALSE                                    \* no flush requested
    ∧ shutdown = FALSE                                 \* not shutting down
    ∧ running = TRUE                                   \* host alive
    ∧ stopReason = "Running"                           \* ... and not stopped

\* =========================================================================
\* Actions. Every guard conjoins `running`; most also require ~shutdown.
\* =========================================================================

Create(declaration) ≜                                  \* a new block is declared
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* no new work during shutdown
    ∧ CreatedCount < N                                 \* an identity is still free
    ∧ phase[CreatedCount + 1] = "Absent"               \* blocks are created contiguously
    ∧ declaration ∈ {"Mutable", "AppendOnly"}        \* contract chosen now, forever
    ∧ phase' = [phase EXCEPT ![CreatedCount + 1] = "Queued"]  \* enters the queue
    ∧ mode' = [mode EXCEPT ![CreatedCount + 1] = declaration] \* contract recorded
    ∧ UNCHANGED ⟨c, want, final, emitted, alloc, target, history, native,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* pure bookkeeping: no paint, no history

Admit(i) ≜                                             \* a queued block gets a live slot
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ phase[i] = "Queued"                              \* must be waiting
    ∧ NoEarlierQueued(i)                               \* FIFO: no older block still queued
    ∧ LET newPhase ≜ [phase EXCEPT ![i] = "Active"]   \* candidate successor phase,
           newAlloc ≜ [alloc EXCEPT ![i] = 1]          \* with a fresh 1-row slot
           newTarget ≜ [target EXCEPT ![i] = 1]        \* painted and requested
       IN ∧ ¬Overflow(newPhase, final, emitted, width, height)  \* admission may NOT overflow --
          ∧ AllocationStateOK(newAlloc, newTarget, newPhase, final, emitted, width, height)
          \* ... and the new slot must fit the reservation invariant; otherwise the
          \* block simply stays queued (denied, not summarized)
          ∧ phase' = newPhase                          \* commit the candidate state
          ∧ alloc' = newAlloc
          ∧ target' = newTarget
    ∧ UNCHANGED ⟨c, mode, want, final, emitted, history, native, width, height,
                   resizes, epoch, replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* repaint only: histories untouched

Update(i, snapshot) ≜                                  \* speculation evolves
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ phase[i] ∈ {"Queued", "Active"}                \* only unfinalized blocks change
    ∧ (mode[i] = "Mutable" ∨ Prefix(want[i], snapshot))  \* THE append-only contract:
    \* mutable blocks may replace their content arbitrarily; append-only
    \* blocks may only extend it (old rows are immutable)
    ∧ snapshot ≠ want[i]                               \* no stuttering updates
    ∧ want' = [want EXCEPT ![i] = snapshot]            \* the only writer of speculation
    ∧ UNCHANGED ⟨c, phase, mode, final, emitted, alloc, target, history, native,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* repaint only

RequestAllocation(newTarget) ≜                         \* the app asks for new slot heights
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ AllocationStateOK(alloc, newTarget, phase, final, emitted, width, height)
    \* admissible against the CURRENT paint: max(painted, newly-requested)
    \* must fit, so every later animation frame is pre-paid (dominance)
    ∧ newTarget ≠ target                               \* no stuttering requests
    ∧ target' = newTarget                              \* targets change; paint doesn't yet
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, history, native,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* nothing visible happens yet

BridgeHeight(sampled, requested) ≜                     \* B(a,t): next painted height
    IF sampled < requested THEN requested               \* growth jumps straight to target;
    ELSE IF sampled > 2 ∧ requested = 1 THEN 2         \* a deep shrink (>2 -> 1) pauses at 2
    ELSE requested                                      \* all other shrinks are direct
    \* the 2-row bridge frame makes deep collapses read as contractions, not snaps

ApplyAllocation(i) ≜                                   \* one animation frame is painted
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ phase[i] = "Active"                              \* only active slots animate
    ∧ alloc[i] ≠ target[i]                             \* something to do
    ∧ LET nextHeight ≜ BridgeHeight(alloc[i], target[i])  \* bridged next height
           newAlloc ≜ [alloc EXCEPT ![i] = nextHeight]
       IN ∧ AllocationStateOK(newAlloc, target, phase, final, emitted, width, height)
          \* always satisfiable along a bridge: B never raises max(alloc, target)
          ∧ alloc' = newAlloc                          \* paint the frame
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, target, history, native,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* repaint only

FinalizeActive(i, snapshot) ≜                          \* a live block completes
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ phase[i] = "Active"                              \* it was producing
    ∧ (mode[i] = "Mutable" ∨ Prefix(want[i], snapshot))  \* final must honor the contract
    ∧ LET newPhase ≜ [phase EXCEPT ![i] = "Finalized"]
           newFinal ≜ [final EXCEPT ![i] = snapshot]   \* the final value, frozen forever
           newAlloc ≜ CanonicalAllocation(newPhase, newFinal, emitted, width, height)
       IN ∧ phase' = newPhase                          \* lifecycle advances
          ∧ want' = [want EXCEPT ![i] = snapshot]      \* want converges to final
          ∧ final' = newFinal                          \* (invariant: final = want)
          ∧ alloc' = newAlloc                          \* ALL slots collapse to canonical
          ∧ target' = newAlloc                         \* 1-row previews: finished content
    ∧ UNCHANGED ⟨c, mode, emitted, history, native, width, height,  \* no longer animates
                   resizes, epoch, replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* repaint only: nothing retires yet

FinalizeQueued(i, snapshot) ≜                          \* a block completes WITHOUT ever
    ∧ running                                          \* having held a slot (finished
    ∧ ¬shutdown                                        \* before space freed up)
    ∧ phase[i] = "Queued"                              \* straight from the queue
    ∧ (mode[i] = "Mutable" ∨ Prefix(want[i], snapshot))  \* same contract check
    ∧ LET newPhase ≜ [phase EXCEPT ![i] = "Finalized"]
           newWant ≜ [want EXCEPT ![i] = snapshot]
           newFinal ≜ [final EXCEPT ![i] = snapshot]
           newAlloc ≜ CanonicalAllocation(newPhase, newFinal, emitted, width, height)
       IN ∧ phase' = newPhase                          \* note: THIS transition may cause
          ∧ want' = newWant                            \* overflow (a hidden block becomes
          ∧ final' = newFinal                          \* presented) -- summarization, not
          ∧ alloc' = newAlloc                          \* denial, handles it here
          ∧ target' = newAlloc
    ∧ UNCHANGED ⟨c, mode, emitted, history, native, width, height,
                   resizes, epoch, replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* repaint only

AppendStable ≜                                         \* natural streaming: ONE stable row
    ∧ running                                          \* of the append-only HEAD block
    ∧ ¬shutdown                                        \* scrolls into both histories
    ∧ ¬Replaying                                       \* never interleaves with replay
    ∧ c < CreatedCount                                 \* a head block exists
    ∧ mode[c + 1] = "AppendOnly"                       \* only append-only blocks stream
    ∧ phase[c + 1] ∈ {"Active", "Finalized"}         \* and only while live
    ∧ RowPressure                                      \* only under ROW pressure: with
    \* room to spare, stable rows stay in the viewport (still repositionable)
    ∧ emitted[c + 1] < Len(want[c + 1])                \* a stable row remains to stream
    ∧ LET next ≜ emitted[c + 1] + 1                   \* index of the row to emit
           newEmitted ≜ [emitted EXCEPT ![c + 1] = next]
           newAlloc ≜ CanonicalAllocation(phase, final, newEmitted, width, height)
       IN ∧ history' = history ∘ TagSlice(c + 1, want[c + 1], next, next)  \* ledger += 1 semantic row
          ∧ native' =
                 native
                 ∘ NativeTagSlice("Append", c + 1, want[c + 1], next, next, width)
          \* native += the same row, rendered (1 or 2 physical rows), tagged Append
          ∧ emitted' = newEmitted                      \* the stable frontier advances
          ∧ alloc' = newAlloc                          \* layout recanonicalizes (the
          ∧ target' = newAlloc                         \* streamed row left the viewport)
    ∧ UNCHANGED ⟨c, phase, mode, want, final,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* frontier c itself does not move

CompleteAppendOnly ≜                                   \* the fully-streamed head commits
    ∧ running                                          \* host alive
    \* (deliberately NO ~shutdown: draining the head stays possible while
    \*  shutting down)
    ∧ ¬Replaying                                       \* never during replay
    ∧ c < CreatedCount                                 \* head exists
    ∧ mode[c + 1] = "AppendOnly"                       \* head is append-only
    ∧ phase[c + 1] = "Finalized"                       \* head is done
    ∧ emitted[c + 1] = Len(final[c + 1])               \* every row already streamed
    ∧ LET newPhase ≜ [phase EXCEPT ![c + 1] = "Committed"]
           newEmitted ≜ [emitted EXCEPT ![c + 1] = 0]  \* emitted counter retires with it
           newAlloc ≜ CanonicalAllocation(newPhase, final, newEmitted, width, height)
       IN ∧ c' = c + 1                                 \* frontier advances: PURE
          ∧ phase' = newPhase                          \* bookkeeping -- every row is
          ∧ emitted' = newEmitted                      \* already in both histories,
          ∧ alloc' = newAlloc                          \* so nothing is written
          ∧ target' = newAlloc
    ∧ UNCHANGED ⟨mode, want, final, history, native, width, height,
                   resizes, epoch, replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* note: history unchanged!

BeginFlush ≜                                           \* someone asks for full retirement
    ∧ running                                          \* host alive
    ∧ ¬flush                                           \* idempotent: set once,
    ∧ flush' = TRUE                                    \* never reset
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target,
                   history, native, width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   shutdown, running, stopReason⟩      \* a pure request: no effect yet

RetireSuccess(batchEnd) ≜                              \* in-order retirement of a batch
    ∧ running                                          \* host alive
    ∧ ¬Replaying                                       \* never during replay
    ∧ batchEnd ∈ (c + 1)‥N                          \* batch = blocks c+1 .. batchEnd
    ∧ FinalizedRange(c + 1, batchEnd)                  \* ... ALL of them finalized
    ∧ RetirementRequested                              \* only under flush or pressure
    ∧ history' =
           history ∘ RetirementRows(c + 1, batchEnd, final, emitted[c + 1])
    \* ledger += head's unstreamed suffix, then later finals in full
    \* (emitted[c+1] is the only possibly-nonzero emitted counter)
    ∧ native' =
           native
           ∘ NativeRetirementRows(                     \* native += the same rows,
                  "Retire",                             \* tagged Retire, rendered at
                  c + 1,                                \* the current width; realized
                  batchEnd,                             \* on a real terminal as ONE
                  final,                                \* streamed write (paper,
                  emitted[c + 1],                       \* Lemma "streaming
                  width                                 \* realization")
              )
    ∧ LET newPhase ≜ [i ∈ Blocks ↦
                            IF i ≤ batchEnd THEN "Committed" ELSE phase[i]]  \* batch commits
           newEmitted ≜ [i ∈ Blocks ↦
                              IF i ≤ batchEnd THEN 0 ELSE emitted[i]]  \* counters reset
           newAlloc ≜ CanonicalAllocation(newPhase, final, newEmitted, width, height)
       IN ∧ c' = batchEnd                              \* frontier jumps to batch end
          ∧ phase' = newPhase
          ∧ emitted' = newEmitted
          ∧ alloc' = newAlloc                          \* retired slots disappear;
          ∧ target' = newAlloc                         \* survivors recanonicalize
    ∧ UNCHANGED ⟨mode, want, final, width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown, running, stopReason⟩  \* finals themselves are untouched

RetireFailure(batchEnd, count) ≜                       \* the SAME write, torn partway:
    ∧ running                                          \* same enabling conditions
    ∧ ¬Replaying                                       \* as RetireSuccess ...
    ∧ batchEnd ∈ (c + 1)‥N
    ∧ FinalizedRange(c + 1, batchEnd)
    ∧ RetirementRequested
    ∧ LET rows ≜
              NativeRetirementRows(                     \* the batch that WOULD have
                  "FailedWrite",                        \* been written, tagged
                  c + 1,                                \* FailedWrite for forensics
                  batchEnd,
                  final,
                  emitted[c + 1],
                  width
              )
       IN ∧ count ∈ 0‥Len(rows)                     \* the terminal accepted `count`
          ∧ native' = native ∘ PrefixOf(rows, count)  \* rows: an arbitrary PREFIX --
          \* never reordered, never a row from outside the batch
    ∧ running' = FALSE                                 \* fail-stop: the host halts;
    ∧ stopReason' = "WriteFailure"                     \* no retry path exists, so
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target, history,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial, replayPrepared, replayCut, flush, shutdown⟩
    \* CRITICAL: c and history do NOT advance -- the ledger never lies about
    \* what committed, so duplication/reordering after failure is impossible

Resize(newWidth, newHeight, resizePolicy, pushed) ≜    \* terminal geometry changes
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* not during shutdown
    ∧ resizes < MaxResizes                             \* bounded (finite model)
    ∧ newWidth ∈ WidthValues                         \* new geometry and the
    ∧ newHeight ∈ 0‥H                               \* policy for native history
    ∧ resizePolicy ∈ ResizeModes
    ∧ newWidth ≠ width ∨ newHeight ≠ height           \* an actual change
    ∧ pushed ∈ 0‥Len(Screen)                        \* emulator may scroll 0..h top
    \* viewport rows into scrollback during the resize (e.g. height shrink)
    ∧ LET widthChanged ≜ newWidth ≠ width
           effectiveMode ≜ IF widthChanged THEN resizePolicy ELSE "Preserve"
           \* height-only resizes never replay: rendered rows are still valid
           pushedRows ≜ NativeCells("Resize", PrefixOf(Screen, pushed), width)
           \* rows pushed by the emulator, tagged Resize, at the OLD width
           beginReplay ≜ effectiveMode ≠ "Preserve" ∧ (c > 0 ∨ PartialHeadExists)
           \* replay only if there is committed/streamed content to re-render
           newPhase ≜ phase                            \* lifecycle is untouched
           newAlloc ≜ CanonicalAllocation(newPhase, final, emitted, newWidth, newHeight)
       IN ∧ width' = newWidth                          \* adopt the new geometry
          ∧ height' = newHeight
          ∧ resizes' = resizes + 1                     \* burn one resize budget
          ∧ alloc' = newAlloc                          \* layout recanonicalizes at
          ∧ target' = newAlloc                         \* the new geometry
          ∧ native' = IF effectiveMode = "Rebuild"
                        THEN ⟨⟩                       \* Rebuild: native display is wiped ...
                        ELSE native ∘ pushedRows       \* else: record what the emulator pushed
          ∧ epoch' = IF effectiveMode = "Rebuild" THEN epoch + 1 ELSE epoch
          \* ... and the display epoch increments (native monotonicity is epoch-scoped)
          ∧ replayMode' =
                 IF beginReplay THEN effectiveMode      \* start a replay,
                 ELSE IF Replaying THEN replayMode ELSE "None"  \* or keep/clear the old one
          ∧ replayCursor' =
                 IF beginReplay THEN 1                  \* replay window = committed
                 ELSE IF Replaying THEN replayCursor ELSE 0     \* blocks 1..c
          ∧ replayEnd' =
                 IF beginReplay THEN c
                 ELSE IF Replaying THEN replayEnd ELSE 0
          ∧ replayPartial' =
                 IF beginReplay
                 THEN IF PartialHeadExists THEN emitted[c + 1] ELSE 0  \* plus the streamed head prefix
                 ELSE IF Replaying THEN replayPartial ELSE 0
          ∧ replayPrepared' = FALSE                    \* ANY resize invalidates a
          ∧ replayCut' = 0                             \* previously prepared frame
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, history,
                   flush, shutdown, running, stopReason⟩
    \* resize logical-neutrality: ledger, frontier, and semantics never move

PrepareReplay ≜                                        \* compute the replay frame
    ∧ running                                          \* host alive
    ∧ Replaying                                        \* a replay is pending
    ∧ ¬replayPrepared                                  \* and not yet prepared
    ∧ replayPrepared' = TRUE                           \* freeze the frame NOW:
    ∧ replayCut' = RequiredReplayCut                   \* cut = rows that must scroll
    \* from here the scheduler gate (see Next) admits ONLY the two replay
    \* writes, so the sampled cut cannot be invalidated by interleaving
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target,
                   history, native, width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   flush, shutdown, running, stopReason⟩  \* pure computation: no write yet

ReplaySynchronousSuccess ≜                             \* the single buffered write lands
    ∧ running                                          \* host alive
    ∧ Replaying                                        \* replay pending
    ∧ replayPrepared                                   \* frame prepared (gate open)
    ∧ native' = native ∘ PrefixOf(ReplayRows, replayCut)  \* exactly `cut` rows scroll into
    \* native; the tail was painted into blank rows (no scroll, no history)
    ∧ replayMode' = "None"                             \* replay fully drains:
    ∧ replayCursor' = 0                                \* all replay state returns
    ∧ replayEnd' = 0                                   \* to its idle shape
    ∧ replayPartial' = 0
    ∧ replayPrepared' = FALSE
    ∧ replayCut' = 0
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target,
                   history, width, height, resizes, epoch,
                   flush, shutdown, running, stopReason⟩  \* logically neutral: ledger untouched

ReplaySynchronousFailure(count) ≜                      \* the same write, torn partway
    ∧ running                                          \* host alive
    ∧ Replaying                                        \* replay pending
    ∧ replayPrepared                                   \* frame prepared
    ∧ count ∈ 0‥replayCut                           \* an arbitrary prefix of the
    ∧ native' = native ∘ PrefixOf(ReplayRows, count)  \* scrolled portion landed
    ∧ running' = FALSE                                 \* fail-stop, as with
    ∧ stopReason' = "WriteFailure"                     \* RetireFailure: halt, no retry
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target, history,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   flush, shutdown⟩                    \* ledger and frontier still truthful

BeginGracefulShutdown ≜                                \* wind-down begins
    ∧ running                                          \* host alive
    ∧ ¬shutdown                                        \* only once
    ∧ LET newPhase ≜ [i ∈ Blocks ↦
                            IF phase[i] = "Absent" THEN "Absent"     \* never-created stay absent;
                            ELSE IF i ≤ c THEN "Committed" ELSE "Finalized"]  \* all live work freezes
           newFinal ≜ [i ∈ Blocks ↦
                            IF phase[i] = "Absent" THEN NoFinal      \* absent: still no final;
                            ELSE IF i ≤ c ∨ phase[i] = "Finalized"
                            THEN final[i]               \* already-frozen finals kept;
                            ELSE want[i]]               \* queued/active freeze AT their
           newAlloc ≜ CanonicalAllocation(newPhase, newFinal, emitted, width, height)
       IN ∧ phase' = newPhase                          \* current speculation (f := w)
          ∧ final' = newFinal
          ∧ alloc' = newAlloc                          \* layout collapses to canonical
          ∧ target' = newAlloc
    ∧ flush' = TRUE                                    \* permanent flush: everything
    ∧ shutdown' = TRUE                                 \* must drain, then exit
    ∧ UNCHANGED ⟨c, mode, want, emitted, history, native, width, height,
                   resizes, epoch, replayMode, replayCursor, replayEnd, replayPartial,
                   replayPrepared, replayCut,
                   running, stopReason⟩                \* nothing retires in this step itself

GracefulExit(push) ≜                                   \* clean exit after full drain
    ∧ running                                          \* host alive
    ∧ shutdown                                         \* shutdown was initiated,
    ∧ ¬Replaying                                       \* replay has drained,
    ∧ c = CreatedCount                                 \* and EVERY block committed
    ∧ push ∈ 0‥1                                    \* optionally scroll one last row
    ∧ push = 0 ∨ height > 0                           \* (only if a viewport row exists)
    ∧ running' = FALSE                                 \* host stops
    ∧ stopReason' = "Graceful"                         \* ... cleanly
    ∧ native' = IF push = 0
                 THEN native                            \* either no final scroll, or the
                 ELSE native ∘ NativeCells("Exit", ⟨Screen[1]⟩, width)
                 \* top viewport row scrolls out (restoring the shell prompt),
                 \* tagged Exit
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target, history,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial, replayPrepared, replayCut, flush, shutdown⟩

DetachExit(push) ≜                                     \* abandon ship: exit NOW,
    ∧ running                                          \* uncommitted work is dropped
    ∧ ¬shutdown                                        \* (a detach, not a shutdown)
    ∧ push ∈ 0‥1                                    \* same optional final scroll
    ∧ push = 0 ∨ height > 0
    ∧ running' = FALSE                                 \* host stops
    ∧ stopReason' = "Detach"
    ∧ native' = IF push = 0
                 THEN native
                 ELSE native ∘ NativeCells("Exit", ⟨Screen[1]⟩, width)
    ∧ UNCHANGED ⟨c, phase, mode, want, final, emitted, alloc, target, history,
                   width, height, resizes, epoch,
                   replayMode, replayCursor, replayEnd, replayPartial, replayPrepared, replayCut, flush, shutdown⟩
    \* ECH guarantees `history` holds exactly the committed content at detach

\* -------------------------------------------------------------------------
\* Existentially closed action wrappers (for fairness and Next).
\* -------------------------------------------------------------------------
RetireSuccessAction ≜ ∃ batchEnd ∈ Blocks : RetireSuccess(batchEnd)  \* some batch retires
RetireFailureAction ≜                                  \* some batch write fails at
    ∃ batchEnd ∈ Blocks :                            \* some prefix length
        ∃ count ∈ 0‥MaxFailureRows : RetireFailure(batchEnd, count)
ReplaySynchronousFailureAction ≜                       \* replay write fails at some
    ∃ count ∈ 0‥MaxFailureRows : ReplaySynchronousFailure(count)  \* prefix length

\* -------------------------------------------------------------------------
\* The scheduler gate: once a replay frame is prepared, the ONLY possible
\* steps are the replay write landing or failing. This is what the word
\* "synchronous" means, and it is what keeps replayCut = RequiredReplayCut
\* stable (nothing may repaint in between).
\* -------------------------------------------------------------------------
Next ≜
    IF replayPrepared
    THEN ReplaySynchronousSuccess ∨ ReplaySynchronousFailureAction  \* gate closed: write or die
    ELSE ∨ ∃ declaration ∈ {"Mutable", "AppendOnly"} : Create(declaration)  \* gate open:
         ∨ ∃ i ∈ Blocks : Admit(i)                                          \* any protocol
         ∨ ∃ i ∈ Blocks, snapshot ∈ SnapshotValues : Update(i, snapshot)  \* step may fire
         ∨ ∃ newTarget ∈ [Blocks → 0‥H] : RequestAllocation(newTarget)
         ∨ ∃ i ∈ Blocks : ApplyAllocation(i)
         ∨ ∃ i ∈ Blocks, snapshot ∈ SnapshotValues : FinalizeActive(i, snapshot)
         ∨ ∃ i ∈ Blocks, snapshot ∈ SnapshotValues : FinalizeQueued(i, snapshot)
         ∨ AppendStable
         ∨ CompleteAppendOnly
         ∨ BeginFlush
         ∨ RetireSuccessAction
         ∨ RetireFailureAction
         ∨ ∃ newWidth ∈ WidthValues, newHeight ∈ 0‥H,
               resizePolicy ∈ ResizeModes, pushed ∈ 0‥H :
                Resize(newWidth, newHeight, resizePolicy, pushed)
         ∨ PrepareReplay
         ∨ BeginGracefulShutdown
         ∨ ∃ push ∈ 0‥1 : GracefulExit(push)
         ∨ ∃ push ∈ 0‥1 : DetachExit(push)

Spec ≜
    ∧ Init                                             \* start in the initial state,
    ∧ □[Next]_vars                                    \* take Next steps (or stutter),
    ∧ WF_vars(RetireSuccessAction)                     \* and don't ignore forever:
    ∧ WF_vars(PrepareReplay)                           \* retirement, replay preparation,
    ∧ WF_vars(ReplaySynchronousSuccess)                \* the replay write,
    ∧ WF_vars(AppendStable)                            \* head streaming,
    ∧ WF_vars(CompleteAppendOnly)                      \* and head commitment.
    \* Weak fairness: an action enabled forever is eventually taken. Failures
    \* and exits are NOT fair -- they may happen, but are never forced.

\* =========================================================================
\* Invariants (checked by TLC in every reachable state).
\* =========================================================================

TypeOK ≜                                               \* T: every variable in range
    ∧ c ∈ 0‥N                                       \* frontier within block ids
    ∧ phase ∈ [Blocks → Phases]                     \* valid phase per block
    ∧ mode ∈ [Blocks → BlockModes]                  \* valid mode per block
    ∧ want ∈ [Blocks → SnapshotValues]              \* speculation from the universe
    ∧ final ∈ [Blocks → SnapshotValues ∪ {NoFinal}]  \* final or the sentinel
    ∧ emitted ∈ [Blocks → 0‥MaxSnapshotLength]     \* emitted counter bounded
    ∧ alloc ∈ [Blocks → 0‥H]                       \* painted heights bounded
    ∧ target ∈ [Blocks → 0‥H]                      \* requested heights bounded
    ∧ history ∈ Seq(TaggedRows)                      \* ledger rows well-formed
    ∧ native ∈ Seq(NativeRows)                       \* native rows well-formed
    ∧ width ∈ WidthValues                            \* geometry in range
    ∧ height ∈ 0‥H
    ∧ resizes ∈ 0‥MaxResizes                        \* resize budget respected
    ∧ epoch ∈ 0‥MaxResizes                          \* epochs only at resizes
    ∧ replayMode ∈ ReplayModes                       \* replay state in range
    ∧ replayCursor ∈ 0‥(N + 1)                      \* (loose bound; really 0 or 1)
    ∧ replayEnd ∈ 0‥N
    ∧ replayPartial ∈ 0‥MaxSnapshotLength
    ∧ replayPrepared ∈ BOOLEAN
    ∧ replayCut ∈ 0‥MaxFailureRows                  \* cut bounded by max batch size
    ∧ flush ∈ BOOLEAN
    ∧ shutdown ∈ BOOLEAN
    ∧ running ∈ BOOLEAN
    ∧ stopReason ∈ StopReasons

LifecycleShape ≜                                       \* LS: blocks form three bands --
    ∧ c ≤ CreatedCount                                \* can't commit the uncreated
    ∧ ∀ i ∈ 1‥c :                                  \* band 1: 1..c
           ∧ phase[i] = "Committed"                    \* all committed,
           ∧ mode[i] ∈ {"Mutable", "AppendOnly"}     \* with a declared mode
    ∧ ∀ i ∈ (c + 1)‥CreatedCount :                 \* band 2: live blocks
           ∧ phase[i] ∈ {"Queued", "Active", "Finalized"}
           ∧ mode[i] ∈ {"Mutable", "AppendOnly"}
    ∧ ∀ i ∈ (CreatedCount + 1)‥N :                 \* band 3: not yet created
           ∧ phase[i] = "Absent"
           ∧ mode[i] = "Undeclared"

SnapshotDiscipline ≜                                   \* SD: finals exist exactly for
    ∀ i ∈ Blocks :                                   \* finalized/committed blocks,
        IF phase[i] ∈ {"Finalized", "Committed"}
        THEN ∧ final[i] ∈ SnapshotValues             \* are real snapshots,
             ∧ final[i] = want[i]                      \* and equal the last speculation
        ELSE final[i] = NoFinal                         \* everyone else: the sentinel

EmissionDiscipline ≜                                   \* ED: streaming is head-only --
    ∧ ∀ i ∈ Blocks :
           ∧ emitted[i] ≤ Len(want[i])                \* never emitted more than exists
           ∧ (mode[i] ≠ "AppendOnly" ⇒ emitted[i] = 0)  \* mutable blocks never stream
           ∧ (emitted[i] > 0 ⇒
                  ∧ i = c + 1                          \* only the HEAD may have
                  ∧ phase[i] ∈ {"Active", "Finalized"})  \* streamed rows, and only live
    ∧ (PartialHeadExists ⇒ emitted[c + 1] ≤ Len(want[c + 1]))  \* (redundant safety belt)

Capacity ≜ AllocationStateOK(alloc, target, phase, final, emitted, width, height)
\* CAP: the reservation invariant holds of the ACTUAL alloc/target at all times

ExactCommittedHistory ≜ history = CommittedRows(c, final) ∘ PartialHeadRows
\* ECH, the central equation: the ledger IS the committed finals in block
\* order, plus the head's streamed prefix -- no dupes, no gaps, no reorders

NoPrematureHistory ≜                                   \* every ledger row is owned by
    ∀ j ∈ 1‥Len(history) :
        LET owner ≜ history[j].owner IN
        ∨ ∧ owner ∈ 1‥c                            \* a committed block, or
         ∧ phase[owner] = "Committed"
        ∨ ∧ PartialHeadExists                         \* the streaming head --
         ∧ owner = c + 1                              \* speculation NEVER leaks

ScreenCapacity ≜                                       \* the screen is exactly right:
    ∧ Screen ∈ Seq(Cells)                            \* well-formed cells,
    ∧ Len(Screen) = height                             \* exactly `height` of them,
    ∧ ∀ i ∈ Blocks :
           Cardinality({j ∈ 1‥height : Screen[j].owner = i}) = alloc[i]  \* each block owns alloc[i] rows,
    ∧ Cardinality({j ∈ 1‥height : Screen[j] = OverflowCell})
       = SummaryRows(phase, final, emitted, width, height)  \* the summary row appears iff overflowing,
    ∧ Cardinality({j ∈ 1‥height : Screen[j] = BlankCell})
       = height - AllocationTotal(alloc, 1)
         - SummaryRows(phase, final, emitted, width, height)  \* the rest is blank -- accounts balance

ReplayShape ≜                                          \* RS: replay bookkeeping is sane
    ∧ (replayMode = "None" ⇒                          \* idle: all replay state zeroed
           ∧ replayCursor = 0
           ∧ replayEnd = 0
                     ∧ replayPartial = 0
          ∧ ¬replayPrepared
          ∧ replayCut = 0)
    ∧ (replayMode ≠ "None" ⇒                          \* in flight: window is 1..replayEnd
                     ∧ replayCursor = 1
           ∧ replayEnd ∈ 0‥c                        \* over COMMITTED blocks only,
                     ∧ replayPartial ≤ MaxSnapshotLength
          ∧ IF replayPrepared
             THEN ∧ replayCut = RequiredReplayCut      \* prepared: the sampled cut is
                  ∧ Len(PreparedReplayTail) ≤ ReplayRoom  \* still exact (the gate!) and
             ELSE replayCut = 0)                        \* the tail fits the blank region

NativeSourceSafety ≜                                   \* NSS: provenance never lies --
    ∀ j ∈ 1‥Len(native) :
        LET owner ≜ native[j].owner IN
        ∧ (native[j].source = "Retire" ⇒              \* Retire rows: from blocks that
               ∧ owner ∈ 1‥c                        \* really are committed
               ∧ phase[owner] = "Committed")
        ∧ (native[j].source ∈ {"Append", "Replay"} ⇒  \* streamed/replayed rows: from
               ∧ owner ∈ Blocks                        \* committed blocks or the
               ∧ (∨ owner ∈ 1‥c                      \* append-only head -- never
                  ∨ ∧ owner = c + 1                    \* from mutable speculation
                    ∧ mode[owner] = "AppendOnly"))
        ∧ (native[j].source = "FailedWrite" ⇒ stopReason = "WriteFailure")  \* failure rows only after failing
        ∧ (native[j].source = "Exit" ⇒ ¬running)      \* exit rows only after exiting

\* =========================================================================
\* Temporal (action and liveness) properties.
\* =========================================================================

HistoryExtension ≜ Prefix(history, history')           \* one step never rewrites the ledger
HistoryMonotonicity ≜ □[HistoryExtension]_vars        \* ... in ANY step: append-only forever

NativeEpochStep ≜                                      \* per step, native either
    IF epoch' = epoch
    THEN Prefix(native, native')                        \* grows at the end (same epoch)
    ELSE ∧ epoch' = epoch + 1                          \* or is wiped exactly when the
         ∧ native' = ⟨⟩                              \* epoch increments (Rebuild)
NativeEpochDiscipline ≜ □[NativeEpochStep]_vars       \* holds of every step

FinalsStayFixed ≜                                      \* finals are immutable:
    ∀ i ∈ Blocks :
        phase[i] ∈ {"Finalized", "Committed"} ⇒ final'[i] = final[i]
FinalImmutability ≜ □[FinalsStayFixed]_vars           \* once frozen, frozen forever

AppendOnlyPrefixStep ≜                                 \* the append-only contract as
    ∀ i ∈ Blocks :                                   \* an action property:
        (mode[i] = "AppendOnly" ∧ phase[i] ∈ {"Queued", "Active"})
        ⇒ Prefix(want[i], want'[i])                    \* want only ever extends
AppendOnlyMonotonicity ≜ □[AppendOnlyPrefixStep]_vars

ResizeKeepsLogicalHistoryStep ≜                        \* resize logical-neutrality:
    (width' ≠ width ∨ height' ≠ height) ⇒             \* a geometry change moves
        ∧ history' = history                           \* NONE of the semantic state --
        ∧ c' = c                                       \* not the ledger, not the
        ∧ mode' = mode                                 \* frontier, not modes,
        ∧ want' = want                                 \* speculation,
        ∧ final' = final                               \* finals,
        ∧ emitted' = emitted                           \* or streamed counters
ResizeKeepsLogicalHistory ≜ □[ResizeKeepsLogicalHistoryStep]_vars

FailedWriteStops ≜ □(                                 \* fail-stop: a write failure
    stopReason = "WriteFailure" ⇒ ¬running             \* and a live host never coexist
)

StoppedStep ≜ ¬running ⇒ UNCHANGED vars               \* a stopped host is frozen:
StoppedQuiescence ≜ □[StoppedStep]_vars               \* every later step stutters

AllFinalized ≜                                         \* every created block is done
    ∀ i ∈ 1‥CreatedCount : phase[i] ∈ {"Finalized", "Committed"}
AllCommitted ≜                                         \* everything retired, and the
    ∧ c = CreatedCount                                 \* ledger is exactly the
    ∧ history = CommittedRows(c, final)                \* committed finals

FlushLiveness ≜                                        \* drain guarantee: finalized +
    (AllFinalized ∧ flush ∧ shutdown ∧ running ∧ ¬Replaying)  \* flushing + shutting down
    ↝ (AllCommitted ∨ ¬running)                       \* eventually fully commits (or halts)

ReplayLiveness ≜ (Replaying ∧ running) ↝ (¬Replaying ∨ ¬running)
\* every replay eventually drains (or the host halts trying)

QueuedDemand ≜ ∃ i ∈ Blocks : phase[i] = "Queued"   \* someone is waiting for space
QueuedPressureRetirement ≜                             \* pressure + queued demand
    ∀ i ∈ Blocks :                                   \* eventually sweeps a finalized
        (∧ running                                     \* head block into history:
         ∧ ¬Replaying
         ∧ c = i - 1                                   \* i is the head,
         ∧ phase[i] = "Finalized"                      \* it is done,
         ∧ Pressure                                    \* space is scarce,
         ∧ QueuedDemand)                               \* and someone needs it
        ↝ (c ≥ i ∨ ¬running)                         \* => i eventually commits (or halt)
    \* NB: this needs MaxLive small enough that queued demand implies
    \* PERSISTENT count pressure; pure row pressure alone can evaporate
    \* (see the paper's sharpness remark)

====
```
