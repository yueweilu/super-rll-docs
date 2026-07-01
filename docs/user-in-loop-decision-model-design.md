# User-in-the-Loop Development Decision Model — Design (research)

> **来源**(用户 2026-06-11):从"测试门禁太死板造成浪费"一路推到 →「judge-recommend + user-approve」→
> "这不止是测试门禁,**整个开发过程里什么决策该升级给用户**?"。
> **目标**:统一回答"开发过程中**什么决策该升级给用户、什么自主推进**",把这几次提的**三个洞收进一个框架**:
> (1) 弱模型失控 (2) 防浪费 (3) 用户在环。**测试要求只是其中一个 case。**
> **状态**:research-only 设计 doc,零实现代码。实现按文末 slice 队列后续开。

---

## 0. 问题:决策升级是零散的、要么硬要么靠手感

现在 RLL 对"什么该让用户拍"处理得**不统一**:

| 决策 | 现状 | 毛病 |
|---|---|---|
| scope / negative-scope | CLARIFY(§128)+ 我偶尔 push | 半结构化,容易漏 |
| 设计-approach 岔路(A/B/C) | 有时 AskUserQuestion,有时自作主张 | **靠 agent 手感** → 弱模型会乱拍 |
| 测试要求(测什么) | rigid `default_baseline` 硬压 | **硬规则跟任务实际形态打架**(doc-only 摩擦的根) |
| 风险外部动作(commit/push/发外/花钱) | §49 #5 必须授权 | 这条**已经**是对的模式 |

