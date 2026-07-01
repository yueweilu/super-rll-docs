# Weak-Agent Quality Floor — Design (research)

> **问题**(用户 2026-06-11):一旦 Ralph/Lisa 换较弱的模型/agent,输出变得很不可控 —— 生成的 app UI 非常糟糕、设计不全。
> **追加约束**(用户 2026-06-11):关键是**视觉质量门如何实现 + 何时调用**;绝不能在不必要时调用(强 vision 模型很贵 → 造成浪费)。
> **目标**:给 RLL 加一道**不依赖生成模型强度的质量地板**。
> **状态**:research-only 设计 doc,零实现代码。实现按文末 slice 队列后续逐个开。

---

## 0. 根因:门禁管"过程/测试通过",不管"主观输出质量"

RLL 现有门禁(§102 TDD / §133 policy-block / §137 claim-verify / §149 attest / §157 confirmation)验的是:**测试过没过、attest 全不全、复杂度判没判、claim 真不真、correctness**。

它们**没有任何一道在验"这个 UI 好不好、设计全不全"**。后果:

- **强模型**:质量是模型**自带**的 —— 它顺手把 UI 设计好,门禁不查也没事。
- **弱模型**:质量**没有地板** —— 它能把全部机械门禁过掉(测试绿、attest 齐、Lisa 也 PASS),同时吐出烂 UI。因为没有门在查完整性/视觉质量。

> **结论**:当前 `质量 = f(生成模型强度)`,**无下限**。换弱模型 = 下限塌掉。

---

## 1. 设计原则

### P1 — 解耦"生成"与"评判",让评判端始终强
弱模型当"手"(填代码),**别让它当"眼睛/品味"**。把贵的判断只花在关键阶段:plan/设计 + Lisa-review + 视觉 QA 用**强模型**,CODE 用弱模型。"强脑子 + 弱手"。

### P2 — 把"好 UI"从主观拆成可机械核验的清单
弱模型判断不了"好不好",但能**照具体清单填**。把"好 UI" → "必须有这 N 个具体东西"(三态/响应式/label/token/对比度),大多机械可查。

### P3 ★ — 便宜机械门当"门卫",守住昂贵的 vision 门(直接回应用户的成本约束)
**"要不要调 vision"这一步本身必须零模型成本。** 只有当一串免费的机械前置条件**全部为真**时,才花那一次 vision call。这是整套设计的成本核心(§4 展开)。

### P4 — 缩小弱模型的解空间
给弱模型 curated 组件库 + 页面模板 + design token,它只"组装已知好的零件",不"从零设计"。可错的空间被大幅压缩。

---

## 2. 候选机制矩阵(挂载点 + rubric/谓词 + 成本 + 取舍)

| 机制 | 做什么 | 挂载点(现有 §) | rubric/谓词 | 成本 | 取舍 |
|---|---|---|---|---|---|
| **A 视觉质量评分门** ★ | UI slice 产截图 → 强 vision 模型按 rubric 打分,不达标 NEEDS_WORK | 扩 **§151** visual-evidence(现仅查"截图存在"→升级"截图过 rubric") | §3 的 5 维 rubric | **高**(vision call/次)→ 靠 §4 触发纪律压到 1-2 次/slice | 唯一能抓"主观视觉烂"的门;成本敏感,触发必须严 |
| **B 机械 UI 完整性门** | axe-core a11y + loading/empty/error 三态存在性 + 响应式断点截图 | 新 tier,挂 §102 测试表 | 纯机械断言(无模型) | **极低**(本地跑) | 抓得了"缺三态/无障碍违规/断点塌",抓不了"丑/层次乱";**当 A 的前置门卫** |
| **C 模型按 phase 路由** ★ | plan / Lisa-review / 视觉QA→强模型;code→弱模型 | RLL engine model 路由(新) | n/a(配置) | 省钱(弱模型跑量大的 code) | 直接给"评判端"加强;需 engine 支持 per-phase model |
| **D 模板/组件库约束** | curated 组件库 + 页面模板 + design token,弱模型只组装 | preset 层(`cli/templates/presets/`) | preset schema | 低(一次性建库) | 大幅压缩解空间;限制了"自由设计"(对 app 生成正好是优点) |
| **E UI-spec CLARIFY** | UI 任务 PLAN 强制产具体 UI spec(组件清单+三态+文字 wireframe) | 扩 **§128** CLARIFY | spec 必填字段 | 低 | 钉死靶子,减少弱模型乱发挥;靠 spec 质量 |

