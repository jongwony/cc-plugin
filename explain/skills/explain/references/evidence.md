# Evidence behind the directives

Each row: the directive in `SKILL.md`, the finding it rests on, the citation, and how well it replicates. Robustness is what decides a conflict between two directives — prefer the better-supported one, and treat a weakly-supported directive as a prior rather than a rule.

Grading: **WR** well-replicated (multiple labs or meta-analytic), **MOD** consistent but narrow or heavily moderated, **DISP** disputed or failed replication.

## Reader model first (the spine)

| Directive | Finding | Citation | Robustness |
|---|---|---|---|
| Every scaffolding directive is conditional on the reader's prior knowledge of *this* target | **Expertise reversal**: worked examples, integrated text, scaffolds and segmentation go from positive to *negative* effect as prior knowledge rises — the support becomes redundancy the reader must process and suppress | Kalyuga, Ayres, Chandler & Sweller (2003), *Educational Psychologist* 38(1), 23–31; Kalyuga (2007), *Educ Psych Rev* 19, 509–539 | WR |
| Why it reverses: same content, different load | Expertise reversal recast as a special case of element interactivity — content with a schema has low interactivity, so its scaffold is pure extraneous load | Chen, Kalyuga & Sweller (2017), *Educ Psych Rev* 29, 393–405 | WR |
| Expertise is object-specific, not seniority | Experts chunk *meaningful* configurations only; the advantage vanishes on random boards. Experts sort problems by deep principle, novices by surface feature | Chase & Simon (1973), *Cognitive Psychology* 4; Chi, Feltovich & Glaser (1981), *Cognitive Science* 5 | WR |
| Don't predict the reader's state — elicit it | **Curse of knowledge / expert blind spot**: experts underestimate novice difficulty, and *warnings do not debias* — decomposing into steps does. Subject experts predict the formally simpler item is pedagogically easier, which inverts the truth for novices | Camerer, Loewenstein & Weber (1989); Birch & Bloom (2007), *Psych Science*; Hinds (1999), *JEP: Applied* 5(2); Nathan & Petrosino (2003), *AERJ* 40(4) | WR / MOD (blind spot) |

## The four coordinates

| Directive | Finding | Citation | Robustness |
|---|---|---|---|
| Recover the foil; explain the difference, not the whole | Explanation is **contrastive** ("why P rather than Q", Q usually implicit), **selected** (one or two causes, not the chain), and **social**; statistics satisfy less than causes | Lipton (1990), *Contrastive Explanation*; Hilton (1990), *Psych Bulletin* 107; Miller (2019), *Artificial Intelligence* 267, 1–38 (survey of 250+ papers) | WR as a descriptive claim |
| State which level you are answering at; don't descend unbidden | **Reductive allure**: logically irrelevant lower-level detail from *any* more-fundamental science raises judged quality. The neuroscience-*language* effect replicated; the brain-*image* effect did not | Hopkins, Weisberg & Taylor (2016), *Cognition* 155, 67–76; Fernandez-Duque et al. (2015), *J Cog Neurosci*; failed image replication: Michael et al. (2013), *Psychon Bull Rev* (~2,000 participants) | MOD (verbal effect); DISP (brain images) |
| Levels as an analytic frame | Computational / algorithmic / implementational | Marr (1982), *Vision*, ch. 1; criticized for implying level independence (Bechtel & Shagrir 2015) | MOD — a framework, not an empirical result |
| Name and refute the wrong model rather than stating only the right one | **Refutation text** outperforms plain expository text, which was the *least* effective strategy tested; mechanism is co-activation of the old and new conception. Meta-analysis: g = 0.41 over 44 comparisons (n = 3,869) | Guzzetti, Snyder, Glass & Gamas (1993), *Reading Research Quarterly* 28(2); Schroeder & Kucera (2022), *Educ Psych Rev* 34(2), 957–987; Kendeou & van den Broek (2007) | WR |
| Prerequisite: the reader must actually hold it | The refutation effect is moderated by whether the reader holds the misconception — refuting a belief they lack is pure extraneous load | Schroeder & Kucera (2022) moderator analysis | WR |
| Category errors need the category named, not patched | Misconceptions that place a concept in the wrong ontological category (emergent process read as direct causal sequence) resist incremental correction. Learners otherwise build **synthetic models** — correct facts grafted onto an intact wrong framework | Chi (2005), *J Learning Sciences* 14(2); Vosniadou & Brewer (1992), *Cognitive Psychology* 24 | MOD, influential |

## Sequencing and structure

| Directive | Finding | Citation | Robustness |
|---|---|---|---|
| Start at the reader's question, not the foundations | The explainer's difficulty ordering is a poor predictor of learnability; teachers' orderings inverted for algebra word problems vs. symbolic equations | Nathan & Koedinger (2000); Nathan & Petrosino (2003) | MOD |
| Name components and their roles first | **Pre-training** principle: d = 0.78, positive in 10/10 tests | Mayer (2021), *Multimedia Learning* 3rd ed. | WR (within one research program) |
| …but not an abstract bridging preamble | **Advance organizers** in Ausubel's sense: 135 studies, mean d ≈ 0.21; meta-analytic estimates range 0.21–0.89, i.e. dispersion exceeds the effect | Luiten, Ames & Ackerson (1980), *AERJ* 17(2), 211–218 | MOD, weaker than folklore |
| Decompose only where separable; stage re-integration | **Isolated-elements effect**: removing interaction temporarily helps, and costs an explicit integration phase. Difficulty tracks element interactivity, not volume | Pollock, Chandler & Sweller (2002), *Learning & Instruction* 12; Sweller, van Merriënboer & Paas (1998, 2019), *Educ Psych Rev* | WR |
| …and never for a reader who holds the pieces | **Segmenting** d = 0.67, 7/7 — but reverses with expertise | Mayer (2021); Spanjers et al. (2011) | WR with a known reversal |
| Put the explanation at its referent | **Split attention / spatial contiguity**: d = 0.82, positive in 9/9 tests | Ayres & Sweller (2014); Mayer (2021) | WR |
| Signal the structure explicitly | **Signaling**: d = 0.69, 15/16 | Mayer (2021) | WR |
| Let the reader choose the depth layer | Progressive disclosure is an **HCI** heuristic (Nielsen), not an established learning effect; its learning analogues are segmenting and isolated elements, both of which reverse with expertise | Nielsen (1994) | DISP as a learning claim |

