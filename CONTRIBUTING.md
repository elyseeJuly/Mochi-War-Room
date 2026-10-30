# Contributing to Mochi War Room

感谢关注！Mochi War Room 目前是一个关于**真实协作可验证投影**的实验性 Skill，而不是实时 Agent 编排器或已经完成的宠物应用。

## Before making changes

1. Read [SKILL.md](SKILL.md) and the relevant files under [references/](references/).
2. Keep **Host Truth First**, **Explicit Activation**, and **Projection Cannot Be Stronger Than Its Source** intact.
3. Do not introduce invented agents, roles, handoffs, reviews, approvals, or task outcomes.
4. Do not turn ambient Mochi behavior into evidence, task state, or Human Required attention.
5. Prefer a small, testable change over expanding the runtime or event taxonomy without a demonstrated need.

## Validation

Run the complete replay suite before submitting a pull request:

```bash
python3 scripts/validate_projection.py --all
```

The suite includes both positive fixtures and deliberately invalid fixtures. **EXPECTED FAIL** means the validator correctly rejected a negative case. The suite should exit with code `0`.

For a bug fix or new constraint, add or adapt a minimal JSONL example under `examples/` where practical. Describe the source evidence, expected projection, and why any rejected action must remain rejected.

## Issues and pull requests

- Explain the observed problem, expected behavior, and current behavior.
- State whether your example comes from a real host capability, a recorded/replayable event trace, or a synthetic adversarial test.
- Remove credentials, private conversation content, tokens, proprietary code, and personal data from traces before sharing them.
- Do not claim that fixture replay demonstrates a production-ready live integration.
- Keep unrelated UI, pet-life, arcade, and orchestration proposals separate from changes to the truthfulness contract.

By contributing, you agree that your contributions will be distributed under the repository's [MIT License](LICENSE).