★ = 最高杠杆。**推荐主线 = A + C + B(B 当 A 的门卫)**。D/E 是增强,留后续。

### 2.1 各机制的具体验收谓词(B/C/D/E;A 的 rubric 见 §3)

**B — 机械 UI 完整性门(全部机械可判,无模型)**
```
b_pass(route) :=
   axe(route).violations.filter(sev ∈ {critical, serious}).length == 0   // axe-core 严重度阈值:serious+ 必须为 0(moderate/minor 仅 warn)
 ∧ has_state(route, "loading") ∧ has_state(route, "empty") ∧ has_state(route, "error")
       // 三态检测法:组件树/快照中存在标注 data-state="loading|empty|error" 的节点,或测试驱动三态各截一图
 ∧ ∀ bp ∈ {375,768,1440}: no_overflow(bp) ∧ no_overlap(bp)
       // overflow: document.scrollWidth ≤ viewport.width + 1px(无横向滚);overlap: 关键容器 boundingRect 不相交
```

**C — 模型按 phase 路由(配置;强制项 + fallback)**
- **强模型强制**:`[PLAN]` / `[TDD-PLAN]` / `[CLARIFY]` / Lisa review / 视觉 QA(§4 vision call)。
- **弱模型允许**:`[CODE]` / `[FIX]` 代码生成。
- **fallback/override**:强模型不可得 → `RL_PHASE_MODEL_FALLBACK=warn`(降级跑+告警,不阻断);用户可 `phase_models` 显式覆盖单 phase;**评判端(review + 视觉门)不允许降级到弱模型**(地基红线,降级需 user ack)。
- 配置 schema:`gate-manifest.json.phase_models = { plan, tdd_plan, clarify, code, fix, review, visual_qa }`,值 = model id;缺省 = 当前 session model。

**D — 模板/组件库约束(preset 最小约束)**
- preset 必含:`component_library`(引用,如 shadcn/ui)+ `page_templates`(≥1 layout)+ `design_tokens`(color/spacing/typography scale)。
- 验收谓词:`d_pass := 生成代码中颜色/间距/字号引用 token(无硬编码 hex/px 魔数,阈值:硬编码 token-able 值 ≤ N)∧ 页面结构复用已声明 template(非从零 div 堆)`。
- 挂 `cli/templates/presets/*.json` 的可选 `ui_constraints` 字段。

**E — UI-spec CLARIFY 必填字段(扩 §128)**
```
ui_spec := {
  routes:        [{ path, purpose }],                 // 每个页面/路由
  components:    [{ name, where }],                   // 组件清单
  states:        per-route { loading, empty, error }, // 三态各自的行为/文案
  copy:          关键文案(标题/CTA/空态提示),         // 防 lorem/占位
  responsive:    每断点(375/768/1440)的布局变化说明,
  negative_scope: ✗ 不做的页面/交互                    // 防 over-build
}
ui_spec_pass := 上述 6 字段非空 ∧ 每 route 三态都有说明
```

---

## 3. 视觉质量门 — HOW(机制实现)

### 3.1 截图怎么产
复用 **§151 visual-evidence** 的 playwright 截图路径(`ralph-lisa visual-evidence add --file <screenshot>`,`.dual-agent/visual-evidence/`)。新增:对每个声明的 route/断点各产一张(375 / 768 / 1440 px)。

