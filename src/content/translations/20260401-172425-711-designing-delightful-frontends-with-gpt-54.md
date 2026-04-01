---
title: "用 GPT-5.4 设计令人愉悦的前端"
originalTitle: "Designing delightful frontends with GPT-5.4"
date: 2026-04-01
originalUrl: https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
lang: zh
---

GPT-5.4 是比前代更出色的 Web 开发模型，能够生成更具视觉吸引力、也更有野心的前端。尤其值得一提的是，我们在训练 GPT-5.4 时，重点提升了它的 UI 能力以及对图像的使用能力。在恰当引导下，这个模型可以产出可用于生产环境的前端，并带有细腻的处理、精心打磨的交互和优美的图像内容。

Web 设计的结果空间非常大。优秀的设计会在克制与创造之间取得平衡，既借鉴那些经受住时间考验的模式，也引入新的东西。GPT-5.4 已经学习了这整套广泛的设计方法，也理解网站可以用许多不同方式构建。

当 prompt 约束不足时，模型往往会退回到训练数据里的高频模式。其中有些是被验证过的惯例，但也有很多只是被过度代表、而我们希望避免的习惯。结果通常看起来合理且能用，但很容易滑向泛化的结构、薄弱的视觉层级，以及那些达不到我们脑海中预期效果的设计选择。

这份指南会讲解一些实用技巧，帮助你把 GPT-5.4 引导到你真正想要的设计方向上。

