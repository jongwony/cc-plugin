# Veo 3.1 Prompting Guide

Complete guide to prompting Google's Veo 3.1 video generation model.

Source: [Google Cloud Blog - Ultimate Prompting Guide for Veo 3.1](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)

## Table of Contents

1. [Model Capabilities](#model-capabilities)
2. [Prompting Formula](#prompting-formula)
3. [Essential Prompting Techniques](#essential-prompting-techniques)
4. [Advanced Creative Workflows](#advanced-creative-workflows)

## Model Capabilities

### Core Generation Features

- **High-fidelity video:** 720p or 1080p resolution
- **Aspect ratio:** 16:9 or 9:16
- **Variable clip length:** 4, 6, or 8 seconds
- **Rich audio & dialogue:** Realistic, synchronized sound including multi-person conversations and precisely timed sound effects
- **Complex scene comprehension:** Deeper understanding of narrative structure and cinematic styles for better character interactions and storytelling

### Advanced Creative Controls

- **Improved image-to-video:** Animate source images with greater prompt adherence and enhanced audio-visual quality
- **Consistent elements ("ingredients to video"):** Provide reference images of scenes, characters, objects, or styles to maintain consistent aesthetics across multiple shots (includes audio generation)
- **Seamless transitions ("first and last frame"):** Generate natural video transitions between provided start and end images, complete with audio
- **Add/remove object:** Introduce new objects or remove existing ones from generated videos while preserving scene composition (currently uses Veo 2, no audio)
- **Digital watermarking:** All videos marked with SynthID to indicate AI-generated content

## Prompting Formula

A structured prompt yields consistent, high-quality results. Use this five-part formula:

**[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]**

### Formula Components

- **Cinematography:** Camera work and shot composition
- **Subject:** Main character or focal point
- **Action:** What the subject is doing
- **Context:** Environment and background elements
- **Style & ambiance:** Overall aesthetic, mood, and lighting

### Example

```
Medium shot, a tired corporate worker, rubbing his temples in exhaustion,
in front of a bulky 1980s computer in a cluttered office late at night.
The scene is lit by the harsh fluorescent overhead lights and the green
glow of the monochrome monitor. Retro aesthetic, shot as if on 1980s
color film, slightly grainy.
```

## Essential Prompting Techniques

### The Language of Cinematography

The [Cinematography] element is your most powerful tool for conveying tone and emotion.

#### Camera Movement

- Dolly shot
- Tracking shot
- Crane shot
- Aerial view
- Slow pan
- POV shot

**Example (Crane shot):**
```
Crane shot starting low on a lone hiker and ascending high above,
revealing they are standing on the edge of a colossal, mist-filled
canyon at sunrise, epic fantasy style, awe-inspiring, soft morning light.
```

#### Composition

- Wide shot
- Close-up
- Extreme close-up
- Low angle
- Two-shot

#### Lens & Focus

- Shallow depth of field
- Wide-angle lens
- Soft focus
- Macro lens
- Deep focus

**Example (Shallow depth of field):**
```
Close-up with very shallow depth of field, a young woman's face,
looking out a bus window at the passing city lights with her reflection
faintly visible on the glass, inside a bus at night during a rainstorm,
melancholic mood with cool blue tones, moody, cinematic.
```

### Directing the Soundstage

Veo 3.1 generates complete soundtracks based on text instructions.

#### Dialogue

Use quotation marks for specific speech:
```
A woman says, "We have to leave now."
```

#### Sound Effects (SFX)

Describe sounds with clarity:
```
SFX: thunder cracks in the distance
```

#### Ambient Noise

Define background soundscape:
```
Ambient noise: the quiet hum of a starship bridge
```

### Mastering Negative Prompts

Describe what you wish to exclude affirmatively.

**Instead of:** "no man-made structures"
**Use:** "a desolate landscape with no buildings or roads"

### Prompt Enhancement with Gemini

Use Gemini to analyze and enrich simple prompts with more descriptive and cinematic language.

## Advanced Creative Workflows

Multi-step workflows offer unparalleled control by breaking down the creative process into manageable stages.

### Workflow 1: Dynamic Transition with "First and Last Frame"

Create specific and controlled camera movement or transformation between two distinct points of view.

#### Step 1: Create the Starting Frame

Use Gemini 2.5 Flash Image to generate initial shot.

**Example prompt:**
```
Medium shot of a female pop star singing passionately into a vintage
microphone. She is on a dark stage, lit by a single, dramatic spotlight
from the front. She has her eyes closed, capturing an emotional moment.
Photorealistic, cinematic.
```

#### Step 2: Create the Ending Frame

Generate a second, complementary image (e.g., different POV angle).

**Example prompt:**
```
POV shot from behind the singer on stage, looking out at a large,
cheering crowd. The stage lights are bright, creating lens flare.
You can see the back of the singer's head and shoulders in the foreground.
The audience is a sea of lights and silhouettes. Energetic atmosphere.
```

#### Step 3: Animate with Veo

Input both images using the **First and Last Frame** feature. Describe the transition and desired audio.

**Example prompt:**
```
The camera performs a smooth 180-degree arc shot, starting with the
front-facing view of the singer and circling around her to seamlessly
end on the POV shot from behind her on stage. The singer sings
"when you look me in the eyes, I can see a million stars."
```

### Workflow 2: Building a Dialogue Scene with "Ingredients to Video"

Create multi-shot scenes with consistent characters engaged in conversation.

#### Step 1: Generate Your "Ingredients"

Create reference images using Gemini 2.5 Flash Image for characters and settings.

#### Step 2: Compose the Scene

Use **Ingredients to Video** feature with relevant reference images.

**Example prompts:**

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

### Workflow 3: Timestamp Prompting

Direct a complete, multi-shot sequence with precise cinematic pacing within a single generation. Assign actions to timed segments to create full scenes with multiple distinct shots efficiently.

**Example:**

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

## Tips for Success

1. **Be specific:** Detailed prompts yield more precise results
2. **Use the formula:** Structure prompts with [Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]
3. **Master cinematography language:** Camera movements and lens choices convey emotion
4. **Direct audio explicitly:** Use quotation marks for dialogue, describe SFX and ambient noise
5. **Experiment with workflows:** Combine Veo with Gemini 2.5 Flash Image for complex projects
6. **Iterate:** The best way to master these techniques is through real-world application
