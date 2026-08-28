---
title: "Warp 如何基于 Claude 构建自我改进的 Agent"
originalTitle: "How Warp builds self-improving agents on Claude"
date: 2026-08-28
originalUrl: https://claude.com/blog/how-warp-builds-self-improving-agents-on-claude
lang: zh
---

![](https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/6903d225485fe31f1ed2d9a1_db28a79c9f4492b8471009d4c20e900f234ece48-1000x1000.svg)

了解 Warp 如何设计出一套任何人都能用来创建自我改进 Agent 的简单开发模式。

.button\_main\_icon { transition: color 300ms ease; } .button\_main\_wrap:hover .button\_main\_icon { color: var(--\_button-style---icon-hover); } .button\_main\_wrap:focus-within .button\_main\_icon { color: var(--\_button-style---text-hover) !important; } .button\_main\_wrap:focus-within { color: var(--\_button-style---text-hover) !important; }

.button\_main\_icon { transition: color 300ms ease; } .button\_main\_wrap:hover .button\_main\_icon { color: var(--\_button-style---icon-hover); } .button\_main\_wrap:focus-within .button\_main\_icon { color: var(--\_button-style---text-hover) !important; } .button\_main\_wrap:focus-within { color: var(--\_button-style---text-hover) !important; }

-   日期
    
    2026 年 8 月 26 日
    
-   阅读时间
    
    5
    
    分钟
    

-   作者
    
    Michael Segner
    

*在我们的系列文章中，我们重点关注初创公司如何利用 AI 变革自己的行业。在这篇文章中，我们分享 Warp 如何把无状态的用户反馈转化为其 Agent 的自我改进循环。*

<figure><div role="region" tabindex="0"><table><thead><tr><th colspan="2">The quick pitch</th></tr></thead><tbody><tr><td>Name</td><td>Warp</td></tr><tr><td>Founded</td><td>2020</td></tr><tr><td>Founders</td><td>Zach Lloyd (CEO)</td></tr><tr><td>Stack</td><td>Rust, Golang, GitHub Actions, internal agent orchestration platform (Oz), Claude Platform</td></tr><tr><td>Growth</td><td>$73M raised. 800K monthly developers build on Warp. 56% of the Fortune 500 uses Warp. 10M Claude Code sessions run inside Warp to date, 400K+ per week. 40M total Warp Agent conversations.</td></tr></tbody></table></div></figure>

Agent 需要可靠且高效地处理重复出现的任务。一个首次运行只能完成 80% 任务的 prompt，会给用户带来嘈杂而恼人的体验。Warp 对此深有体会，并据此调整了产品策略，为全球近 100 万开发者打造了更好的体验。

Warp 是一款 AI 驱动的终端和 agentic 开发环境，构建在 Claude Platform 之上。该团队在内部代码评审 Agent 上就遇到了这种"嘈杂体验"问题。工程师们抱怨他们的 Agent 给出的评论毫无帮助、产出质量低下。

团队最初尝试过一些权宜之计，比如根据观察到的代码评审失败案例手动重写 prompt。这确实让输出更可用，但无法规模化。改进 AGENTS.md 之类的上下文文件也有帮助，但远算不上彻底的解决方案。

最终他们意识到，真正的问题在于：无论 Agent 的用途是什么，给它的反馈通常在会话结束时就消失了，关键的上下文随之脱离了 agentic 循环。他们的解决方案：一个基于 [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) 的框架，用来创建自我改进的 Agent——反馈随时间不断复利累积，持续打磨并增强 Agent 的输出。

请继续阅读，了解他们如何在 Claude Platform 之上用 skill 实现这一机制。

## **基于 skill 的 Agent 自我改进循环**

