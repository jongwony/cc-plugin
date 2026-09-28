# Writing a Seedance prompt

Read before drafting a prompt in the `seedance` skill. Seedance executes
what the prompt describes and invents what it leaves out, so the work is
deciding how much of the clip to specify and in what order.

## Fix the frame first

Decide three values before writing anything else: how many shots, the
total duration, and the aspect ratio. State them in the style section at
the top and repeat them as a closing line (`Total: 15s / 6 shots / 16:9`).
The rest of the prompt is laid out against them, and the model treats an
unstated shot count as licence to cut wherever it likes.

The values must also be ones the schema accepts — `higgsfield model get
seedance_2_5 --json` — and the same duration and aspect ratio go on the
command line as flags.

## Layout — one block, labelled sections

Write the prompt as one continuous block broken into labelled sections, in
this order. Leave out a section the clip does not need; keep the order of
the ones that remain.

1. **GLOBAL STYLE** — the one visual rule everything inherits: live action
   or animation, genre, grade, film or digital character, frame rate and
   shutter feel, realism level, and what the look is not.
2. **SCENE** — a logline: who, where, the arc of what happens, the mood.
3. **CHARACTERS** — each person's face, hair, build, and wardrobe, or the
   reference image that carries them.
4. **LOCATION** — the space and its props, kept apart from the people.
5. **FIRST FRAME AND BLOCKING** — where everyone stands and faces when the
   clip opens.
6. **Beats** — the clip broken into its parts:
   - for a multi-shot clip, `Shot 1: …`, `Shot 2: …`, each naming the
     framing, the action, and what the camera does, and ending in
     `Hard cut` where one shot cuts to the next;
   - where timing matters more than cuts, timed segments (`0.0–3.0s: …`)
     that cover the whole duration.
7. **OPTICS & CAMERA** — lens and movement per shot, where the beats did
   not already fix them.
8. **PHYSICS** — how fabric, hair, smoke, liquid, and debris move.
9. **LIGHTING** — the source, its direction, how it falls on faces and
   surfaces.
10. **POSITIVE LOCKS** — what must hold across every cut: faces, wardrobe,
    headcount, screen direction, a state that only accumulates (wet stays
    wet). Reuse the identical wording for a lock in every prompt of the
    same project, so separate clips keep the same people.
11. **DIALOGUE** — each line quoted, with who says it, how, and when
    (`At 5.4s she says, quietly: "…"`), then that these are the only words
    spoken.
12. **AUDIO** — the one sound rule at the bottom: ambience and effects tied
    to the action, and what is absent (`no music, no narration, no
    subtitles`).
13. **Total line** — the shot/duration/ratio line from the top.

Length follows the clip: a one-sentence concept is a legitimate experiment
that lets the model decide everything, and a clip with many cuts, speakers,
or continuity demands takes as long a prompt as those demands need.

## Giving the clip a shape

- Give multi-shot clips an arc the shots escalate along — calm, threat,
  turn, aftermath — so each shot has a reason to follow the last.
- Write action as choreography: who moves where, what hits what, in order.
  A vague action gets an invented one.
- Direct acting through what the character wants and what stands in the
  way — the motive, the goal, the obstacle, the tactic they try — rather
  than an adjective for the emotion.
- Put an effect's appearance inline where it happens, in brackets:
  `she crushes the sphere [VFX: white-blue current branching up both forearms]`.
- Mark tempo changes in the beat where they happen — a ramp into slow
  motion and the snap back to full speed.

## Camera

Name the camera's behavior in every beat: handheld or locked, the move
(dolly in, push in, pull back, truck, arc, orbit, crane up, handheld
follow, whip pan), and the lens when it matters.

For a single continuous shot or a first-person view, also state what the
camera does not do — `one continuous shot, no cuts, no zoom` — because the
model otherwise falls back to cutting between angles.

## Exclusions

State an exclusion outright where the model would otherwise drift to it:
a look (`NOT a clean CGI render`), content (`no logos, no readable text`),
or a camera behavior. Put look exclusions in GLOBAL STYLE, sound
exclusions in AUDIO, and the rest beside what they constrain.

## With a start frame or reference images

- With `--start-image`, the first frame already exists: describe the
  motion from it, not the frame's contents again.
- Give each reference image one job — a face, a product, a location, a
  style — and name that job where the image is used (`identity and
  wardrobe locked to the reference, ignore the reference backdrop`). A
  small deliberate set holds better than many overlapping references.
- With `--audio`, describe the speaker and the delivery; the words come
  from the audio.
- For `video_edit` and `video_extension`, describe the change or the
  continuation, not the source clip again.

## Realism

When characters or creatures come out looking smooth or plastic, add an
explicit instruction for photographic realism in GLOBAL STYLE
(`photorealistic, practical effects, not a 3D render`).

## Content that is rejected

Jobs depicting real public figures, sexual content, or trademarked
characters end with a policy status (`nsfw`, `ip_detected`). Write around
them from the start rather than discovering it after a paid run.

## Fresh examples

Higgsfield's Seedance 2.5 prompting guide collects full prompts by genre
(drama, action, commercial, horror, noir, and more):
https://higgsfield.ai/blog/seedance-2-5-prompting-guide — read it when the
user wants a format this page does not cover, and check that it still
matches the current Seedance model.
