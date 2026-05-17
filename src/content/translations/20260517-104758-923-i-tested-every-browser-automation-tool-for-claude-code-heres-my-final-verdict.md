---
title: "我把 Claude Code 能用的浏览器自动化工具全试了一遍 —— 这是我的最终判决"
originalTitle: "I Tested Every Browser Automation Tool for Claude Code — Here's My Final Verdict"
date: 2026-05-17
originalUrl: https://dev.to/minatoplanb/i-tested-every-browser-automation-tool-for-claude-code-heres-my-final-verdict-3hb7
lang: zh
---

我每天用 Claude Code 12 个小时以上。

一个住在终端里的 AI 是没有眼睛的。它看不到网页，点不动按钮，填不了表单，甚至无法在部署完成后确认一个页面到底长什么样。

**一个无法访问浏览器的 AI，就像一个尝不到自己做的菜的厨师。**

所以从 2026 年 2 月到 3 月，我把 Claude Code 能用上的浏览器自动化工具全部测试了一遍：Chrome DevTools MCP、Claude in Chrome 扩展、WebFetch、agent-browser、PinchTab、browser-use。

老实说，我必须把它们全部试一遍，才能下结论。

这篇文章，就是这段旅程和最终判决的记录。

---

Claude Code 跑在终端里。它能读写文件、执行命令、管理 Git —— 这些都没问题。

**但它看不到 Web。**

| 任务 | 仅终端 | 配合浏览器 |
| --- | --- | --- |
| 部署后验证 | 翻日志，靠猜 | **直接看到真实页面** |
| 读 Twitter/Instagram 帖子 | 不可能 | **抽取文本** |
| 测试 Web 应用 | 只能 curl API | **点按钮并验证** |
| 填表单（求职申请等） | 不可能 | **自动填写** |
| 截图 | 不可能 | **截屏并视觉确认** |
| 访问需要登录的页面 | 不可能 | **使用 cookie** |

你可能会想：「日志够用了吧。」但当你每天用它 12 个小时，**没有眼睛的挫败感会以惊人的速度累积起来。**

---

我最先尝试的是官方方案。

用 `--remote-debugging-port=9222` 参数启动 Chrome，然后在 Claude Code 里通过 MCP server 控制它。这是 Chrome DevTools 官方团队做的。

**理论上完美。实际中残酷。**

| 问题 | 详情 |
| --- | --- |
| Windows 上的 `npx` | 跑不起来。需要 `cmd /c` 包一层 |
| 独立的 profile | 启动的是一个调试用 Chrome。没有 cookie，没有登录态，所有账号都要重新登 |
| 上下文消耗 | MCP JSON 负载巨大。单页 10,000+ tokens |
| 文本输入 bug | `fill` 工具**会吞掉第一个字符** |
| 多行文本 | 完全坏掉 |
| 启动开销 | 每次都要关掉 Chrome，再带着调试参数重新启动 |

**当你每天用 Claude Code 12 个小时，每个 session 都要带特殊参数重启一次 Chrome，这就是酷刑。**

---

我试了 v1.0.54 Beta。

它以 Chrome 扩展的形式运行，所以**会用你真实的浏览器 profile**。cookie 和登录会话直接继承过来。安装就是装个扩展。

**想法很好。质量是 Beta。**

| 优点 | 缺点 |
| --- | --- |
| 用真实的浏览器 cookie | 会话中途随机掉线 |
| 零配置 | 文本输入 bug 仍然存在 |
| 用起来直观 | 多行文本会坏掉 |

如果能稳定下来，它会很棒。但截至 2026 年 2 月，它还没到可用于生产的程度。

---

「也许某个现成的内置工具能搞定？」

Claude Code 有个内置工具叫 `WebFetch`。给它一个 URL，它就抓回 HTML。

**对静态文档页面来说，它工作得不错。**

**对社交媒体来说，它是地狱。**

我试着用 WebFetch 读 Instagram，结果拿到一堆 CSS 和 JavaScript 垃圾，几乎没有可用的文字。Twitter 也一样。任何依赖动态渲染的页面，都是彻底失败。