### 3.2 rubric(5 维,强 vision 模型按此打分 → 结构化输出)
```jsonc
{
  "completeness":   "页面是否完整(无半截/占位/lorem/空白大块)? 0-5",
  "hierarchy":      "视觉层次(主次/对齐/留白/分组)是否清晰? 0-5",
  "states":         "loading/empty/error 三态是否都呈现(或截图覆盖)? 0-5",
  "responsive":     "375/768/1440 是否都不塌(无横向滚/重叠/溢出)? 0-5",
  "consistency":    "色/字号/间距是否走 token,一致无杂? 0-5",
  "defects":        ["具体缺陷列表,每条 = 哪个元素 + 什么问题"],
  "verdict":        "pass | fail",
  "blocking_reason":"fail 时的最关键 1-2 条"
}
```
- **pass 阈值**:每维 ≥3 且无 `defects` 中标 `critical` 项(阈值可配 `RL_VISUAL_GATE_MIN`)。
- **vision 模型**:强模型(如 claude-opus 视觉)。**与生成模型解耦**(P1)—— 即使 code 用弱模型,评分用强模型。
- **不达标**:门返回 fail + rubric JSON + defects → Lisa 收到后 NEEDS_WORK(挂在 §151 的 block 上,从"缺截图 block"升级为"截图不达标 block")。

### 3.3 anti-vacuous(防糊弄)
rubric 输出必须含 ≥1 条具体 `defects`(指到元素)或显式 "no defects found, all dims ≥4" —— 不允许空泛 pass(呼应 §157 anti-vacuous)。

---

## 4. ★ 视觉质量门 — WHEN(触发谓词,成本核心)

> 用户约束:**绝不在不必要时调 vision**。下面每个 condition 都**零模型成本**可评估 —— "要不要调 vision"绝不调模型。

### 4.1 触发谓词(全部为真才烧一次 vision call)
```
should_run_visual_gate(round) :=
   C1  slice 是 UI-bearing            // §151 已有:PLAN 含 web/ ui/ frontend/ playwright/ screenshot/ visual 关键词 — free
 ∧ C2  本轮 git diff 真改了 UI-渲染文件  // git diff --name-only 命中 *.tsx/.jsx/.vue/.svelte/.css/.scss/ web/ ui/ components/ — free
 ∧ C3  便宜机械门(build + axe + 三态)已先过  // broken build / a11y 红 的截图不值得评 — free(本地跑)
 ∧ C4  截图 content-hash ≠ 上次已评的       // dedup 缓存:同一张图不重复评 — free(sha256)
```
**只有 `C1 ∧ C2 ∧ C3 ∧ C4` 才 spend vision call。任一为假 → skip,零浪费。**

### 4.2 anti-trigger 清单(明确 skip,防误烧)
| 场景 | 为什么 skip |
|---|---|
| 纯后端/逻辑改(无 UI 文件 diff) | C2 假 |
| doc-only / config-only / 重命名 | C1 假(非 UI slice)或 C2 假 |
| UI slice 但本轮没动 UI 文件(改了别处) | C2 假 |
| build 红 / axe 红 / 三态缺 | C3 假(先让机械门挡,省 vision) |
| 截图与上次完全相同(content-hash 命中) | C4 假(dedup) |
| tests-only 轮(R2,还没真实现 UI) | C2/C3 通常假(无成品截图) |
| `RL_VISUAL_GATE_OFF=1`(无法截图的环境) | 显式 opt-out(降 block 为 warn) |

### 4.3 成本模型(符号 budget 公式 + 硬上限 + cache key + 策略)

**单位成本(符号,不写美元 —— 随模型/定价变;实现时按当时 pricing 折算)**:
`cost(1 vision call) = T_in(rubric_prompt + 1 screenshot 编码) + T_out(rubric JSON)` token,用**强 vision 模型**单价。

