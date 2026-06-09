# Deck Dimensions — what to elicit before generating slides

These are the dimensions that actually shaped a real 20-minute study-deck build
(CKA / Kustomize, session `c7922aba`). They are the **substrate seed** for the
progressive elicitation step in SKILL.md. Surface them **progressively** — density/form
first, then scope, then refine by feedback — **not all up front** (that is how the real
session converged; an all-at-once panel over-asks and mis-orders).

For every dimension: cite evidence from the *notes themselves* when proposing a default,
present recognizable options, and let the user steer. Recognition over recall.

---

## 1. 청중 (Audience) — who, specifically

Not "developers" but *which* developers, and what they already know. This single
coordinate gets refined more than any other in practice.

- Ask: who is in the room, and what is their prior familiarity with the topic?
- Real example: first "Kubernetes 입문자" → refined to "CKA 시험을 준비하는, K8s에 익숙하지
  않은 개발자". The refinement changed slide content materially.
- Drives: vocabulary, how much is assumed, which analogies land.

## 2. 난이도 / 기술 깊이 (Difficulty / technical depth)

How deep do concrete artifacts go — analogy-only, or real working code/YAML/commands?

- Ask: should slides carry runnable snippets (real YAML, commands), or stay
  concept/analogy-centric with detail deferred?
- Real example: "난이도 조정이 필요합니다 … 실제 동작하는 yaml 스니펫을 슬라이드에 넣어야"
  shifted the deck from analogy-sparse toward real working YAML pulled from official docs.
- Drives: presence and density of code blocks, whether to fetch authoritative sources.

## 3. 간략 형태 / 밀도 (Brevity / density)

How condensed is each slide, and is there a backing layer?

- Ask: presentation-core only, or a 2-layer structure (slide-ready core + detailed
  appendix/backup)?
- Real example: chose "발표용 핵심 + 상세 부록 (2층)" — the core became slides, the
  appendix stayed as a reference doc.
- Drives: words-per-slide, whether to also emit a companion notes doc.

## 4. 발표 시간 (Presentation time) → slide count

Time is the input; slide count is **derived**, not asked separately.

- Ask: how long is the talk?
- Derivation: ~1 slide per 1.3–1.7 min. 20 min ≈ 12–16 slides (real deck landed at 14).
  Scale **within** the 4 ZONEs (grow Part1/Part2), never break the ZONE structure.
- Drives: how many slides each ZONE gets via the parallel-add convention.

## 5. 재구성 범위 / 앵글 (Scope / reconstruction angle)

Faithful to the source, or reframed toward the audience's actual goal?

- Ask: stay faithful to the source material, or reframe toward a goal (e.g. exam-aligned,
  decision-aligned), which may *add* content not in the notes and drop tangents?
- Real example: "CKA 시험 정렬 (권장)" added official syntax + "in the exam room" tips and
  set the slide count, vs. "섹션 충실 + 실YAML" vs. "시험 특화 압축".
- Drives: inclusion/exclusion, what external authoritative content to graft in.

---

## Mascot pose library (asset note)

Bundled poses live flat in `../assets/clawd-*.svg` (19 normalized poses, viewBox
`-15 -25 45 45`). For more poses, the full library is at
`~/Downloads/github/oss/clawd-on-desk/assets/svg/` (47 raw poses) — **normalize the
viewBox before bundling** a new one. Neutral poses suitable for most decks:
`about-hero`, `mini-enter`, `working-thinking`, `working-typing`, `working-juggling`,
`working-ultrathink`, `idle-reading`, `idle-bubble`, `headphones-groove`, `react-double`,
`mini-happy`.