我反复告诉 Claude「**别用 WebFetch 看 SNS**」，跨多个 session 反复说。

**用 WebFetch 看 Instagram，就像用微波炉烤牛排。**

---

Vercel Labs 出品。Rust CLI + Playwright 后端。

**这是我第一次看到光。**

```
npm install -g agent-browser
agent-browser install
```

<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-on"><title>Enter fullscreen mode</title> <path d="M16 3h6v6h-2V5h-4V3zM2 3h6v2H4v4H2V3zm18 16v-4h2v6h-6v-2h4zM4 19h4v2H2v-6h2v4z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-off"><title>Exit fullscreen mode</title><path d="M18 7h4v2h-6V3h2v4zM8 9H2V7h4V3h2v6zm10 8v4h-2v-6h6v2h-4zM8 15v6H6v-4H2v-2h6z"></path></svg>

上下文消耗比 Chrome DevTools MCP **降低了 93%**。它输出的不是笨重的 MCP JSON，而是紧凑的文本。通过 shell 命令操作。

```
agent-browser open https://example.com
agent-browser snapshot -i
agent-browser click @e1
agent-browser close
```

<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-on"><title>Enter fullscreen mode</title> <path d="M16 3h6v6h-2V5h-4V3zM2 3h6v2H4v4H2V3zm18 16v-4h2v6h-6v-2h4zM4 19h4v2H2v-6h2v4z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-off"><title>Exit fullscreen mode</title><path d="M18 7h4v2h-6V3h2v4zM8 9H2V7h4V3h2v6zm10 8v4h-2v-6h6v2h-4zM8 15v6H6v-4H2v-2h6z"></path></svg>

有 Auth Vault 用来保存凭据，有网络 mock，有视觉 diff。

但在 Windows 上不太顺。

Rust 的 `canonicalize()` 会生成 `\\?\` UNC 路径，会把 Node.js 弄崩。你得设置 `AGENT_BROWSER_HOME` 环境变量来绕过。

我用它当主力工具用了一阵子，但还是有些不爽：

-   每页 3,000-5,000 tokens。够轻，但还可以更轻
-   每次都会启动 Chromium。cookie 不在多个 session 之间持久化（Auth Vault 有所帮助，但增加了摩擦）
-   抽取 SNS 文本仍然太重

---

PinchTab 改变了我对浏览器自动化的标准。

它以本地 HTTP server 形式运行，使用 Chrome 的无障碍树来解析页面。

**单页约 800 tokens。**

对比 agent-browser 的 3,000-5,000，轻了好几倍；对比 Chrome DevTools MCP 的 10,000+，这是 **12 倍的差距**。

```
# Headless 模式（后台守护进程）
pinchtab &

