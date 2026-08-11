# Veo 3.1 — prompt craft

The prompt text you cannot guess: cinematography vocabulary, negative
prompting, and the three multi-input workflows written as prompts. The API
shapes those workflows need are in [api-examples.md](./api-examples.md); the
five-part formula and audio direction are in [SKILL.md](../SKILL.md) and are
not repeated here.

Source: [Google Cloud Blog — Ultimate Prompting Guide for Veo 3.1](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)

## The language of cinematography

The [Cinematography] slot of the formula is the strongest lever on tone.

- **Camera movement** — dolly, tracking, crane, aerial, slow pan, POV
- **Composition** — wide, close-up, extreme close-up, low angle, two-shot
- **Lens & focus** — shallow depth of field, wide-angle, soft focus, macro, deep focus

Two worked examples, showing how far the vocabulary carries a whole prompt:

```
Crane shot starting low on a lone hiker and ascending high above,
revealing they are standing on the edge of a colossal, mist-filled
canyon at sunrise, epic fantasy style, awe-inspiring, soft morning light.
```

```
Close-up with very shallow depth of field, a young woman's face,
looking out a bus window at the passing city lights with her reflection
faintly visible on the glass, inside a bus at night during a rainstorm,
melancholic mood with cool blue tones, moody, cinematic.
```

## Negative prompts

State the exclusion affirmatively — describe the scene you want, not the
thing you want absent.

- Instead of `no man-made structures`
- Write `a desolate landscape with no buildings or roads`

## Workflow 1 — dynamic transition (first and last frame)

Generate the two endpoint frames with an image model, then let Veo move
between them.

Starting frame:
```
Medium shot of a female pop star singing passionately into a vintage
microphone. She is on a dark stage, lit by a single, dramatic spotlight
from the front. She has her eyes closed, capturing an emotional moment.
Photorealistic, cinematic.
```

Ending frame — a complementary point of view:
```
POV shot from behind the singer on stage, looking out at a large,
cheering crowd. The stage lights are bright, creating lens flare.
You can see the back of the singer's head and shoulders in the foreground.
The audience is a sea of lights and silhouettes. Energetic atmosphere.
```

The Veo prompt then describes the movement between them, and the audio:
```
The camera performs a smooth 180-degree arc shot, starting with the
front-facing view of the singer and circling around her to seamlessly
end on the POV shot from behind her on stage. The singer sings
"when you look me in the eyes, I can see a million stars."
```

## Workflow 2 — dialogue scene (ingredients to video)

Generate reference images for each character and setting, then name them in
the prompt so consecutive shots stay consistent.

Shot 1:
```
Using the provided images for the detective, the woman, and the office
setting, create a medium shot of the detective behind his desk. He looks
up at the woman and says in a weary voice, "Of all the offices in this
town, you had to walk into mine."
```

Shot 2:
```
Using the provided images for the detective, the woman, and the office
setting, create a shot focusing on the woman. A slight, mysterious smile
plays on her lips as she replies, "You were highly recommended."
```

## Workflow 3 — timestamp prompting

A multi-shot sequence inside one generation. There is no parameter for this —
the timing lives in the prompt text, so the segments must sum to the clip
length you asked for.

```
[00:00-00:02] Medium shot from behind a young female explorer with a
leather satchel and messy brown hair in a ponytail, as she pushes aside
a large jungle vine to reveal a hidden path.

[00:02-00:04] Reverse shot of the explorer's freckled face, her expression
filled with awe as she gazes upon ancient, moss-covered ruins in the
background. SFX: The rustle of dense leaves, distant exotic bird calls.

[00:04-00:06] Tracking shot following the explorer as she steps into the
clearing and runs her hand over the intricate carvings on a crumbling
stone wall. Emotion: Wonder and reverence.

[00:06-00:08] Wide, high-angle crane shot, revealing the lone explorer
standing small in the center of the vast, forgotten temple complex,
half-swallowed by the jungle. SFX: A swelling, gentle orchestral score
begins to play.
```
