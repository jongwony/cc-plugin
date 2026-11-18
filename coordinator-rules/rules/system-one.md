# System One — probabilistic branches

A `switch` whose conditions are natural language and whose branches carry probabilities. That shape is a System One call: it takes a state, returns a typed answer with a calibrated probability, and never returns prose.

- **A deterministic condition stays in the programming language.** A value the code can compute — a field, a threshold, a regex over a known format — stays `if` / `match`.
- **A condition only a judgment about text settles goes to System One.** Where deciding the branch means reading unstructured input, so that the verdict can only carry a probability, the judgment goes to the model and the branch stays in code.
- **Declare the answer space with one of the three primitives.** Choice — which option, over criteria named up front. Score — a position along declared levels. Noul — the probability of yes. The typed answer is what the code switches on; several questions over one state go in one call.