[Video](https://cdn.openai.com/devhub/blog/landing_barber.mp4)

## 模型改进

虽然 GPT-5.4 在[多个维度](https://openai.com/index/introducing-gpt-5-4/)上都有提升，但在前端工作上，我们重点关注了三个实际收益：

- 在整个设计流程中具备更强的图像理解能力
- 能构建功能更完整的网站和应用
- 更善于使用工具去检查、测试并验证自己的工作

### 图像理解与工具使用

GPT-5.4 在训练中原生支持图像搜索和图像生成工具，因此可以把视觉推理直接纳入设计过程。为了得到最佳结果，你应该先让模型生成一个 mood board，或者先给出多个视觉方向备选，再从中挑选最终素材。

你可以通过明确描述图像需要呈现的属性，来引导模型找到更强的视觉参考，例如风格、配色、构图或情绪。你还应在 prompt 中加入指令，引导模型复用先前生成的图像、调用图像生成工具创建新的视觉素材，或者在必要时引用指定的外部图像。

```text
Default to using any uploaded/pre-generated images. Otherwise use the image generation tool to create visually stunning image artifacts. Do not reference or link to web images unless the user explicitly asks for them.
```

### 功能性提升

该模型经过训练，可以开发更完整、功能上更健全的应用。你可以期待它在长时程任务上表现得更可靠。那些你以前觉得不可能完成的游戏和复杂用户体验，现在往往只需一到两轮就能做出来。

### 计算机使用与验证

GPT-5.4 是我们第一款为计算机使用而训练的主线模型。它可以原生地操作界面，结合 Playwright 之类的工具后，还能迭代式地检查自己的工作、验证行为并优化实现，从而支持更长链路、更自主的开发工作流。

你可以观看我们的[发布视频](https://openai.com/index/introducing-gpt-5-4/?video=1170427106%20)，了解这些能力的实际表现。

Playwright 对前端开发尤其有价值。它允许模型检查渲染后的页面、测试多个视口、遍历应用流程，并发现状态管理或导航上的问题。为模型提供 Playwright 工具或 skill，会显著提高 GPT-5.4 产出精致且功能完整界面的概率。随着图像理解能力增强，Playwright 还让模型能够从视觉层面验证自己的工作，并在提供了参考 UI 时检查结果是否匹配。

## 实用技巧速览

如果你只打算采用本文中的少数几个做法，先从这些开始：

1. 先选择较低的 reasoning level。
2. 提前定义设计系统和约束条件，例如字体、配色和布局。
3. 提供视觉参考或 mood board，例如附上一张截图，为模型建立视觉护栏。
4. 提前定义叙事方式或内容策略，用来引导模型生成内容。

下面是一段可直接起步的 prompt。

```javascript
## Frontend tasks

When doing frontend design tasks, avoid generic, overbuilt layouts.

**Use these hard rules:**
- One composition: The first viewport must read as one composition, not a dashboard (unless it's a dashboard).
- Brand first: On branded pages, the brand or product name must be a hero-level signal, not just nav text or an eyebrow. No headline should overpower the brand.
- Brand test: If the first viewport could belong to another brand after removing the nav, the branding is too weak.
- Typography: Use expressive, purposeful fonts and avoid default stacks (Inter, Roboto, Arial, system).
- Background: Don't rely on flat, single-color backgrounds; use gradients, images, or subtle patterns to build atmosphere.
- Full-bleed hero only: On landing pages and promotional surfaces, the hero image should be a dominant edge-to-edge visual plane or background by default. Do not use inset hero images, side-panel hero images, rounded media cards, tiled collages, or floating image blocks unless the existing design system clearly requires it.
- Hero budget: The first viewport should usually contain only the brand, one headline, one short supporting sentence, one CTA group, and one dominant image. Do not place stats, schedules, event listings, address blocks, promos, "this week" callouts, metadata rows, or secondary marketing content in the first viewport.
- No hero overlays: Do not place detached labels, floating badges, promo stickers, info chips, or callout boxes on top of hero media.
- Cards: Default: no cards. Never use cards in the hero. Cards are allowed only when they are the container for a user interaction. If removing a border, shadow, background, or radius does not hurt interaction or understanding, it should not be a card.
- One job per section: Each section should have one purpose, one headline, and usually one short supporting sentence.
- Real visual anchor: Imagery should show the product, place, atmosphere, or context. Decorative gradients and abstract backgrounds do not count as the main visual idea.
- Reduce clutter: Avoid pill clusters, stat strips, icon rows, boxed promos, schedule snippets, and multiple competing text blocks.
- Use motion to create presence and hierarchy, not noise. Ship at least 2-3 intentional motions for visually led work.
- Color & Look: Choose a clear visual direction; define CSS variables; avoid purple-on-white defaults. No purple bias or dark mode bias.
- Ensure the page loads properly on both desktop and mobile.
- For React code, prefer modern patterns including useEffectEvent, startTransition, and useDeferredValue when appropriate if used by the team. Do not add useMemo/useCallback by default unless already used; follow the repo's React Compiler guidance.

Exception: If working within an existing website or design system, preserve the established patterns, structure, and visual language.
```

## 做出更好设计的技巧

### 从设计原则开始

预先定义约束条件，例如只允许一个 H1 标题、页面不超过六个 section、最多两种字体、一种强调色，以及首屏只有一个主要 CTA。

### 提供视觉参考

参考截图或 mood board 可以帮助模型推断布局节奏、字号层级、间距系统和图像处理方式。下面这个例子展示了 GPT-5.4 如何先为用户生成自己的 mood board，再让用户评审。

![用于引导 GPT-5.4 形成统一视觉方向的示例 mood board](https://cdn.openai.com/devhub/blog/codex_moodboard.png)

*由 GPT-5.4 在 Codex 中创建的 mood board，灵感来自 NYC 咖啡文化和 Y2K 美学*

### 把页面结构化成叙事

典型的营销页面结构如下：

1. Hero：建立身份与核心承诺
2. 支撑性图像：展示场景或环境
3. 产品细节：解释具体提供了什么
4. 社会证明：建立可信度
5. 最终 CTA：把兴趣转化为行动

### 明确要求遵循设计系统

鼓励模型在构建初期就建立清晰的设计系统。定义核心设计 token，例如 `background`、`surface`、`primary text`、`muted text` 和 `accent`，以及 `display`、`headline`、`body`、`caption` 这样的排版角色。这套结构能帮助模型在整个应用中产出一致、可扩展的 UI 模式。

对于大多数 Web 项目，从熟悉的技术栈开始通常效果最好，例如 **React and Tailwind**。GPT-5.4 在这套工具上的表现尤其强，更容易快速迭代，并达到更成熟的效果。

动效和分层 UI 元素会引入复杂度，尤其是在 fixed 或 floating 组件与主要内容发生交互时。处理动画、叠层或装饰性图层时，最好加入一些能鼓励安全布局行为的指令。例如：

```text
Keep fixed or floating UI elements from overlapping text, buttons, or other key content across screen sizes. Place them in safe areas, behind primary content where appropriate, and maintain sufficient spacing.
```

### 适当降低推理强度

对于较简单的网站，更多 reasoning 并不总是更好。实践中，**low 和 medium reasoning level 往往能带来更强的前端结果**，因为这样能让模型保持更快、更聚焦，也更不容易过度思考；而在遇到更有野心的设计时，你仍然保留了继续提高推理强度的空间。

### 用真实内容把设计落地

给模型提供真实文案、产品上下文或明确的项目目标，是提升前端结果最简单的方法之一。这些上下文能帮助它选择合适的网站结构，形成更清晰的 section 级叙事，也能写出更可信的内容，而不是退回到泛化的占位文本模式。

## 用 Frontend Skill 把这些串起来

为了帮助大家在通用前端任务中更好地发挥 GPT-5.4 的能力，我们还准备了一个专门的 [`frontend-skill`](https://github.com/openai/skills/tree/main/skills/.curated/frontend-skill)，你可以在下方找到。它会在结构、品味和交互模式上给模型更强的引导，让它默认就能产出更精致、更有明确意图、也更令人愉悦的设计。

Frontend Skill

```text
---
name: frontend-skill
description: Use when the task asks for a visually strong landing page, website, app, prototype, demo, or game UI. This skill enforces restrained composition, image-led hierarchy, cohesive content structure, and tasteful motion while avoiding generic cards, weak branding, and UI clutter.
---

# Frontend skill

Use this skill when the quality of the work depends on art direction, hierarchy, restraint, imagery, and motion rather than component count.

Goal: ship interfaces that feel deliberate, premium, and current. Default toward award-level composition: one big idea, strong imagery, sparse copy, rigorous spacing, and a small number of memorable motions.

## Working Model

Before building, write three things:

- visual thesis: one sentence describing mood, material, and energy
- content plan: hero, support, detail, final CTA
- interaction thesis: 2-3 motion ideas that change the feel of the page

Each section gets one job, one dominant visual idea, and one primary takeaway or action.

## Beautiful Defaults

- Start with composition, not components.
- Prefer a full-bleed hero or full-canvas visual anchor.
- Make the brand or product name the loudest text.
- Keep copy short enough to scan in seconds.
- Use whitespace, alignment, scale, cropping, and contrast before adding chrome.
- Limit the system: two typefaces max, one accent color by default.
- Default to cardless layouts. Use sections, columns, dividers, lists, and media blocks instead.
- Treat the first viewport as a poster, not a document.

## Landing Pages

Default sequence:

1. Hero: brand or product, promise, CTA, and one dominant visual
2. Support: one concrete feature, offer, or proof point
3. Detail: atmosphere, workflow, product depth, or story
4. Final CTA: convert, start, visit, or contact

Hero rules:

- One composition only.
- Full-bleed image or dominant visual plane.
- Canonical full-bleed rule: on branded landing pages, the hero itself must run edge-to-edge with no inherited page gutters, framed container, or shared max-width; constrain only the inner text/action column.
- Brand first, headline second, body third, CTA fourth.
- No hero cards, stat strips, logo clouds, pill soup, or floating dashboards by default.
- Keep headlines to roughly 2-3 lines on desktop and readable in one glance on mobile.
- Keep the text column narrow and anchored to a calm area of the image.
- All text over imagery must maintain strong contrast and clear tap targets.

If the first viewport still works after removing the image, the image is too weak. If the brand disappears after hiding the nav, the hierarchy is too weak.

Viewport budget:

- If the first screen includes a sticky/fixed header, that header counts against the hero. The combined header + hero content must fit within the initial viewport at common desktop and mobile sizes.
- When using `100vh`/`100svh` heroes, subtract persistent UI chrome (`calc(100svh - header-height)`) or overlay the header instead of stacking it in normal flow.

## Apps

Default to Linear-style restraint:

- calm surface hierarchy
- strong typography and spacing
- few colors
- dense but readable information
- minimal chrome
- cards only when the card is the interaction

For app UI, organize around:

- primary workspace
- navigation
- secondary context or inspector
- one clear accent for action or state

Avoid:

- dashboard-card mosaics
- thick borders on every region
- decorative gradients behind routine product UI
- multiple competing accent colors
- ornamental icons that do not improve scanning

If a panel can become plain layout without losing meaning, remove the card treatment.

## Imagery

Imagery must do narrative work.

- Use at least one strong, real-looking image for brands, venues, editorial pages, and lifestyle products.
- Prefer in-situ photography over abstract gradients or fake 3D objects.
- Choose or crop images with a stable tonal area for text.
- Do not use images with embedded signage, logos, or typographic clutter fighting the UI.
- Do not generate images with built-in UI frames, splits, cards, or panels.
- If multiple moments are needed, use multiple images, not one collage.

The first viewport needs a real visual anchor. Decorative texture is not enough.

## Copy

- Write in product language, not design commentary.
- Let the headline carry the meaning.
- Supporting copy should usually be one short sentence.
- Cut repetition between sections.
- do not include prompt language or design commentary into the UI
- Give every section one responsibility: explain, prove, deepen, or convert.

If deleting 30 percent of the copy improves the page, keep deleting.

## Utility Copy For Product UI

When the work is a dashboard, app surface, admin tool, or operational workspace, default to utility copy over marketing copy.

- Prioritize orientation, status, and action over promise, mood, or brand voice.
- Start with the working surface itself: KPIs, charts, filters, tables, status, or task context. Do not introduce a hero section unless the user explicitly asks for one.
- Section headings should say what the area is or what the user can do there.
- Good: "Selected KPIs", "Plan status", "Search metrics", "Top segments", "Last sync".
- Avoid aspirational hero lines, metaphors, campaign-style language, and executive-summary banners on product surfaces unless specifically requested.
- Supporting text should explain scope, behavior, freshness, or decision value in one sentence.
- If a sentence could appear in a homepage hero or ad, rewrite it until it sounds like product UI.
- If a section does not help someone operate, monitor, or decide, remove it.
- Litmus check: if an operator scans only headings, labels, and numbers, can they understand the page immediately?

## Motion

Use motion to create presence and hierarchy, not noise.

Ship at least 2-3 intentional motions for visually led work:

- one entrance sequence in the hero
- one scroll-linked, sticky, or depth effect
- one hover, reveal, or layout transition that sharpens affordance

Prefer Framer Motion when available for:

- section reveals
- shared layout transitions
- scroll-linked opacity, translate, or scale shifts
- sticky storytelling
- carousels that advance narrative, not just fill space
- menus, drawers, and modal presence effects

Motion rules:

- noticeable in a quick recording
- smooth on mobile
- fast and restrained
- consistent across the page
- removed if ornamental only

## Hard Rules

- No cards by default.
- No hero cards by default.
- No boxed or center-column hero when the brief calls for full bleed.
- No more than one dominant idea per section.
- No section should need many tiny UI devices to explain itself.
- No headline should overpower the brand on branded pages.
- No filler copy.
- No split-screen hero unless text sits on a calm, unified side.
- No more than two typefaces without a clear reason.
- No more than one accent color unless the product already has a strong system.

## Reject These Failures

- Generic SaaS card grid as the first impression
- Beautiful image with weak brand presence
- Strong headline with no clear action
- Busy imagery behind text
- Sections that repeat the same mood statement
- Carousel with no narrative purpose
- App UI made of stacked cards instead of layout

## Litmus Checks

- Is the brand or product unmistakable in the first screen?
- Is there one strong visual anchor?
- Can the page be understood by scanning headlines only?
- Does each section have one job?
- Are cards actually necessary?
- Does motion improve hierarchy or atmosphere?
- Would the design still feel premium if all decorative shadows were removed?
```

在 Codex 应用中，可以通过下面这条命令安装 `frontend-skill`：

```text
$skill-installer frontend-skill
```

下面是一些借助 Frontend Design skill 生成的网站示例。

### 落地页

### 游戏

### 仪表盘

## 关键结论

当 prompt 明确提供设计约束、视觉参考、结构化叙事和设计系统时，GPT-5.4 就能够生成高质量的前端界面。

我们希望这些技巧能帮助你构建更有辨识度、设计更成熟的应用。

如果你想分享一个完全由 GPT-5.4 和类似 [Codex](http://developers.openai.com/codex) 这样的编码 agent 生成的项目，可以把你的应用提交到我们的 [gallery](http://developers.openai.com/showcase) 中展示。
