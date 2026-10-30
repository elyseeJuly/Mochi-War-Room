# Mochi War Room

> **让真实的多 Agent 协作，成为可观看、可追溯的 Mochi 工作现场。**
>
> A provenance-gated Skill for turning **observed** multi-agent work into a truthful, watchable collaboration projection — without inventing agents, handoffs, reviews, or outcomes.

![Mochi War Room icon](assets/icon.svg)

**Status:** V0.2 series · recorded/replayable event fixtures and deterministic projection validation  
**License:** [MIT](LICENSE) · **Language:** Python 3.10+ (standard library only)

## 项目是什么 / Overview

Mochi War Room 希望把多个真实 AI Agent 的工作过程映射成一群可以观察的 Mochi：谁在执行、谁在等待、出现了什么产物、哪里需要人类介入，都应该由真实事件支撑，而不是模型自行编造一场热闹的“协作表演”。

The central rule is **provenance-gated projection**: a visible collaboration action must not claim more certainty than its underlying host event or evidence supports.

> **协作不能演，生活可以演。**  
> Collaboration cannot be acted out; ordinary life can be ambient.

本仓库目前是 **Skill 规则、事件契约、验证器和回放样例**，并非已经上线的宠物乐园、Agent 调度框架或实时 Codex 插件。

## 已实现 / What's here

- **显式启动 (Explicit Activation)：** 未经使用者请求，不自动开启 War Room。
- **真实参与者 (Real Participants)：** 只有能够识别身份并关联当前任务的真实 Agent，才可以成为 Work Mochi。
- **宿主能力分级 (Host Capability Tiers)：** Tier A 完整协作可见；Tier B 标记为 *Limited Collaboration Visibility*；Tier C 不支持多 Mochi 投影。
- **来源与证据 (Provenance)：** 区分 `host_native`、`evidence_backed`、`agent_declared`、`human_declared` 和 `derived`，避免把“Agent 自称完成”写成已确认事实。
- **语义与氛围分离：** 交接、审查、产物、任务状态需要证据；喝茶、散步等 ambient 动作不能更改工作事实。
- **人类注意力 (Human Attention)：** Level 0/1/2；审批、输入与中断需要可靠事件，并区分“已请求”和“宿主已确认”。
- **确定性回放验证：** Python 验证器检查事件、证据、投影强度、状态转换，以及有意构造的虚假协作场景。

当前为 **V0.2 录制/回放验证阶段**。验证器的代码标识为 V0.2.1；它读取 JSONL 样例，不连接实时 Agent Runtime。

## 运行验证 / Quick start

需要 **Python 3.10 或更新版本**；验证器仅使用标准库，无需安装第三方依赖。

```bash
git clone https://github.com/elyseeJuly/Mochi-War-Room.git
cd Mochi-War-Room

# 运行全部样例，检查预期通过与预期拒绝
python3 scripts/validate_projection.py --all

# 查看一个真实协作场景的投影和 War Room Summary
python3 scripts/validate_projection.py \
  --fixture examples/tier-a-events.jsonl --expect pass --emit

# 虚构协作应当被拒绝；这是预期的反向测试
python3 scripts/validate_projection.py \
  --fixture examples/fake-collaboration-events.jsonl --expect fail
```

`--all` 输出中的 **EXPECTED FAIL** 表示验证器成功拒绝了故意构造的不合法事件，不是测试套件故障。命令的退出码为 `0` 才代表所有测试结果符合预期。

## 工作机制 / How it works

```text
Explicit human activation
         ↓
Host capability check (A / B / C)
         ↓
Real participants + current task binding
         ↓
Host-derived events + provenance / evidence
         ↓
Semantic event → validated projection / attention
         ↓
War Room summary
```

**Host** 负责真实 Agent、任务、生命周期和执行结果；**Skill** 负责归一化、来源约束和投影规则；未来的 **Projection UI** 才负责 Mochi 的视觉表现。Skill 不会凭空创建 Agent，也不会代替宿主进行调度。

## 仓库结构 / Repository layout

```text
SKILL.md                   # Skill 的入口、触发条件与规则
agents/openai.yaml         # Skill 元数据
references/                # 能力分级、事件、来源、投影与验证契约
scripts/validate_projection.py
                           # 确定性 JSONL 回放验证器
examples/                  # 正向与对抗性测试样例
assets/icon.svg            # Skill 图标
```

如果希望在支持 Skill 的宿主中使用，请先阅读 [SKILL.md](SKILL.md)。具体加载和激活方式取决于宿主环境；本项目尚未提供实时事件采集或跨宿主适配器。

## 当前边界 / Not implemented yet

以下属于**未来探索**，不是当前可用功能：

- 实时 Codex / App Server / Hook 接入和 Host Adapter；
- Pet Park UI、Work Mochi 动画与实时工作看板；
- Mochi Life、Resident Mochi 收集、Arcade 小游戏和长期生活状态；
- 新的 Agent Runtime、任务编排或多宿主自动适配。

Mochi Life & Arcade 是相邻的体验设计方向，不是本仓库 V0.2 验证器已实现的部分。未来即使加入宠物与小游戏，也应保持工作事实与娱乐行为的边界。

## 参与 / Contributing

欢迎提出错误报告、真实 Host 能力差异、反例测试与改进建议。提交修改前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，并运行 `python3 scripts/validate_projection.py --all`。尤其欢迎能够证明某个投影**不应被允许**的最小反例。

## 许可 / License

Copyright © 2026 [elyseeJuly](https://github.com/elyseeJuly).

Source code and repository materials are released under the [MIT License](LICENSE). Please retain the copyright and license notice when redistributing or adapting the project.

This is an independent experimental project, not an official OpenAI or Codex product.
