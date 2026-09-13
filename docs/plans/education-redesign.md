# Clinician Education: a more engaging design

Peter, 2026-09-13: the clinician's Education section is "completely dry and black and white". Make it
look more interesting, with graphics and better formatting. **Built 2026-09-13.**

## Where it sits

Peter's three kinds of education content:
1. **Branded videos** explaining key ideas to the child and parent. In production, not ready.
2. **Bite-sized tips** in the child's and parent's apps.
3. **Reference content for the clinician.** This is that section, and the only one this plan changes.

The words stay as they are for now. Dr. Walker will review all of it. See "Content" below for the one
exception proposed.

## Today

Eight modules, about 100 minutes. Each is one long page of text, 850–1,100 words, grey on white, with
a quiz (modules 1–2) or a written exercise (3–7) at the end. The Education page is a grid of plain
cards with a progress bar. Progress is saved in the browser only.

## The design

**The Education page**
- A header band in Float's teal: "Clinician guide", and a ring showing how many modules are done.
- **Continue where you left off**: the module in progress, one tap back in.
- The modules grouped in treatment order: **Foundations** (1 Understanding Anxiety, 2 Family
  Accommodation), **Assessment** (3 Assessment Tools, 4 The Downward Arrow), **Treatment** (5
  Building the Exposure Ladder, 6 Planning and Running Exposures), **Working with parents** (7 The
  Parent Module), and **Using Float** (8) on its own.
- Each card has a small illustration of its idea (a cycle, a thermometer, an arrow, a ladder, a parent
  and child), the reading time and its status.

**A module**
- **A header** with the module's illustration, number, title and reading time, and **What you'll
  learn**: its sections as a short list.
- **On this page**: the sections down the side, following as you scroll, with a thin reading bar.
- **The text, properly set**: shorter line length, real numbered steps, lists and tables in place of
  the current line breaks and bullets made of text.
- **Callouts**: **Key takeaway** (mint panel); **What to say** (the scripts the modules already give,
  as speech bubbles); **Example** (case vignettes as cards; the example Downward Arrow as a
  conversation).
- **Diagrams**, drawn in Float's colours, where the text describes something visual:
  - the anxiety cycle: trigger → anxiety → avoidance → relief that teaches the brain avoidance works
  - the Worry Hill: anxiety rising and coming down if you stay
  - the Fear Level scale, 0 to 10
  - the Downward Arrow: each "what would happen then?" leading to the feared outcome
  - the exposure ladder, easiest at the bottom
  - the accommodation ladder
  - the before- and after-exposure questions, as two cards
  - the five stages of parent work, as a line of steps
  - a patient's path through Float
- **The quiz**: one question at a time, tap an answer, see straight away whether it was right and why,
  a score at the end.
- **The exercise**: the case as a card, a box for each task, **Show the model answer**.
- **Next module** at the end.

**How:** no new libraries. Diagrams are drawn in code, so they are sharp at any size and easy to
change after Dr. Walker's review. Each section in the content file can name a diagram and a callout
type. A preview page, for development only, shows the pages without signing in.

## Content

Peter, 2026-09-13: build the design; Dr. Walker reviews the content later. **No wording was changed**,
including the two passages that describe features Float does not have ("The AI ladder review" in
module 5, and the workflows in "Using Float"). The diagrams' labels come from the modules' own text,
so they say DT where the text does.

Preview without signing in (development only): `/__education-preview`.

## Not in this

- Saving progress on the server (it stays in the browser).
- Video; the child's and parent's tips.
- Linking modules from the screens where the work happens (for example the Downward Arrow screen).