# Headed 模式（可以看到浏览器）
BRIDGE_HEADLESS=false pinchtab &
```

<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-on"><title>Enter fullscreen mode</title> <path d="M16 3h6v6h-2V5h-4V3zM2 3h6v2H4v4H2V3zm18 16v-4h2v6h-6v-2h4zM4 19h4v2H2v-6h2v4z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-off"><title>Exit fullscreen mode</title><path d="M18 7h4v2h-6V3h2v4zM8 9H2V7h4V3h2v6zm10 8v4h-2v-6h6v2h-4zM8 15v6H6v-4H2v-2h6z"></path></svg>

启动一次，就在整个 session 期间一直跑着。HTTP server 监听 9867 端口。不需要重启。

```
pinchtab nav https://example.com
sleep 3
pinchtab snap -i -c    # 紧凑视图，列出可交互元素
pinchtab click e5       # 点击元素 e5
pinchtab type e12 "text"  # 在元素 e12 中输入文字
```

<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-on"><title>Enter fullscreen mode</title> <path d="M16 3h6v6h-2V5h-4V3zM2 3h6v2H4v4H2V3zm18 16v-4h2v6h-6v-2h4zM4 19h4v2H2v-6h2v4z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-off"><title>Exit fullscreen mode</title><path d="M18 7h4v2h-6V3h2v4zM8 9H2V7h4V3h2v6zm10 8v4h-2v-6h6v2h-4zM8 15v6H6v-4H2v-2h6z"></path></svg>

| 方法 | Tokens | 适用场景 |
| --- | --- | --- |
| `pinchtab text` | **~800** | 文本抽取（SNS、文章） |
| `pinchtab snap -i -c` | ~2,000 | 按钮/链接交互 |
| `pinchtab snap --diff` | 仅 diff | 多步顺序操作 |
| `pinchtab snap`（完整） | ~10,500 | 整页理解 |
| `pinchtab ss`（截图） | ~2,000（Vision） | 视觉验证 |

**用 `pinchtab text` 看 SNS 只要 800 tokens。** 这一点改变了一切。

读 Twitter 帖子，检查 Instagram 资料，部署后验证页面，全部都在 800 tokens 内完成。

**上下文就是电池。** 一个烧 10,000 tokens 的工具是台电暖器。PinchTab 在 800 tokens 上就是一只 LED 灯泡。同样的电池，12 倍的续航。

它的 HTTP API（9867 端口）还意味着，你可以把它集成到 bot 和自动化流水线中。

---

PinchTab 解决了日常的浏览器任务。

但有一件事 PinchTab 做起来很烦人：**复杂表单的填写**。

求职申请表。10 个以上的字段。下拉、单选、textarea。PinchTab 能做，但每个字段都重复 `snap` -> `type` -> `click`，越做越累。

**它相对 PinchTab 最大的武器：自主 agent 模式。**

给它一个任务，AI 自己规划步骤并执行。说一句「用我的资料填这份求职申请」，它会找到字段，挑出对应的值，把它们输入进去。

我用 browser-use 在 Greenhouse 和 Ashby（招聘平台）上填申请表。Claude Code 负责编排，browser-use 负责逐字段输入。我开着 headed 模式看着，最后只手动点了一下提交按钮。

```
pip install browser-use
```

<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-on"><title>Enter fullscreen mode</title> <path d="M16 3h6v6h-2V5h-4V3zM2 3h6v2H4v4H2V3zm18 16v-4h2v6h-6v-2h4zM4 19h4v2H2v-6h2v4z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-off"><title>Exit fullscreen mode</title><path d="M18 7h4v2h-6V3h2v4zM8 9H2V7h4V3h2v6zm10 8v4h-2v-6h6v2h-4zM8 15v6H6v-4H2v-2h6z"></path></svg>

CLI 模式：

```
browser-use open https://example.com
browser-use input "field name" "value"
browser-use state    # 查看当前状态
```

<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-on"><title>Enter fullscreen mode</title> <path d="M16 3h6v6h-2V5h-4V3zM2 3h6v2H4v4H2V3zm18 16v-4h2v6h-6v-2h4zM4 19h4v2H2v-6h2v4z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-off"><title>Exit fullscreen mode</title><path d="M18 7h4v2h-6V3h2v4zM8 9H2V7h4V3h2v6zm10 8v4h-2v-6h6v2h-4zM8 15v6H6v-4H2v-2h6z"></path></svg>

它也提供 MCP server 模式，暴露 17 个工具。

**它消耗的 tokens 远多于 PinchTab。** 自主 agent 每一步都会调用一次 LLM。单页的 token 数也更高。

**但对于复杂的多步任务，自主性 > 效率。**

手动对 10 个表单字段跑 `snap` -> `type`，得花 20 分钟。让 browser-use「把这个填了」只要 3 分钟。多花了 tokens，但省下了人的时间。

---

把所有信息汇总到一张表里。

| 特性 | Chrome DevTools MCP | Claude in Chrome | agent-browser | PinchTab | browser-use |
| --- | --- | --- | --- | --- | --- |
| **每页 Tokens** | 10,000+ | 10,000+ | 3,000-5,000 | **~800** | 10,000+ |
| **安装配置** | 调试参数启动 | 扩展 | `npm install` | 启动一次即可 | `pip install` |
| **Windows 支持** | 需要 `cmd /c` 绕过 | OK | UNC 路径 bug | **OK** | OK |
| **认证/cookie** | 独立 profile | 真实浏览器 | Auth Vault | **真实浏览器** | 真实浏览器 |
| **稳定性** | 稳定 | Beta，会掉线 | 稳定 | **稳定** | 稳定 |
| **速度** | 中等 | 中等 | 中等 | **快** | 慢（要调 LLM） |
| **SNS 阅读** | 笨重的 JSON | 笨重的 JSON | 重 | **800 tokens** | 重 |
| **表单填写** | 吞首字符 | 吞首字符 | OK | OK | **最佳（自主）** |
| **自主 agent** | 否 | 否 | 否 | 否 | **是** |
| **后台守护进程** | 否 | 否 | 否 | **HTTP server** | 否 |
| **价格** | 免费 | 免费 | 免费 | 免费 | 免费 |

---

**没有完美的工具。答案是组合。**

```
浏览器自动化优先级链：