## Analogy

| Directive | Finding | Citation | Robustness |
|---|---|---|---|
| Map the analogy element by element | Unhinted analogical transfer is ~30%; with an explicit hint, ~75–90%. Unaided baseline ~10% | Gick & Holyoak (1980, 1983), *Cognitive Psychology* | WR |
| Two compared analogies beat one elaborated one | Comparing two analogs (schema induction) raised *spontaneous* transfer to ~52% | Gick & Holyoak (1983) | WR |
| State where it breaks | People retrieve by **surface** similarity and transfer by **structural** — the mismatch produces confident wrong inference | Gentner (1983), *Cognitive Science* 7(2); Holyoak & Koh (1987); Ross (1987) | WR |
| Retire it; re-describe in the target's own terms | Leaving the analogy as the durable representation produces **reductive bias** — documented in medical education | Spiro, Feltovich, Coulson & Anderson (1989) | MOD |

## Examples

| Directive | Finding | Citation | Robustness |
|---|---|---|---|
| Trace one instance completely — for a reader without a schema | **Worked-example effect** | Sweller & Cooper (1985); Renkl (2014) | WR |
| …and give the reader with a schema a contrast pair instead | Worked examples reverse: problem-solving beats studied examples once a schema exists | Kalyuga, Chandler, Tuovinen & Sweller (2001), *JEP* | WR |
| Pair examples: vary surface, hold structure | Novices generalize along surface features | Ross (1987); Chi, Feltovich & Glaser (1981) | WR |
| A diagram earns its place; decoration does not | **Multimedia** d = 1.35, 13/13 — the largest effect in Mayer's table. **Coherence** (exclude extraneous) d = 0.86, 18/19 | Mayer (2021, 2022) | WR |

## Not finishing the explanation

| Directive | Finding | Citation | Robustness |
|---|---|---|---|
| Leave the terminal inference to the reader | **Generation effect** d ≈ 0.40; **retrieval practice** g ≈ 0.50 | Slamecka & Graf (1978); Bertsch et al. (2007); Rowland (2014); Adesope, Trevisan & Sundararajan (2017) | WR |
| Place *specific* prompts at the seams | **Self-explanation**: g = 0.55, 69 effects, 64 reports, n ≈ 5,917. Scaffolded prompts beat open ones | Chi, Bassok, Lewis, Reimann & Glaser (1989), *Cognitive Science* 13; Bisra, Liu, Nesbit, Salimi & Winne (2018), *Educ Psych Rev* 30(3), 703–725; Berthold, Eysink & Renkl (2009) | WR |
| Expect it to feel like the worse explanation | **Desirable difficulties**: spacing, interleaving, testing and generation raise retention while lowering immediate performance and subjective fluency. The family is robust; specific flashy members (disfluent fonts) failed replication | Bjork & Bjork (2011); Bjork (1994). Failed: Sans Forgetica / disfluency line | WR as a family, DISP in parts |

## Why assent is not evidence

| Directive | Finding | Citation | Robustness |
|---|---|---|---|
| Close on a mechanism question | **Illusion of explanatory depth**: confidence drops sharply after being asked to produce a step-by-step causal account. Specific to *explanatory* knowledge — absent for facts, procedures and narratives | Rozenblit & Keil (2002), *Cognitive Science* 26(5), 521–562; Alter, Oppenheimer & Zemla (2010), *JPSP* | WR for the core effect, MOD for scope |
| A functional restatement is not understanding | The illusion tracks the conflation of *functional* with *mechanistic* understanding — a functional summary is exactly what produces false confidence, including in the explainer's own draft | Rozenblit & Keil (2002); later mechanistic-vs-functional prompt work | MOD |
| Satisfaction is a corrupted signal | People prefer simpler (fewer-cause) explanations *even against probability*; explanations are judged on scope, simplicity and coherence, and teleological accounts are over-weighted | Lombrozo (2007), *Cognitive Psychology* 55; Lombrozo (2006, 2012) | MOD |
| Pair a generative prompt with a counterexample | Explaining drives generalization — and **over**generalization from insufficient evidence | Williams & Lombrozo (2010), *Cognitive Science* | MOD |

## Deliberately not carried

- **Modality** (narration beats on-screen text alongside graphics, d = 1.00) — inapplicable to written explanation, and it vanishes for self-paced or high-prior-knowledge readers (Tabbers et al. 2004).
- **Redundancy** (avoid a second self-sufficient rendering) — the weakest of Mayer's set, d = 0.10, positive in only 8/12 tests. Too weak to instruct on; deliberate paraphrase for a novice reader is defensible.
- **Immersion / image / voice** (VR, on-screen agents) — d = −0.10, 0.20, 0.74 respectively with failing test counts. No directive rests on them.
- Note that Mayer's table is largely one research program's own tests; his 2021 individual-differences recasting makes prior knowledge a formal boundary condition on all of the principles.