观察:**风险动作那条(§49#5)已经是"判断 + 升级用户"**。问题是其它三类没收敛到同一条路 —— 有的硬规则、有的靠手感、有的零散 push。弱模型一来,"靠手感"那部分直接塌。

---

## 1. 统一原则

### P1 — 一条主路:judge → recommend → approve/suggest
```
对每个决策点:
  escalate := agent 判断"这是用户的决策"(P2 判据)
  若 escalate → 给【推荐】+ 收用户【批准 / 建议】→ 按用户回复推进
  否则        → 自主推进(把判定理由留痕,可被 Lisa/用户事后 verify)
```
四类决策点全走这一条路,替换掉"硬规则 + 手感 + 零散 push"的拼盘。

### P2 — "该不该升级"必须 **zero-cost**(Lisa carry-forward 锁)
判断"要不要升级给用户"**不能再花一次昂贵资源**(尤其不能"用强模型判断要不要问用户/问模型"——那是循环)。
"zero-cost" 的精确定义:
- **机械信号**(grep / git-diff / count / 不可逆标志位):纯免费,见 P3 每类。
- **agent 本轮已有的推理**:Ralph 本来每轮就是 LLM 在想;"注意到这是个岔路"是它**顺带**产出的,**不额外起一次模型调用**。
- ✗ **禁止**:为了"决定要不要问用户"而**专门**再调一次(强)模型。那既是浪费(你最初的痛),也是循环。

> 跟视觉门的触发谓词同源:**判断该不该惊动昂贵资源(用户注意力 / vision call)这一步本身必须便宜。**

### P3 — 弱模型 guard:越弱/越不确定 → 升级门槛越低
强模型可多自主;弱模型 / 高不确定 → **更多决策交用户**。门槛是**可调的滑块**,不是开关(见 §4)。

---

## 2. 四类决策点 + 每类 zero-cost 升级判据

| 决策类 | zero-cost 升级判据(全免费可评估) | 复用机制 |
|---|---|---|
| **C1 scope / negative-scope** | scope-shift signal(§212 关键词:`/task`、"新任务"、"顺便"、跨当前 slice scope 的对话)/ 新外部接触面(diff 碰新 package/API) → **升级** | CLARIFY §128 + §212 task-intake |
| **C2 设计-approach 岔路** | agent 本轮推理识别"真岔路" = **多个可行解 ∧ 后果差异大 ∧ 部分不可逆**(三者皆机械可标:解数≥2、是否碰数据/外发、是否难回退)→ 升级;单解 / 后果小 / 易回退 → 自主 | AskUserQuestion(决策卡) |
| **C3 测试要求**(*one sub-case*) | complexity-judge 推荐 tiers(已产出)+ **code-bearing → 软地板**(碰代码至少 unit,低于需理由);doc-only → 无地板。判据:`task_type` + diff 是否碰代码(机械)→ 决定是否需用户批 tier 集 | userGate test-gate(已存在,authoritative over baseline) |
| **C4 风险外部动作** | 不可逆 ∨ 外部副作用(commit/push/发外/花钱/改他人仓)→ **永远升级**(机械:动作类型白名单) | §49#5 wecom-push 授权 + approval gate §SR4 |

**关键**:C3(测试)是**一个 case**,跟 C1/C2/C4 同构,**不是模型的中心**(Lisa carry-forward)。rigid baseline 的痛 = C3 缺了"judge 推荐 + 用户批 + 软地板",现在补齐就跟其它三类一样。

### 2.1 升级判据为什么 zero-cost(逐类证明,反循环)
- **C1**:scope-shift = 关键词 grep + diff 新接触面 → 纯机械,无模型。
- **C2**:"解数≥2 / 碰数据外发 / 难回退" 三个子信号都机械可标;agent **本轮已在想方案**,识别"这是岔路"是顺带的,不额外调模型。
- **C3**:`task_type`(§207 SoR)+ diff 碰代码 → 机械;tier 推荐是 complexity-judge **已经产出**的,不新增调用。
- **C4**:动作类型(commit/push/外发)是机械白名单匹配。
→ 四类**没有一类**需要"专门再调一次模型来决定要不要问用户"。**反循环成立。**

---

## 3. 推荐 + 批准/建议 的交互(复用,不重造)

升级时的交互,**全部复用现有零散件**,本模型只是把它们收到一条主路:

| 场景 | 复用件 |
|---|---|
| 在场(终端/IDE)决策卡 | **AskUserQuestion**(A/B/C + 推荐 + 默认) |
| off-laptop | **WeCom push §49#5**(选项+推荐+默认=停)+ voice 回 |
| 测试决定落地 | **userGate test-gate**(用户确认的测试决定 authoritative over baseline) |
| owner_only 外发/改动 | **approval gate §SR4**(park 草稿 + 远程一句话定夺) |
| scope 澄清 | **CLARIFY §128**(5-stage grill + negative_scope) |

本模型的增量 = **一个统一的"决策升级"判定层** + **把上述件挂到它后面**,而不是各处各判。

---

## 4. 弱模型 guard(接弱模型洞)— 门槛滑块

升级门槛 = 滑块,按 (a) 模型强度 (b) agent 自评不确定性 调:

```
escalation_threshold = f(model_tier, self_uncertainty)
  强模型 + 低不确定 → 门槛高(多自主,少打扰)
  弱模型 / 高不确定 → 门槛低(多升级给用户)
```
- **model_tier**:从 session model id 读(零成本,已知)。
- **self_uncertainty**:agent 本轮顺带自评(0-1,不额外调用);或机械近似(复杂度 class / 改动足迹)。
- 效果:**弱模型当 Ralph 时,自动更多地把决策交给用户** → 直接补弱模型"自主走错路"的洞;同时强模型不被过度打扰(防浪费)。

> 这把三个洞收进一个旋钮:**门槛低 = 多用户在环(治弱模型);门槛高 = 多自主(省用户注意力)。**

---

## 5. 防双向浪费(你最初的痛,量化进判据)

| 浪费方向 | 来源 | 本模型怎么防 |
|---|---|---|
| **问太多** | 每个小决策都打扰用户 | 判据有门槛(P3 滑块);易回退/单解/小后果 → 自主不问 |
| **问太少** | 自主走错路 → 返工(弱模型尤甚) | C1-C4 判据命中即升级;弱模型门槛自动降低 |

平衡点由 §4 滑块定。complexity-judge 可顺带输出"决策密度/不确定性"喂滑块(不新增调用)。

---

## 6. 实现 slice 队列(按 failure-mode)

| Failure-mode | 首道 slice | 内容 |
|---|---|---|
| **测试要求 rigid → 摩擦/浪费**(已部分修) | **U1** `test-requirement-judge-approve` | C3:complexity 推荐 tiers + userGate 用户批 + code-bearing 软地板;rigid baseline 降 fallback。**subsume bug1/2 摩擦**(capability/freshness) |
| **设计岔路靠手感 → 弱模型乱拍** | **U2** `design-fork-escalation` | C2:agent 识别真岔路(解数/不可逆/后果)→ AskUserQuestion 推荐+批 |
| **scope 漂移没收口** | **U3** `scope-escalation` | C1:scope-shift signal → CLARIFY/task-intake 统一升级 |
| **升级门槛不分模型强度** | **U4** `escalation-threshold-slider` | §4 滑块:model_tier + uncertainty 调门槛(弱模型 guard) |
| **统一判定层缺** | **U5** `decision-escalation-layer` | 把 C1-C4 判定 + 复用件挂到一条主路(收口件) |

**推荐序**:U1(测试,最痛 + subsume bug1/2,先行)→ U4(滑块,弱模型 guard 地基)→ U2 → U3 → U5(收口统一层)。
> U1 先行直接缓解当前 rigid-baseline 浪费 + 化解 bug1/2;U4 早做给后面所有判据一个统一的弱模型护栏。

---

## 7. 与三个洞的关系(收口)
- **弱模型失控** → §4 滑块(弱 → 多升级用户)+ weak-agent-quality-floor 视觉门(另 doc)互补:决策端 + 输出端双护栏。
- **防浪费** → P2 zero-cost 判据 + §5 双向平衡 + U1 化解 rigid baseline。
- **用户在环** → P1 主路 + §3 复用件统一。
一个框架,一个旋钮(门槛),三洞同治。

## 附:引用的现有真实件
§49#5 wecom-push 授权 / §128 CLARIFY / §212 task-intake / §SR4 approval gate(owner_only)/ userGate test-gate(`complexity-verify.ts` Cluster B,authoritative over baseline)/ AskUserQuestion / §207 task_type SoR / complexity-judge tier 推荐。相关输出端设计:`docs/weak-agent-quality-floor-design.md`。
