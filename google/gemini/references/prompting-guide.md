# Gemini CLI Prompting Guide

> Based on [Gemini API Prompting Strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)

This guide provides detailed strategies for crafting effective prompts when using Gemini CLI. Apply these techniques to improve response quality, consistency, and accuracy.

**Note:** Prompt engineering is iterative. These guidelines are starting points—experiment and refine based on your specific use cases and observed model responses.

## Table of Contents

1. [Core Prompting Strategies](#core-prompting-strategies)
   - [Clear and Specific Instructions](#clear-and-specific-instructions)
   - [Zero-Shot vs Few-Shot Prompts](#zero-shot-vs-few-shot-prompts)
   - [Adding Context](#adding-context)
   - [Prefixes](#prefixes)
   - [Breaking Down Prompts](#breaking-down-prompts)
2. [Response Formatting](#response-formatting)
3. [Model Parameters](#model-parameters)
4. [Gemini 3 Best Practices](#gemini-3-best-practices)
5. [Prompt Iteration Strategies](#prompt-iteration-strategies)
6. [Common Pitfalls](#common-pitfalls)

---

## Core Prompting Strategies

### Clear and Specific Instructions

The most effective way to customize model behavior is providing clear, specific instructions. Structure your prompts using these input types:

#### Input Types

| Type | Description | Example |
|------|-------------|---------|
| **Question** | Direct query for the model to answer | "What's a good name for a flower shop specializing in dried flowers?" |
| **Task** | Specific action to perform | "Create a list of 5 camping essentials" |
| **Entity** | Item for the model to operate on | "Classify the following: Elephant, Mouse, Snail" |
| **Completion** | Partial input to complete | "Order: A burger and a drink\nOutput:" |

#### Partial Input Completion

When providing partial content, the model completes based on patterns. This works especially well with structured formats like JSON:

```
Valid fields are cheeseburger, hamburger, fries, and drink.

Order: Give me a cheeseburger and fries
Output:
```
{
  "cheeseburger": 1,
  "fries": 1
}
```

Order: I want two burgers, a drink, and fries.
Output:
```

The model will complete with the expected JSON structure, excluding unordered items.

#### Constraints

Specify constraints on reading prompts or generating responses:

```
Summarize this text in one sentence:

Text: A quantum computer exploits quantum mechanical phenomena to perform
calculations exponentially faster than any modern traditional computer...
```

Constraints help control:
- Response length
- Format requirements
- Scope limitations
- What to include/exclude

---

### Zero-Shot vs Few-Shot Prompts

**Few-shot prompts** include examples showing desired behavior. **Zero-shot prompts** provide no examples.

**Recommendation:** Always include few-shot examples. They regulate formatting, phrasing, scoping, and patterning.

#### Zero-Shot Example

```
Please choose the best explanation to the question:

Question: How is snow formed?
Explanation1: Snow is formed when water vapor in the air freezes into ice
crystals in the atmosphere, which can combine and grow into snowflakes...
Explanation2: Water vapor freezes into ice crystals forming snow.
Answer:
```

Result: Model chooses Explanation1 (more detailed).

#### Few-Shot Example

With examples showing preference for concise responses:

```
Question: Why is the sky blue?
Explanation1: The sky appears blue because of Rayleigh scattering, which
causes shorter blue wavelengths...
Explanation2: Due to Rayleigh scattering effect.
Answer: Explanation2

Question: What is the cause of earthquakes?
Explanation1: Sudden release of energy in the Earth's crust.
Explanation2: Earthquakes happen when tectonic plates suddenly slip or break...
Answer: Explanation1

Question: How is snow formed?
Explanation1: Snow is formed when water vapor in the air freezes into ice...
Explanation2: Water vapor freezes into ice crystals forming snow.
Answer:
```

Result: Model chooses Explanation2 (following pattern).

#### Guidelines for Few-Shot Prompts

1. **Optimal number:** Use enough examples to establish the pattern (typically 2-5). Too many can cause overfitting.
2. **Patterns over anti-patterns:** Show what to do, not what to avoid.
   - ❌ "Don't end haikus with a question"
   - ✅ "Always end haikus with an assertion"
3. **Consistent formatting:** Maintain identical structure across all examples (XML tags, whitespace, newlines).

---

### Adding Context

Include necessary information instead of assuming the model has it. Context helps the model understand constraints and requirements.

#### Without Context

```
What should I do to fix my disconnected wifi?
The light on my Google Wifi router is yellow and blinking slowly.
```

Result: Generic troubleshooting advice.

#### With Context

```
Answer the question using the text below. Respond with only the text provided.

Question: What should I do to fix my disconnected wifi? The light on my
Google Wifi router is yellow and blinking slowly.

Text:
Color: Slowly pulsing yellow
What it means: There is a network error.
What to do: Check that the Ethernet cable is connected to both your router
and your modem and both devices are turned on. You might need to unplug
and plug in each device again.

Color: Fast blinking yellow
What it means: You are holding down the reset button and are factory
resetting this device.
...
```

Result: Specific, actionable solution based on the router's manual.

---

### Prefixes

Prefixes signal semantic meaning and expected output format:

| Prefix Type | Purpose | Example |
|-------------|---------|---------|
| **Input prefix** | Mark different input types | "English:", "French:", "Text:" |
| **Output prefix** | Signal expected response format | "JSON:", "The answer is:" |
| **Example prefix** | Label examples in few-shot prompts | "Question:", "Answer:" |

#### Example with Prefixes

```
Classify the text as one of the following categories.
- large
- small

Text: Rhino
The answer is: large

Text: Mouse
The answer is: small

Text: Snail
The answer is: small

Text: Elephant
The answer is:
```

Result: `The answer is: large`

---

### Breaking Down Prompts

For complex tasks, break prompts into simpler components:

1. **Break down instructions:** One prompt per instruction, process based on user input
2. **Chain prompts:** Sequential steps where each output becomes the next input
3. **Aggregate responses:** Parallel tasks on different data portions, then combine results

---

## Response Formatting

### Using System Instructions

Control response style through system instructions:

```
gemini -s "All questions should be answered comprehensively with details,
unless the user requests a concise response specifically." \
"What is a smart way to make a business that sells DVD's in 2025?"
```

### Completion Strategy for Formatting

Guide format by starting the response structure:

```
Create an outline for an essay about hummingbirds.

I. Introduction
  *
```

The model will complete following your initiated pattern.

---

## Model Parameters

Control response generation through parameters (use `-m` flag or config):

| Parameter | Description | Recommendation |
|-----------|-------------|----------------|
| **Max tokens** | Maximum response length | ~100 tokens ≈ 60-80 words |
| **Temperature** | Randomness degree (0-1) | Keep at 1.0 for Gemini 3 models |
| **topK** | Sample from K most probable tokens | 1 = greedy, higher = more diverse |
| **topP** | Cumulative probability threshold | Default: 0.95 |
| **Stop sequences** | Custom termination points | Avoid sequences that may appear in output |

**Important:** For Gemini 3, keep temperature at 1.0 to avoid looping or degraded performance.

---

## Gemini 3 Best Practices

Gemini 3 models excel at advanced reasoning and instruction following. Apply these principles:

### Core Principles

1. **Be precise and direct:** State goals clearly without unnecessary persuasion
2. **Use consistent structure:** XML tags (`<context>`, `<task>`) or Markdown headings
3. **Define parameters:** Explicitly explain ambiguous terms
4. **Control verbosity:** Request detail level explicitly (Gemini 3 defaults to concise)
5. **Prioritize critical instructions:** Place constraints, roles, format requirements first
6. **Structure long contexts:** Provide context first, questions/instructions at the end

### Enhancing Reasoning

Prompt the model to plan or self-critique:

```
Before providing the final answer, please:
1. Parse the stated goal into distinct sub-tasks
2. Check if the input information is complete
3. Create a structured outline to achieve the goal
```

Or request self-critique:

```
Before returning your final response, review your output:
1. Did I answer the user's intent, not just their literal words?
2. Is the tone authentic to the requested persona?
```

### Structured Prompting Template

**XML Style:**

```xml
<system_instruction>
You are a helpful assistant.
</system_instruction>

<constraints>
1. Be objective.
2. Cite sources.
</constraints>

<user_input>
[Insert user data here]
</user_input>

<task>
[Insert specific request here]
</task>
```

**Markdown Style:**

```markdown
# Identity
You are a senior solution architect.

# Constraints
- No external libraries allowed
- Python 3.11+ syntax only

# Output Format
Return a single code block.
```

### Comprehensive Template

```xml
System Instruction:
<identity>
You are Gemini 3, a specialized assistant for [Domain].
You are precise, analytical, and persistent.
</identity>

<workflow>
1. **Plan**: Analyze the task and create a step-by-step plan
2. **Execute**: Carry out the plan
3. **Validate**: Review output against the user's task
4. **Format**: Present in the requested structure
</workflow>

<parameters>
- Verbosity: [Low/Medium/High]
- Tone: [Formal/Casual/Technical]
</parameters>

<output_structure>
1. **Executive Summary**: [Short overview]
2. **Detailed Response**: [Main content]
</output_structure>

User Prompt:
<context>
[Insert documents, code, background info]
</context>

<task>
[Insert specific request]
</task>

<instruction>
Remember to think step-by-step before answering.
</instruction>
```

---

## Prompt Iteration Strategies

When results don't meet expectations:

1. **Rephrase:** Try different wording
   ```
   - "How do I bake a pie?"
   - "Suggest a recipe for a pie."
   - "What's a good pie recipe?"
   ```

2. **Switch to analogous task:** Achieve the same goal differently

   Instead of: "Which category does The Odyssey belong to: thriller, sci-fi, mythology, biography"

   Try: "Multiple choice: Which option describes The Odyssey? Options: thriller, sci-fi, mythology, biography"

3. **Reorder content:** Change the sequence
   ```
   Version 1: [examples] → [context] → [input]
   Version 2: [input] → [examples] → [context]
   Version 3: [examples] → [input] → [context]
   ```

4. **Adjust temperature:** If you get fallback responses, try increasing temperature

---

## Common Pitfalls

### Things to Avoid

- ❌ **Relying on factual accuracy:** Don't trust models for unverified facts
- ❌ **Complex math/logic:** Use with care; verify results
- ❌ **Broad anti-patterns:** Show what to do, not what to avoid
- ❌ **Inconsistent formatting:** Maintain structure across examples
- ❌ **Changing Gemini 3 temperature:** Keep at 1.0 (default)

### Handling Fallback Responses

If the model returns "I'm not able to help with that, as I'm only a language model":
- Safety filter may have been triggered
- Try increasing temperature
- Rephrase to be more specific
- Add relevant context

---

## Additional Resources

- [Prompting with media files](https://ai.google.dev/gemini-api/docs/files#prompt-guide)
- [Imagen prompt guide](https://ai.google.dev/gemini-api/docs/imagen#imagen-prompt-guide)
- [Gemini Native Image Generation](https://ai.google.dev/gemini-api/docs/image-generation#prompt-guide)
- [Video generation prompting](https://ai.google.dev/gemini-api/docs/video#prompt-guide)
- [Prompt gallery](https://ai.google.dev/gemini-api/prompts) - Interactive examples

---

## Understanding Model Responses

### Determinism vs Randomness

Response generation happens in two stages:

1. **Probability distribution (deterministic):** Model processes input and generates probabilities for next tokens
   - Same prompt → same distribution every time

2. **Decoding (can be stochastic):** Converting distributions to text
   - Temperature = 0: Always select most likely token (deterministic)
   - Temperature > 0: Random sampling over distribution (stochastic)

**For Gemini 3:** Keep default temperature of 1.0 to avoid unexpected outcomes.

---

## Quick Reference for CLI Usage

### Applying These Strategies

When using `gemini` CLI:

```bash
# Use system instructions for behavioral constraints
gemini -s "<system_instruction>Your role and constraints</system_instruction>" \
  "Your prompt here"

# Provide context in GEMINI.md (global or project-specific)
# Place in ~/.gemini/GEMINI.md or project root

# For complex tasks, use interactive mode
gemini -i "Initial prompt with examples"

# Control parameters if needed
gemini -m gemini-3-pro --temperature 1.0 "Your prompt"
```

### Session-Based Iteration

Leverage session management for prompt iteration:

```bash
# Start with initial prompt
gemini "Analyze this codebase for performance issues"

# Resume and refine
gemini --resume latest "Focus specifically on database queries"

# Continue iteration
gemini --resume latest "Now suggest optimization strategies"
```

This allows you to build context and refine prompts progressively without repeating information.