核心技术是用 [**skill**](https://support.claude.com/en/articles/12512176-what-are-skills) 构建自我改进循环。skill 是一种以文件形式编码的知识，把指令从原始 prompt 中剥离出来。Warp 逐步演化出一种由两个 skill 组成的自我改进 Agent 架构，中间夹着人类反馈。

![](https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/6a8f1a9a1b33f40618a9d59a_selfimprove-loop.jpg)

**内层/基础 skill**（inner/base skill）承载功能性的领域知识与指令。例如，当一个 PR 被打开时，Warp 的代码 Agent 会基于这个基础 skill 和上下文执行，产出评审结果。

针对 Agent 输出的**人类反馈**是自我改进循环的关键组成部分。对代码评审来说，反馈可以简单到一个点赞（thumbs up），但越明确越好。

"人类可以表示认可，'这条评论不错，有用'，"Warp 创始人 Zach Lloyd 解释道，"但人类也可以详细说明为什么一次代码评审做得不好。诸如'你建议重命名这个变量，但我们的代码库约定是：这类全局变量使用这种特定命名上下文'的具体反馈，能告诉 Agent 下次如何做对。"

**外层/改进 skill**（outer/improver skill）扮演观察者 Agent 的角色，按计划定期运行，而不是每个任务跑一次。它汇总累积的人类反馈，把 Agent 的建议与人类的实际反应进行对比，然后对基础 skill 提出一处小而聚焦的修改。

由于 skill 就是普通文件，Agent 更新起来得心应手。这些更新可评审、可批准、可合并，能够走正常的 PR/代码评审工作流；一旦合并，内层 skill 的下一次运行就会继承这一改进。

Warp 现在在整个开源仓库中运行这一模式：规格编写（spec-writing）、评审（review）和分诊（triage）三类 Agent 各司其职，每个都带有自己的自我改进循环。

"基于文件的 skill 是一种为 Agent 编码知识的方式，不必把知识直接塞进 prompt，Agent 在工作过程中随时可以查阅，"Zach 说，"这个框架其实非常简单：一个基础领域 skill，再加一个用来打磨这个领域 skill 的 improver skill。简单正是这种方法的美妙之处。"

## **如何为 Agent 编写自我改进的 skill**

以下是 Warp 团队在为 agentic 循环编写自我改进 skill 时总结的若干行之有效的建议：

-   **写原则，而非规则。**"构建 skill 时，要像在指导一个聪明人，而不是在给计算机编程，"Zach 说，"在 skill 中写上'寻找重复代码'这样的方向性指引，比罗列详尽的变量命名规则更有效。"
-   **解释为什么。**给出规则背后的理由，让 Agent 能够对问题进行推理，而不是死板地执行指令，同样有助于更好的泛化。
-   **让反馈的给出毫不费力。**在人们已经工作的地方捕获反馈，比如直接在 PR 或 issue 上评论。同时让这一过程自动发生，不需要额外的提交步骤。"低摩擦才能让信号持续流动，"Zach 指出，"如果反馈太难给出，你既拿不到反馈，也无法改进 skill。"
-   **保持 skill 精简，使用渐进式披露。**[一个好的 skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) 文件并不大；它通过引用资源文件和脚本来按需加载，而不是把所有内容一次性塞进上下文。
-   **反馈质量 > 数量，但数量也有帮助。**来自资深工程师的少量详尽、贴合领域的反馈，可能比大量粗略反馈更有价值，因为简单的点赞/点踩说不出*为什么*。"即使样本量相对较小，只要是一个人就特定领域知识给出的非常详尽的反馈——这些知识本来是 Agent 无从获取的——你也能获得非常好的信号，"Zach 继续说道，"话虽如此，高质量信号的语料库越大越好。在 Warp，我们用一个循环来管理整个开源仓库。我们有数百人参与贡献，代码评审数以千计。"
-   **在 improver skill 上多花功夫。**为 improver skill（观察者 Agent）的编写多投入精力，其回报会超出当前的 Agent 循环，因为 improver skill 在不同用例之间高度可复用。"抛开领域知识部分，这是一个相当可复用的机制——代码评审 Agent 的 improver skill 与任何其他 Agent 的 improver skill 并没有太大区别。"

## **循环实战：Warp 的 issue 分诊 Agent**

[Warp 的 issue 分诊 Agent](https://github.com/warpdotdev/warp-agents-demo-github-issue-triage) 展示了自我改进 Agent skill 框架。每当有人提交新的 GitHub issue 时，这一模式就会被触发：一个 GitHub Action 启动一个 Agent，分析该 issue 的复杂度与可行性，打上标签，并为修复方向提出建议。这个分诊 Agent 运行时依赖一个内层 skill 文件，其中保存着关于每个标签含义、以及在行动前如何调研代码库的领域知识。

在一个示例 issue 上，第一阶段的内层 skill 表现扎实，但漏掉了一个标签：ready to spec——它表示贡献者可以开始基于该 issue 编写产品与技术规格了。Warp 团队的一位维护者发现了这个疏漏，直接在 issue 上留下了反馈，正是在工作发生的地方。关键是，他既说明了自己期望什么，也解释了为什么这样期望：这样的反馈具体可行，便于 Agent 日后吸收。

外层 improver skill 运行在 [Oz——Warp 的 Agent 编排平台](https://docs.warp.dev/)中，作为一个定时运行的 "update triage" Agent。该 Agent 完成 GitHub 认证后，运行 skill 自带的一个 Python 脚本，拉取近期带有反馈的 issue，将其汇总为一个 JSON 文件，再读回上下文。脚本随 skill 打包本身就是一项最佳实践；skill 可以引用资源文件，而不必每次运行都重新写代码。

在此基础上，该 Agent 从维护者的评论中识别出具体的反馈信号，并提出了能涵盖这些信号的最小修改。它开了一个 PR，编辑内层 skill：当 issue 描述了一个真实问题、即便具体的 UI 或 UX 形态尚未确定时，就打上 "ready to spec" 标签。

由于整个更新就是一个 skill 文件，它走的是正常的代码评审工作流。这个 PR 附带说明，解释了哪些信号促成了此次修改、修改了什么。由人类评审、批准并合并，分诊 skill 的下一次运行便继承了新知识。最后这道人工环节闭合了循环，也让实际改动了什么始终处于人的掌控之中。

这正是 Warp 如今在其开源仓库上大规模运行的同一机制：规格编写 Agent、评审 Agent 和分诊 Agent 各自携带自己的自我改进循环。

任何 Agent，无论其任务是什么，只要从一开始就内建这样一个循环——捕获人类反馈信号、将其转化为 skill 更新——都能随时间越变越好，让 Agent 从一次性的帮手成长为在整个组织中不断复利的强大系统。

<figure><div role="region" tabindex="0"><table><thead><tr><th colspan="2">Best practices from the Warp team</th></tr></thead><tbody><tr><td>Are you conflating skills with memory?</td><td>Skills are procedural and stable—"how to do X," run-agnostic, changed deliberately. Memory is auto-written by the agent at inference time and never stops changing.</td></tr><tr><td>Do you need one improver loop, or one per agent?</td><td>Meet in the middle: a templated base loop captures the overlap across your agents, with domain-specific weights layered on. A handful of improvers can each own one; a hundred should share.</td></tr><tr><td>What happens when the feedback is wrong?</td><td>Assume it will be. Don't let the agent accept feedback blindly — give it context to sanity-check, filter whose input counts, and keep a human in the loop at either the filtering or final-review stage.</td></tr><tr><td>Is your domain verifiable?</td><td>Build the verification harness first, then let the agent tune against it: generate a reference corpus, compare output to reference, fix, repeat.</td></tr><tr><td>And if it isn't domain verifiable?</td><td>Lean on deterministic evals against golden outputs wherever they exist. Where you must use human feedback, restrict it to domain experts — don't open the floodgates.</td></tr><tr><td>How do you know the whole system is improving?</td><td>Track the global metrics humans already eyeball—time to merge, contributor count, cost—and feed them back into the improver agents. Go crawl-walk-run on deployment.</td></tr></tbody></table></div></figure>

[*观看完整 webinar*](https://www.anthropic.com/webinars/how-warp-builds-self-improving-agents-on-claude)*，了解现场演示，并深入探讨 Warp 如何用 Claude 构建能从团队反馈中学习、随时间不断自我改进的 Agent。*

\[data-slider-shell\]{ display: none; } \[data-slider-track\] > \[data-slider-card\]{ flex: 0 0 auto; width: auto; min-width: 0; box-sizing: border-box; padding-left: 1rem; padding-right: 1rem; } \[data-slider-prev\], \[data-slider-next\] { transition: opacity 0.3s ease; } \[data-slider-prev\].is-disabled, \[data-slider-next\].is-disabled { opacity: 0.3; pointer-events: none; cursor: default; } \[data-slider-dot\] { width: 1.75rem; justify-content: center; display: flex; height: 1.75rem; align-items: center; } \[data-slider-dot\] span { display: block; width: 0.3125rem; height: 0.3125rem; border-radius: 999px; background: var(--\_theme---border-secondary); transition: background 0.3s ease; } \[data-slider-dot\].is-active span { background: var(--\_theme---foreground-primary); }

document.addEventListener("DOMContentLoaded", function () { if (!document.getElementById("\_\_swiper\_slider\_overrides")) { var s = document.createElement("style"); s.id = "\_\_swiper\_slider\_overrides"; s.textContent = \` /\* Equal-height cards \*/ \[data-slider\] \[data-slider-track\] { align-items: stretch; } \[data-slider\] \[data-slider-card\].swiper-slide { height: auto; display: flex; flex-direction: column; } \[data-slider\] \[data-slider-card\].swiper-slide > \* { flex: 1 1 auto; } /\* Preserve original .slider\_dots layout — stop Swiper from stretching it \*/ \[data-slider\] \[data-slider-dots\].swiper-pagination-horizontal, \[data-slider\] \[data-slider-dots\].swiper-pagination-bullets { width: auto !important; position: static; flex: 0 0 auto; } /\* Match easing to GSAP power1.inOut \*/ \[data-slider\] .swiper-wrapper { transition-timing-function: cubic-bezier(0.37, 0, 0.63, 1) !important; } \`; document.head.appendChild(s); } function debounce(fn, wait) { let t; return function () { const args = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, args); }, wait); }; } var FULL\_DURATION = 600; var SNAPPY\_DURATION = 400; document.querySelectorAll("\[data-slider\]").forEach(function (root) { if (root.dataset.scriptInitialized) return; root.dataset.scriptInitialized = "true"; var desktopPer = parseInt(root.getAttribute("data-slider-desktop-threshold")) || 4; var tabletPer = parseInt(root.getAttribute("data-slider-tablet-threshold")) || 2; var mobilePer = 1; var loopAttr = (root.getAttribute("data-slider-loop") || "").toLowerCase(); var centerAttr = (root.getAttribute("data-slider-center") || "").toLowerCase(); var LOOP = loopAttr === "true" || loopAttr === "1" || loopAttr === ""; var CENTER\_MODE = centerAttr === "true" || centerAttr === "1"; var grid = root.querySelector("\[data-slider-grid\]"); var shell = root.querySelector("\[data-slider-shell\]"); var viewport = shell && shell.querySelector("\[data-slider-viewport\]"); var track = shell && shell.querySelector("\[data-slider-track\]"); var prevBtn = shell && shell.querySelector("\[data-slider-prev\]"); var nextBtn = shell && shell.querySelector("\[data-slider-next\]"); var controls = shell && shell.querySelector("\[data-slider-controls\]"); var dotsWrap = shell && shell.querySelector("\[data-slider-dots\]"); var mobileActive = shell && shell.querySelector("\[data-slider-mobile-active\]"); var mobileTotal = shell && shell.querySelector("\[data-slider-mobile-total\]"); if (!grid || !shell || !viewport || !track) return; var cards = Array.prototype.slice.call(grid.querySelectorAll("\[data-slider-card\]")); if (!cards.length) return; var placeholders = new Map(); cards.forEach(function (card) { var m = document.createComment("card-slot"); card.parentNode.insertBefore(m, card); placeholders.set(card, m); }); var originalLength = cards.length; if (mobileTotal) mobileTotal.textContent = String(originalLength); var swiper = null; var currentMode = "grid"; var lastNavTime = 0; function applySwiperClasses() { viewport.classList.add("swiper"); track.classList.add("swiper-wrapper"); cards.forEach(function (c) { c.classList.add("swiper-slide"); }); } function removeSwiperClasses() { viewport.classList.remove("swiper"); track.classList.remove("swiper-wrapper"); cards.forEach(function (c) { c.classList.remove("swiper-slide"); }); } function moveCardsToTrack() { cards.forEach(function (c) { track.appendChild(c); }); grid.style.display = "none"; } function moveCardsBackToGrid() { cards.forEach(function (c) { var m = placeholders.get(c); if (m && m.parentNode) m.parentNode.insertBefore(c, m); c.classList.remove("is-active"); }); grid.style.display = ""; } function showControls(show) { if (controls) controls.style.display = show ? "" : "none"; } function getSlidesPerViewForWindow() { var w = window.innerWidth; if (w >= 1200) return desktopPer; if (w >= 768) return tabletPer; return mobilePer; } function shouldUseSlider() { return cards.length > getSlidesPerViewForWindow(); } function updateMobileCounter(realIndex) { if (mobileActive) mobileActive.textContent = String((realIndex || 0) + 1); } // Override slideNext/slidePrev: dynamically switch params.speed so the next // transition runs at SNAPPY\_DURATION if the user is clicking rapidly. function patchNavigationSpeed(sw) { var proto = Object.getPrototypeOf(sw); sw.slideNext = function () { var now = Date.now(); var hadRecent = lastNavTime !== 0 && (now - lastNavTime) < FULL\_DURATION; sw.params.speed = hadRecent ? SNAPPY\_DURATION : FULL\_DURATION; lastNavTime = now; return proto.slideNext.call(sw); }; sw.slidePrev = function () { var now = Date.now(); var hadRecent = lastNavTime !== 0 && (now - lastNavTime) < FULL\_DURATION; sw.params.speed = hadRecent ? SNAPPY\_DURATION : FULL\_DURATION; lastNavTime = now; return proto.slidePrev.call(sw); }; } function initializeSlider() { if (swiper) return; applySwiperClasses(); moveCardsToTrack(); shell.style.display = "block"; showControls(true); swiper = new Swiper(viewport, { slidesPerView: mobilePer, spaceBetween: 0, loop: LOOP, centeredSlides: CENTER\_MODE, followFinger: true, freeMode: false, slideToClickedSlide: false, autoHeight: false, speed: FULL\_DURATION, allowSlidePrev: true, allowSlideNext: true, preventInteractionOnTransition: false, breakpoints: { 768: { slidesPerView: tabletPer }, 1200: { slidesPerView: desktopPer } }, mousewheel: { forceToAxis: true }, keyboard: { enabled: true, onlyInViewport: true }, navigation: { nextEl: nextBtn || undefined, prevEl: prevBtn || undefined, disabledClass: "is-disabled" }, pagination: dotsWrap ? { el: dotsWrap, bulletActiveClass: "is-active", bulletClass: "slider\_dot\_item", bulletElement: "button", clickable: true, renderBullet: function (index, className) { return '<button type="button" data-slider-dot class="' + className + '" aria-label="Go to item ' + (index + 1) + '"><span></span></button>'; } } : false, slideActiveClass: "is-active", slideDuplicateActiveClass: "is-active", on: { init: function () { updateMobileCounter(this.realIndex); }, slideChange: function () { updateMobileCounter(this.realIndex); } } }); patchNavigationSpeed(swiper); currentMode = "slider"; } function destroySlider() { if (!swiper) return; try { swiper.destroy(true, true); } catch (e) {} swiper = null; removeSwiperClasses(); moveCardsBackToGrid(); shell.style.display = "none"; showControls(false); currentMode = "grid"; } function evaluate() { if (shouldUseSlider()) { if (currentMode !== "slider") initializeSlider(); else if (swiper) swiper.update(); } else { if (currentMode !== "grid") destroySlider(); } } window.addEventListener("resize", debounce(evaluate, 200)); if (window.ResizeObserver) { var ro = new ResizeObserver(debounce(evaluate, 200)); ro.observe(document.documentElement); root.\_sliderCleanup = function () { ro.disconnect(); if (swiper) { try { swiper.destroy(true, true); } catch (e) {} swiper = null; } }; } evaluate(); }); });

No items found.

0/5

eBook

.button\_small\_icon { transition: color 300ms ease; } .button\_small\_wrap:hover .button\_small\_icon { color: var(--\_button-style---icon-hover); } .button\_small\_wrap:focus-within .button\_small\_icon { color: var(--\_button-style---text-hover) !important; } .button\_small\_wrap:focus-within { color: var(--\_button-style---text-hover) !important; }

![](https://cdn.prod.website-files.com/6889473510b50328dbb70ae6/6889473610b50328dbb70b58_placeholder.svg)

![](https://cdn.prod.website-files.com/6889473510b50328dbb70ae6/6889473610b50328dbb70b58_placeholder.svg)![](https://cdn.prod.website-files.com/6889473510b50328dbb70ae6/6889473610b50328dbb70b58_placeholder.svg)

FAQ

No items found.

.wf-design-mode \[data-accordion="content"\] { display: block; } .accordion\_toggle\_line.is-2 { transition: transform 500ms var(--ease-expo-out); } \[data-accordion="component"\].is-opened .accordion\_toggle\_line.is-2 { transform: rotate(0deg); }

document.addEventListener("DOMContentLoaded", function () { document.querySelectorAll("\[data-accordion='wrap'\]").forEach((component, listIndex) => { if (component.dataset.scriptInitialized) return; component.dataset.scriptInitialized = "true"; const closePrevious = component.getAttribute("data-close-previous") !== "false"; const closeOnSecondClick = component.getAttribute("data-close-on-second-click") !== "false"; const openOnHover = component.getAttribute("data-open-on-hover") === "true"; const openByDefault = component.getAttribute("data-open-by-default") !== null && !isNaN(+component.getAttribute("data-open-by-default")) ? +component.getAttribute("data-open-by-default") : false; const list = component.querySelector("\[data-accordion='list'\]"); let previousIndex = null, closeFunctions = \[\]; function removeCMSList(slot) { const dynList = Array.from(slot.children).find((child) => child.classList.contains("w-dyn-list")); if (!dynList) return; const nestedItems = dynList?.firstElementChild?.children; if (!nestedItems) return; const staticWrapper = \[...slot.children\]; \[...nestedItems\].forEach(el => el.firstElementChild && slot.appendChild(el.firstElementChild)); staticWrapper.forEach((el) => el.remove()); } removeCMSList(list); component.querySelectorAll("\[data-accordion='component'\]").forEach((card, cardIndex) => { const button = card.querySelector("\[data-accordion='toggle'\]"); const content = card.querySelector("\[data-accordion='content'\]"); if (!button || !content ) return console.warn("Missing elements:", card); button.setAttribute("aria-expanded", "false"); button.setAttribute("id", "accordion\_button\_" + listIndex + "\_" + cardIndex); content.setAttribute("id", "accordion\_content\_" + listIndex + "\_" + cardIndex); button.setAttribute("aria-controls", content.id); content.setAttribute("aria-labelledby", button.id); content.style.display = "none"; const refresh = () => { tl.invalidate(); if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh(); }; const tl = gsap.timeline({ paused: true, defaults: { duration: 0.3, ease: "power1.inOut" }, onComplete: refresh, onReverseComplete: refresh }); tl.set(content, { display: "block" }); tl.fromTo(content, { height: 0 }, { height: "auto" }); const closeAccordion = () => card.classList.contains("is-opened") && (card.classList.remove("is-opened"), tl.reverse(), button.setAttribute("aria-expanded", "false")); closeFunctions\[cardIndex\] = closeAccordion; const openAccordion = (instant = false) => { if (closePrevious && previousIndex !== null && previousIndex !== cardIndex) closeFunctions\[previousIndex\]?.(); previousIndex = cardIndex; button.setAttribute("aria-expanded", "true"); card.classList.add("is-opened"); instant ? tl.progress(1) : tl.play(); }; if (openByDefault === cardIndex + 1) openAccordion(true); button.addEventListener("click", () => (card.classList.contains("is-opened") && closeOnSecondClick ? (closeAccordion(), (previousIndex = null)) : openAccordion())); if (openOnHover) button.addEventListener("mouseenter", () => openAccordion()); }); }); });

.button\_main\_icon { transition: color 300ms ease; } .button\_main\_wrap:hover .button\_main\_icon { color: var(--\_button-style---icon-hover); } .button\_main\_wrap:focus-within .button\_main\_icon { color: var(--\_button-style---text-hover) !important; } .button\_main\_wrap:focus-within { color: var(--\_button-style---text-hover) !important; }
