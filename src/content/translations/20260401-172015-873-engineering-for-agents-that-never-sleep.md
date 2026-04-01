---
title: "为永不休眠的智能体做工程"
originalTitle: "Engineering for Agents That Never Sleep"
date: 2026-04-01
originalUrl: https://x.com/dabit3/status/2038608435105726862
lang: zh
---

在 Cognition，目前 70% 的 Devin 会话仍然由人发起（通过 [webapp](https://app.devin.ai/)、Slack 或 Linear）。另外 30% 则通过 [API](https://docs.devin.ai/api-reference/overview)、[scheduled sessions](https://docs.devin.ai/product-guides/scheduled-sessions)、[scheduled Devins](https://cognition.ai/blog/devin-can-now-schedule-devins) 以及其他自动化方式自动启动。

这个比例还会继续反转。[再过几个月](https://x.com/ScottWu46/status/2035106171984773508)，它很可能会变成 30/70。一年之内，可能会到 10/90。

有意思的问题在于，为什么会这样。

大多数触发工程工作的信号，其实早就已经是机器可读的了。告警触发了。测试失败了。项目看板上的规范被批准了。部署上线后，延迟突然飙升。

而现在，还是需要一个人先读到这个信号，切换上下文，打开一个会话，再输入一段 prompt，把那个信号已经表达过的内容再告诉智能体一遍。

这个人实际上是在两个本可以直接通信的系统之间充当中继。一旦你从这个角度去看，prompt 就成了瓶颈。无论是告警、失败的测试，还是已经批准的规范，这些都可以直接触发一个智能体。

工程师的工作会变成：设计一整套触发器、约束条件和质量闸门，让智能体能够稳定地自行运行。

云端智能体是这个体系的基础。如果一个智能体只会在某个人打开 IDE 时才存在，你就无法把它接入事故响应流水线。只有当智能体拥有自己的算力时，这件事才成立。

前提条件并不光鲜，但非常真实：要有完备的单元测试，让智能体可以验证自己的输出；要有良好的文档，让智能体无需反复提问也能获得上下文；要有可复现的开发环境，让智能体无需额外定制配置就能运行代码。

还要有丰富的系统级上下文，让智能体理解架构、约定，以及各个服务之间如何交互，而不是只知道单个仓库里的内容。

这些脚手架决定了一个智能体只是能开一个 PR，还是能在凌晨 3 点直接处置掉一次事故。没有这些，你得到的是会写代码的智能体；有了这些，你得到的是能交付软件的智能体。

prompt 输入框依然会存在，但在最优秀的团队里，大多数工作会在任何人打开它之前，就已经开始推进了。

> *借助 [Devin](https://devin.ai/)，我们认为这就是趋势将要去往的方向。如果你想了解更多，[欢迎联系我们](https://cognition.ai/contact)。
