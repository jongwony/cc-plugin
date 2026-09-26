# Writing a Seedance prompt

Read before drafting a prompt in the `seedance` skill. Seedance executes
what the prompt describes and invents what it leaves out, so the work is
deciding how much of the clip to specify and in what order.

## Fix the frame first

Decide three values before writing anything else, and state them at the
top of the prompt: how many shots, the total duration, and the aspect
ratio. Repeat them as a closing line (`Total: 15s / 6 shots / 16:9`). The
rest of the prompt is laid out against them, and the model treats an
unstated shot count as licence to cut wherever it likes.

The values must also be ones the model's schema accepts — `higgsfield
model get <id> --json` — and the same duration and aspect ratio go on the
command line as flags.

## Layout, top to bottom

1. **Look line** — one line of medium and finish: live action or animation,
   lens and film character, grade, realism level. Everything below inherits
   it.
2. **Scene paragraph** — who is in it, where, and the whole arc of what
   happens, in a few sentences. This is what keeps the shots one story.
3. **Beats** — the clip broken into its parts, one line each:
   - for a multi-shot clip, `Shot 1: …`, `Shot 2: …`, each naming the
     framing (wide, medium, close-up, low angle), the action in that shot,
     and what the camera does;
   - for a clip where timing matters more than cuts (animation especially),
     timed segments — `0–3s: …`, `3–6s: …` — that cover the whole duration.
4. **Sound line** — what is heard, as a list of effects, or an explicit
   `no music` / `no music, no SFX` when silence or raw sound is wanted.
5. **Total line** — the shot/duration/ratio line from the top.

A short prompt is a legitimate choice for an experiment — a one-sentence
concept lets the model decide everything. Specify beats when the user has
a specific clip in mind.

## Giving the clip a shape

- Give multi-shot clips an arc the shots escalate along — calm, threat,
  turn, aftermath — so each shot has a reason to follow the last.
- Write action as choreography: who moves where, what hits what, in order.
  A vague action gets an invented one.
- Put an effect's appearance inline where it happens, in brackets:
  `she crushes the sphere [VFX: white-blue current branching up both forearms]`.
  That describes the effect without breaking the sentence describing the
  action.
- Mark tempo changes in the beat where they happen — a ramp into slow
  motion and the snap back to full speed.

## Camera

Name the camera's behavior in every beat: handheld or locked, the move
(dolly in, orbit, tracking, crane up, whip pan), and the lens when it
matters.

For a single continuous shot or a first-person view, also say what the
camera does **not** do — `one continuous shot, no cuts, no zoom` — because
the model otherwise falls back to cutting between angles. This is the
exception to phrasing things positively: an editing or camera constraint
stated as a negative is an instruction the model follows, while content
stated as a negative ("no people") is better rewritten as what is there
("an empty street").

## With a start frame or reference images

- With `--start-image`, the first frame already exists: describe the
  motion from it, not the frame's contents again.
- With reference `--image` inputs, name what each one is for in the scene
  paragraph (the character, the vehicle, the location) so the model binds
  them to the right roles. An image can also be named as the style
  reference for the whole clip.
- With `--audio` for lipsync, describe the speaker and the delivery; the
  words come from the audio.

## Realism

When characters or creatures come out looking smooth or plastic, add an
explicit instruction for photographic realism and against a CG look
(`photorealistic, practical effects, no 3D render look`).

## Content that is rejected

Jobs depicting real public figures, sexual content, or trademarked
characters end with a policy status (`nsfw`, `ip_detected`). Write around
them from the start rather than discovering it after a paid run.

## Fresh examples

Higgsfield's Seedance 2.0 prompting guide collects full prompts by format
(transformations, first-person, fights, animation):
https://higgsfield.ai/blog/seedance-prompting-guide — read it when the
user wants a format this page does not cover, and check its date against
the current Seedance model.