1. PinchTab       -> 所有日常任务（阅读、抓取、测试、截图）
2. browser-use    -> 复杂的多步任务（填表单、自主工作流）
3. agent-browser  -> PinchTab 不可用时，或需要录屏 / Auth Vault 时
4. WebFetch       -> 仅用于静态文档 / API 参考。永远不要拿它看 SNS。
```

<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-on"><title>Enter fullscreen mode</title> <path d="M16 3h6v6h-2V5h-4V3zM2 3h6v2H4v4H2V3zm18 16v-4h2v6h-6v-2h4zM4 19h4v2H2v-6h2v4z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-off"><title>Exit fullscreen mode</title><path d="M18 7h4v2h-6V3h2v4zM8 9H2V7h4V3h2v6zm10 8v4h-2v-6h6v2h-4zM8 15v6H6v-4H2v-2h6z"></path></svg>

| 工具 | 交通工具 | 特点 |
| --- | --- | --- |
| **PinchTab** | 自行车 | 快、最省油、日常通勤 |
| **browser-use** | 汽车 | 跑得远、装得多、油耗更高 |
| **agent-browser** | 摩托车 | 备用，特殊用途 |
| **WebFetch** | 步行 | 慢、装不下东西、最后的手段 |

---

**先装 PinchTab。** 投入产出比最高。用 800 tokens 读一个页面，你的 session 寿命会大幅延长。

```
pinchtab &
pinchtab nav https://your-app.com
sleep 3
pinchtab text
```

<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-on"><title>Enter fullscreen mode</title> <path d="M16 3h6v6h-2V5h-4V3zM2 3h6v2H4v4H2V3zm18 16v-4h2v6h-6v-2h4zM4 19h4v2H2v-6h2v4z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-off"><title>Exit fullscreen mode</title><path d="M18 7h4v2h-6V3h2v4zM8 9H2V7h4V3h2v6zm10 8v4h-2v-6h6v2h-4zM8 15v6H6v-4H2v-2h6z"></path></svg>

光这一点，就改变一切。

**再加上 browser-use。** 求职申请、数据录入、跨页面的工作流。让自主 agent 干活，你在旁边监督。

```
pip install browser-use
```

<svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-on"><title>Enter fullscreen mode</title> <path d="M16 3h6v6h-2V5h-4V3zM2 3h6v2H4v4H2V3zm18 16v-4h2v6h-6v-2h4zM4 19h4v2H2v-6h2v4z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" class="highlight-action crayons-icon highlight-action--fullscreen-off"><title>Exit fullscreen mode</title><path d="M18 7h4v2h-6V3h2v4zM8 9H2V7h4V3h2v6zm10 8v4h-2v-6h6v2h-4zM8 15v6H6v-4H2v-2h6z"></path></svg>

**用 agent-browser。** `npm install -g agent-browser && agent-browser install`，搞定。

**别用 WebFetch。** 不管怎么样都别用。尤其不要拿来看 SNS。

---

| # | 经验 |
| --- | --- |
| 1 | 截至 2026 年 3 月，「让 AI 用上浏览器」**仍然是一个未解决的问题** |
| 2 | 没有完美的工具。**答案是组合** |
| 3 | Token 效率就是一切。800 vs 10,000 = **12 倍差距**。session 寿命完全不同 |
| 4 | SNS 需要专用工具。**别用 WebFetch** |
| 5 | 表单填写最适合交给自主 agent。**AI 填，人监督** |

---

我把 6 个工具全试了一遍，花了好几个月。

从用 Chrome DevTools MCP 时反复带调试参数重启 Chrome 的折磨开始，经过 Claude in Chrome Beta 频繁掉线，再到与 WebFetch 那场 CSS 垃圾大战，到看见 agent-browser 时的曙光，再到在 PinchTab 上找到日常的安宁，最后用 browser-use 补上最后一块拼图。

老实说，**我很庆幸全都试过一遍。**

因为这不是一个工具能解决的问题。日常通勤骑自行车，长途出行开汽车，应急时骑摩托车。一个道理。

**现在 AI 终于能用上浏览器，厨师终于能尝到自己做的菜了。**

接下来的问题是：他们会做出什么？

---

*本文写于东京，发布前用 PinchTab 读了一遍预览做最终检查。*

.long-bb-body { max-height: calc(100vh - 200px); overflow: hidden; } .long-bb-bottom { height: 180px; background: linear-gradient(to top, var(--card-bg), transparent); margin-top: -180px; position:relative; z-index: 5; }

[![profile](https://media2.dev.to/dynamic/image/width=64,height=64,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Forganization%2Fprofile_image%2F140%2F9639a040-3c27-4b99-b65a-85e100016d3c.png)

MongoDB

](https://dev.to/mongodb)推广

-   [广告位是什么？](https://dev.to/billboards)
-   [管理偏好](https://dev.to/settings/customization#sponsors)

---

-   [举报广告](https://dev.to/report-abuse?billboard=241241)

[![Gen AI apps are built with MongoDB Atlas](https://media2.dev.to/dynamic/image/width=775%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fi.imgur.com%2FlGiI0TQ.png)](https://www.mongodb.com/cloud/atlas/lp/try3?utm_campaign=display_devto-broad_pl_flighted_atlas_tryatlaslp_prosp_gic-null_ww-all_dev_dv-all_eng_leadgen&utm_source=devto&utm_medium=display&utm_content=airevolution-v1&bb=241241)

MongoDB Atlas 是面向开发者的数据库，用来构建、扩展和运行 gen AI & LLM 应用 —— 不需要额外的向量数据库。原生向量搜索，覆盖 115+ 区域，灵活的文档建模。让你更快构建 AI，一站式完成。

## 顶部评论（5）

订阅

<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-labelledby="as06sjdmbczh3dv7tbb5we86brh9l6ex" class="crayons-icon expanded"><title id="as06sjdmbczh3dv7tbb5we86brh9l6ex">Collapse</title> <path d="M12 10.677L8 6.935 9 6l3 2.807L15 6l1 .935-4 3.742zm0 4.517L9 18l-1-.935 4-3.742 4 3.742-1 .934-3-2.805z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-labelledby="a73dwy1vnrlts2ww2o0am6v3320vhfyn" class="crayons-icon collapsed"><title id="a73dwy1vnrlts2ww2o0am6v3320vhfyn">Expand</title><path d="M12 18l-4-3.771 1-.943 3 2.829 3-2.829 1 .943L12 18zm0-10.115l-3 2.829-1-.943L12 6l4 3.771-1 .942-3-2.828z"></path></svg>

 

[![salome_koshadze_feeb58784 profile image](https://media2.dev.to/dynamic/image/width=50,height=50,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F3568626%2F59ab1a53-5e90-4709-9736-b6af019a066c.jpg)](https://dev.to/salome_koshadze_feeb58784)

[Salome koshadze](https://dev.to/salome_koshadze_feeb58784)

 [![](https://media2.dev.to/dynamic/image/width=90,height=90,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F3568626%2F59ab1a53-5e90-4709-9736-b6af019a066c.jpg)Salome koshadze](https://dev.to/salome_koshadze_feeb58784)

-   加入时间
    
    2025 年 10 月 16 日
    

• [3 月 11 日](https://dev.to/minatoplanb/i-tested-every-browser-automation-tool-for-claude-code-heres-my-final-verdict-3hb7#comment-35e48)

允许我提出第三种架构：基于代理的会话虚拟化（proxy-based session virtualization）。

agent 不再控制本地浏览器实例，而是在一个服务器托管的会话内运行，这个会话会重写并流式传输目标应用。
这个模式改变了状态管理的问题。会话状态（cookie、local storage）由虚拟会话在服务端统一管理。配合一个自定义域名后，所有 cookie 都变成第一方 cookie，从而绕开你遇到的那种反复登录的循环 —— 本质上，这给了 AI agent 控制实时 web 会话的能力。

控制机制使用一套专用的 Automation API。例如，webfuse 暴露出 browser.webfuseSession.automation.left\_click(selector) 和 browser.webfuseSession.automation.type(text, selector) 这样的 API。更重要的是，它在源头上处理了 token 问题。代理可以在序列化之前对 DOM 做预处理，比如 take\_dom\_snapshot({ modifier: 'AdaptiveD2Snap', params: { maxTokens: 8192 } })，把它压缩到指定的 token 预算内，再交给 LLM。

<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-labelledby="a48ym45jtw5bw9zgfh67w6i0p8vq08tg" class="crayons-icon expanded"><title id="a48ym45jtw5bw9zgfh67w6i0p8vq08tg">Collapse</title> <path d="M12 10.677L8 6.935 9 6l3 2.807L15 6l1 .935-4 3.742zm0 4.517L9 18l-1-.935 4-3.742 4 3.742-1 .934-3-2.805z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-labelledby="aibc2r1fpfoz3ptvgspjnxhiyme0eee1" class="crayons-icon collapsed"><title id="aibc2r1fpfoz3ptvgspjnxhiyme0eee1">Expand</title><path d="M12 18l-4-3.771 1-.943 3 2.829 3-2.829 1 .943L12 18zm0-10.115l-3 2.829-1-.943L12 6l4 3.771-1 .942-3-2.828z"></path></svg>

 

[![leonting1010 profile image](https://media2.dev.to/dynamic/image/width=50,height=50,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F3851369%2F7a1d458f-c463-4b40-8bb1-69e5711e435d.png)](https://dev.to/leonting1010)

[Leon](https://dev.to/leonting1010)

 [![](https://media2.dev.to/dynamic/image/width=90,height=90,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F3851369%2F7a1d458f-c463-4b40-8bb1-69e5711e435d.png)Leon](https://dev.to/leonting1010)

-   加入时间
    
    2026 年 3 月 30 日
    

• [4 月 4 日](https://dev.to/minatoplanb/i-tested-every-browser-automation-tool-for-claude-code-heres-my-final-verdict-3hb7#comment-36ck2)

关于基于代理的会话虚拟化这个观点很有意思。其实还有第四种架构值得一提：**编译期 AI，运行期确定性**。

agent 不再在运行时（无论本地还是代理）控制浏览器，而是在编写阶段让 AI 观察页面*一次*，编译出一个确定性的 .js 程序。之后该程序就一直重放 —— 不再做 AI 推理，不再有会话管理的复杂度，单次执行 0 美元。

权衡是灵活性 vs 成本。代理和本地浏览器 agent 能在运行时随机应变，但每一次都要烧 tokens。编译型方案在站点变动时会失效，但你可以加上自愈机制（`doctor --auto`），让它检测到失效后只在需要时重新编译。

对大多数读取密集型的自动化（抓取、监控、数据抽取），编译型方案在可靠性和成本上都更胜一筹。对每次都会变化的交互型工作流，运行时 agent 仍然有意义。

<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-labelledby="a8bkb20mj3yym166mranmnw98q459nz9" class="crayons-icon expanded"><title id="a8bkb20mj3yym166mranmnw98q459nz9">Collapse</title> <path d="M12 10.677L8 6.935 9 6l3 2.807L15 6l1 .935-4 3.742zm0 4.517L9 18l-1-.935 4-3.742 4 3.742-1 .934-3-2.805z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-labelledby="a9m5xi13asnnq3wie924bjb1c8tkcnf1" class="crayons-icon collapsed"><title id="a9m5xi13asnnq3wie924bjb1c8tkcnf1">Expand</title><path d="M12 18l-4-3.771 1-.943 3 2.829 3-2.829 1 .943L12 18zm0-10.115l-3 2.829-1-.943L12 6l4 3.771-1 .942-3-2.828z"></path></svg>

 

[![cissor profile image](https://media2.dev.to/dynamic/image/width=50,height=50,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F3933642%2F6ab07367-0861-4ed0-af3e-dab0d5b6f7f9.png)](https://dev.to/cissor)

[Cissor](https://dev.to/cissor)

 [![](https://media2.dev.to/dynamic/image/width=90,height=90,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F3933642%2F6ab07367-0861-4ed0-af3e-dab0d5b6f7f9.png)Cissor](https://dev.to/cissor)

-   加入时间
    
    2026 年 5 月 15 日
    

• [5 月 15 日](https://dev.to/minatoplanb/i-tested-every-browser-automation-tool-for-claude-code-heres-my-final-verdict-3hb7#comment-381mf)

有用这种架构的实际例子吗？听起来挺有意思。

<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-labelledby="a2t992wgx2ya4j9d0paxiu4zdnvhpqzp" class="crayons-icon expanded"><title id="a2t992wgx2ya4j9d0paxiu4zdnvhpqzp">Collapse</title> <path d="M12 10.677L8 6.935 9 6l3 2.807L15 6l1 .935-4 3.742zm0 4.517L9 18l-1-.935 4-3.742 4 3.742-1 .934-3-2.805z"></path></svg> <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-labelledby="agmcwgn34rgn3eby2y9u0jkwlrvl5m8f" class="crayons-icon collapsed"><title id="agmcwgn34rgn3eby2y9u0jkwlrvl5m8f">Expand</title><path d="M12 18l-4-3.771 1-.943 3 2.829 3-2.829 1 .943L12 18zm0-10.115l-3 2.829-1-.943L12 6l4 3.771-1 .942-3-2.828z"></path></svg>

 

[![achiya-automation profile image](https://media2.dev.to/dynamic/image/width=50,height=50,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F3810102%2Fefb43e59-992c-4f8b-91df-ee602c7c853f.jpg)](https://dev.to/achiya-automation)

[אחיה כהן](https://dev.to/achiya-automation)

 [![](https://media2.dev.to/dynamic/image/width=90,height=90,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F3810102%2Fefb43e59-992c-4f8b-91df-ee602c7c853f.jpg)אחיה כהן](https://dev.to/achiya-automation)

WhatsApp 机器人开发者 & 业务自动化专家。基于 n8n、Make 和 WhatsApp API（官方与 WAHA）构建定制机器人和工作流。已服务 50+ 满意客户。

-   工作
    
    Achiya Automation 创始人 —— WhatsApp 机器人与业务自动化
    
-   加入时间
    
    2026 年 3 月 6 日
    

• [3 月 29 日](https://dev.to/minatoplanb/i-tested-every-browser-automation-tool-for-claude-code-heres-my-final-verdict-3hb7#comment-366h2)

很棒的对比！对 macOS 用户来说，还有一个值得一提的选择：**Safari MCP** —— 唯一一个使用原生 Safari 而非 Chromium 的 MCP server。

我做它的原因是，Chrome 在我的 M4 MacBook 上空闲时就吃掉 15-25% 的 CPU，而 Safari 静静地待在那里，所有会话都已经加载好。

关键区别：

-   使用你真实的 Safari，包含所有已有的登录（无需重新认证）
-   通过 AppleScript + Swift 守护进程，每条命令约 5ms
-   80 个工具（比 Chrome DevTools MCP 或 Playwright MCP 都多）
-   Chrome 进程为零 = 开销为零

`npm install safari-mcp`