**slice 全程 budget 公式**:
```
visual_calls(slice) = Σ_round [ should_run_visual_gate(round) ]      // §4.1 谓词为真才计 1
                    ≤ CAP_SLICE                                       // 硬上限,默认 3
per_round:           ≤ 1                                              // 每轮最多 1 次(同轮多 route → 拼 1 次 batch 评)
```

**硬上限 / 策略(全部可配)**:
| 项 | 默认 | env |
|---|---|---|
| 每轮最多 vision call | 1(多 route 合并为 1 次 batch) | `RL_VISUAL_GATE_PER_ROUND` |
| 每 slice 最多 vision call | 3(超出 → warn 不再评,防 NEEDS_WORK 死循环烧钱) | `RL_VISUAL_GATE_CAP_SLICE` |
| pass 阈值 | 每维 ≥3 且无 critical defect | `RL_VISUAL_GATE_MIN` |
| 关闭 | block→warn(无法截图环境) | `RL_VISUAL_GATE_OFF=1` |

**cache key(C4 dedup,决定"同一张图不重复评")**:
`key = sha256( screenshot_bytes ‖ rubric_version ‖ vision_model_id )`
存 `.dual-agent/visual-gate-cache/<key>.json`(= 上次 rubric 评分结果)。命中 → 直接复用,**零 call**。
失效:`rubric_version` 或 `vision_model_id` 变 → key 变 → 重评(rubric 升级/换模型时才重烧)。

**`RL_VISUAL_GATE_OFF=1` 策略**:对 UI-bearing slice **warn-only 但需 user ack**(写 ack ledger),防止"悄悄关掉视觉门让烂 UI 蒙混"——关门是显式决定,不是默认逃逸。非 UI slice 该 env 无意义(谓词 C1 本就为假)。

**典型账**:一个 UI slice 全程 **1-2 次** vision call(impl 出成品 1 次;NEEDS_WORK 修复后再 1 次),封顶 3 次。C3(机械前置)+ C4(cache)把"无效评分"压到 0。对比"无门 → 弱模型烂 UI 流到用户 → 人工返工/重做"的成本,这点 vision 成本可忽略。

### 4.4 触发点(在 RLL 哪个 phase)
- **只在 [CODE]/[FIX] impl 轮**(有成品 UI 时),**不在** [PLAN]/[TDD-PLAN]/tests-only 轮。
- 与 §151 同位:submit-time policy 检查(`cli/src/policy.ts`),但加 C1-C4 前置短路 —— 谓词假就根本不进 vision 分支。

---

## 5. 模型按 phase 路由(C,与 A 配套)

- **强模型**:[PLAN]/[TDD-PLAN]/[CLARIFY](设计)+ Lisa review + 视觉 QA(§4 的 vision call)。
- **弱模型**:[CODE]/[FIX] 的代码生成(量大、机械)。
- 挂载:RLL engine(`ralph-lisa auto --engine`)按 phase 选 model;`gate-manifest.json` 或 `.ralph-lisa.json` 配 `phase_models: { plan: <strong>, code: <weak>, review: <strong>, visual_qa: <strong> }`。
- 关键:**评判端(Lisa + 视觉门)永远强** —— 这是质量地板的"地基",即使手很弱。

---

## 6. 实现队列 —— ★ 按 failure-mode(用户要求)

每个 failure-mode = 一种"弱模型导致的失控"。**首道执行门** = 第一个能 mechanically 挡住它的 slice;**后续加固** = 进一步降低漏网。排序原则:**先建零成本门卫(防浪费),再机械门,再给评判端加强,最后才上昂贵 vision**。

