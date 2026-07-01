# Ralph-Lisa 使用分享：从协作流程到 Test Harness 证据机制

**分享日期**: 2026-06-05  
**建议时长**: 20-30 分钟  
**定位**: 团队分享材料，讲 Ralph-Lisa 怎么用，并重点说明 test harness 为什么重要。

---

## 1. 分享目标

这次分享不是讲某个测试工具，也不是讲源码实现，而是讲清楚三件事：

```text
1. Ralph-Lisa 是什么。
2. 我们日常怎么用 Ralph-Lisa。
3. Test harness 在这个流程里解决什么问题。
```

一句话概括：

```text
Ralph-Lisa 让 AI 协作有流程；test harness 让 AI 交付有证据。
```

---

## 2. Ralph-Lisa 是什么

Ralph-Lisa 是一套双 Agent 协作机制。

可以把它理解成三个角色：

| 角色 | 职责 |
|---|---|
| Ralph | 主开发者，负责计划、实现、验证和提交 |
| Lisa | Reviewer，负责审查计划、实现、测试证据和风险 |
| Human | 技术负责人，负责目标、范围、取舍和最终判断 |

它的核心思想是：

```text
一个 Agent 不审查自己的产出。
```

Ralph 负责做，Lisa 负责挑问题。这样可以减少单 Agent 自写自审带来的风险。

---

## 3. Ralph-Lisa 的基本流程

Ralph-Lisa 的流程可以概括为：

```text
用户提出任务
    ↓
Ralph 给计划
    ↓
Lisa 审计划
    ↓
Ralph 实现并验证
    ↓
Lisa 审实现和证据
    ↓
通过则共识，失败则回到 Ralph 修复
```

简化一下就是：

```text
Plan -> Implement -> Verify -> Review -> Fix -> Consensus
```

RLL 的价值不是“让 AI 自己乱跑”，而是让 AI 协作变得有结构、有审查、有记录。

---

## 4. 日常使用方式

这里只保留最常用的几个命令。

新项目先初始化：

```bash
ralph-lisa init
```

启动自动协作任务：

```bash
ralph-lisa auto --full-auto "实现用户登录功能"
```

这两个命令已经足够讲清楚普通使用路径。其他子命令可以等需要排查或维护时再看。

---

## 5. 为什么只靠 Lisa Review 还不够

双 Agent review 很重要，但它还不够。

如果 Ralph 只是说：

```text
我已经测试过了。
```

Lisa 如果只看这句话，其实还是在相信 Ralph 的描述。

更可靠的方式应该是：

```text
Ralph 给出真实验证过程和结果。
Lisa 基于真实证据判断是否通过。
```

这就是 test harness 在 Ralph-Lisa 里的位置。

---

## 6. Test Harness 是什么

Test harness 可以理解为“测试运行和证据收集的外壳”。

它本身不是某一个具体测试框架，也不是替代项目已有的测试体系。项目原来用单元测试、接口测试、浏览器测试、终端验证，仍然继续用原来的方式。Test harness 的作用，是把这些验证方式接入 Ralph-Lisa 流程，让验证结果变成可复查的证据。

可以简单理解为：

```text
原有测试 / 真实操作
    ↓
Test harness 负责运行、观察、记录
    ↓
生成报告、日志、artifact
```

所以它不是为了“多写测试”，而是为了回答一个问题：

```text
AI 说做完了，我们有什么真实证据可以相信？
```

---

## 7. Test Harness 起什么作用

Test harness 不是让大家多记几个测试命令。它在 RLL 里更像一套“证据机制”。

它负责把 Ralph 的产出接到真实环境里验证，然后留下 Lisa 和人都能复查的证据。

它在流程里的位置可以这样理解：

```text
Ralph 产出
    ↓
Test harness 真实验证
    ↓
生成证据 / 报告 / artifact
    ↓
Lisa 基于证据 review
    ↓
Human 基于证据判断风险
```

一句话：

```text
Ralph-Lisa 管协作流程，test harness 管真实证据。
```

---

## 8. 有无 Test Harness 的区别

没有 harness 时，流程容易变成：

```text
Ralph: 我做完了，也测过了。
Lisa: 我看了，感觉可以。
```

问题是：

- 没有真实命令。
- 没有真实输出。
- 没有可复查 artifact。
- 失败后也没有清晰上下文。

有 harness 后，流程应该变成：

```text
Ralph: 我跑了验证，结果和证据在这里。
Lisa: 我检查了证据，再决定是否通过。
```

这就是从“口头完成”变成“证据完成”。

---

## 9. Ralph 和 Lisa 应该怎么配合证据

Ralph 提交实现或修复时，至少应该说明三件事：

```text
Test-Process: 怎么验证的
Test-Cases: 覆盖了哪些场景
Test-Results: 结果是什么
```

大家不用死记格式，只要记住这三个问题：

```text
怎么测？
测了什么？
结果如何？
```

Lisa 如果要 PASS，也不应该只写：

```text
LGTM
```

而应该基于证据 review。核心是：

```text
Verified: <artifact>
```

这代表 Lisa 的通过不是主观感觉，而是有证据来源。

---

## 10. Test Harness 带来的质量提升

它主要提升四件事：

1. **防止空口测试**  
   Ralph 不能只说“测过了”，要给出验证过程和结果。

2. **防止空口 PASS**  
   Lisa 不能只说“看起来可以”，要引用证据。

3. **让覆盖更完整**  
   不是只跑最容易的一层测试，而是根据任务需要逐步覆盖主流程、集成、端到端等风险。

4. **失败后更容易修**  
   Harness 的报告能告诉我们失败在哪一步、原因是什么、证据在哪里。

---

## 11. Test Harness 带来的效率提升

效率提升主要体现在三点：

1. **减少 review 往返**  
   没有证据的问题可以更早暴露，不需要 Lisa 花一轮 review 才指出。

2. **减少人工追问**  
   报告里有验证过程、结果和 artifact，不用反复问“你怎么跑的、日志在哪里”。

3. **主链路验证可复用**  
   CLI、Skill、Web 这些主流程一旦有了 harness，后续可以反复跑，交接也更容易。

---

## 12. 示例场景

假设任务是：

```text
实现用户登录功能。
```

Ralph-Lisa 应该这样工作：

```text
Ralph 先给计划:
  登录主流程是什么？
  哪些场景必须验证？
  通过标准是什么？

Lisa 审计划:
  是否漏掉错误输入？
  是否考虑异常状态？
  验证方式是否可信？

Ralph 实现并验证:
  运行真实验证。
  说明覆盖场景和结果。
  留下 artifact。

Lisa 审实现和证据:
  代码是否合理？
  证据是否可信？
  是否可以 PASS？
```

这个例子想说明：test harness 不是独立存在的，它嵌在 Ralph-Lisa 的协作流程里，让“完成”变得可验证。

---

## 13. 总结

Ralph-Lisa 的核心是：

```text
让 AI 协作有角色、有流程、有审查。
```

Test harness 的核心是：

```text
让 AI 交付有真实、有证据、有回溯。
```

两者结合后，团队得到的不是“AI 自己说完成了”，而是：

```text
Ralph 做了什么
怎么验证的
Lisa 为什么通过
证据在哪里
失败怎么修
风险由谁判断
```

最后一句话收尾：

```text
Ralph-Lisa 让 AI 工作有流程，test harness 让 AI 工作有证据。
```