| Failure-mode(失控现象) | 首道执行门 | 后续加固 | 为什么这个顺序挡得住 |
|---|---|---|---|
| **F1 昂贵 vision 被无谓重复调用**(用户首要痛点:浪费) | **S1**(触发谓词 C1-C4 + anti-trigger,纯机械零 vision) | S3 的 cache key(C4 落地) | S1 先行 = "何时该评"零成本判准;没有 S1,后面任何 vision 门都会瞎烧。**这是防浪费的地基,必须最先。** |
| **F2 缺 loading/empty/error 三态**(设计不全) | **S2**(B 门:三态存在性断言,机械) | S6(E:UI-spec 强制声明三态) | 机械断言直接挡;S6 在 PLAN 期就把三态钉进 spec,从源头减少 |
| **F3 响应式布局塌**(375/768 溢出/重叠) | **S2**(B 门:断点 overflow/overlap 机械检查) | S3(vision 看跨断点视觉) | 断点 overflow 是机械可判的硬信号,先机械挡;视觉层 S3 兜软问题 |
| **F4 机械全绿但"丑/层次乱/半截"**(主观视觉烂) | **S3**(A 门:vision rubric 评 completeness/hierarchy/consistency) | — | 唯一能抓主观视觉的门;**故意排在 S1/S2 之后** —— 让便宜机械门先过滤,vision 只评"机械挑不出但确实烂"的 |
| **F5 弱 Lisa rubber stamp**(评判端塌) | **S4**(C:review + 视觉QA 强制强模型,红线不降级) | §157 anti-vacuous(已有) | 评判端永远强 = 质量地基;即使 code 用弱模型,眼睛/品味端强 |
| **F6 弱模型从零乱设计 UI**(解空间太大) | **S5**(D:组件库+模板+token 约束,只组装) | S6(E:UI-spec 钉靶子) | 压缩解空间 = 弱模型可错的范围变小;从"自由发挥"变"填模板" |

### 6.1 slice 清单(机制 ↔ 上表 failure-mode 映射)
| # | slice | 机制 | 挡的 failure-mode | 依赖 | 力度 |
|---|---|---|---|---|---|
| **S1** | `visual-gate-trigger-predicate` | §4 触发谓词+anti-trigger(纯机械) | F1 | — | 中 · **先行** |
| **S2** | `ui-mechanical-completeness-gate` | B(axe+三态+断点) | F2,F3 | S1(当 C3) | 中 |
| **S3** | `visual-rubric-vision-gate` | A(§3 rubric + vision 评分,挂 §151) | F4(+F3 软) | S1+S2 | 高 |
| **S4** | `phase-model-routing` | C(per-phase 强/弱模型) | F5 | — | 高 |
| **S5** | `ui-component-preset` | D(组件库+模板+token) | F6 | — | 中 · 后续 |
| **S6** | `ui-spec-clarify` | E(§128 扩 UI-spec) | F2,F6 | — | 中 · 后续 |

**推荐执行序**:S1(防浪费门卫,零成本,**最先**)→ S2(机械门,挡 F2/F3)→ S4(评判端加强,挡 F5)→ S3(vision 压轴,挡 F4)→ S5/S6(源头收敛,挡 F6)。
> S1 最先的理由直接对应用户首要诉求 F1:**先把"何时该评"判准(纯机械零 vision),昂贵的 S3 才有靠谱门卫,绝不无谓烧钱。**

---

## 7. 已知风险 / 边界

- **vision 模型可得性**:无 key/无法截图的环境 → `RL_VISUAL_GATE_OFF=1` 降 block 为 warn(不阻断)。
- **rubric 主观性**:用强模型 + 结构化维度 + anti-vacuous,降低但不消除;阈值可配。
- **截图保真**:playwright 截图须真渲染(非 mock);CSS 未加载/字体缺失会误判 → C3 先验 build 健康。
- **不在本 doc 范围**:实现代码、真接 vision API、组件库内容选型(S5)、模型路由 engine 改造细节(S4)。

---

## 附:与现有机制的复用关系
- **§151** visual-evidence:截图产出 + 路径约定(A 直接扩,从"查存在"→"查达标")。
- **§157** confirmation-gates:design≠mechanism review + anti-vacuous(rubric 输出借此防糊弄)。
- **§128** CLARIFY:UI-spec(E)。
- **§102** 测试表:机械 UI 门(B)挂 tier。
- **§133/§137**:门 fail 的 block + claim 核对沿用。
