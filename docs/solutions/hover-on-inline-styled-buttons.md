# A hover rule does nothing on a button that sets its background inline

**2026-10-22**, issue #78 (tab design).

The clinician app styles buttons with inline style objects from `components/ui/buttons.ts`. A
hover can't be written inline, so it has to be a CSS rule in `styles/tokens.css`. But an inline
`style` beats any rule in a stylesheet. If the style object sets `background: 'transparent'`, a
`.float-tab:hover { background: ... }` rule never shows. Nothing errors; the hover just isn't
there.

The fix: leave the property out of the inline style in the state that should hover, and set the
resting value in the CSS class instead. In `tab(on)` only the selected tab sets `background`
inline; unselected tabs get `background: transparent` from `.float-tab`, so `.float-tab:hover`
can change it. The selected tab's inline background still wins, so it does not change on hover.

The shared rule `.float-app button:not(:disabled):hover { filter: brightness(0.97) }` does work on
inline-styled buttons, because no button sets `filter` inline. It is too faint to see on a
transparent button, though.

How to check: hover in the real app and screenshot. `matches(':hover')` being true while
`getComputedStyle(el).backgroundColor` is still `rgba(0, 0, 0, 0)` is this problem.

Also: the page behind the patient tabs is gray (`--float-bg`, `#eaeef4`). `--float-surface-sunken`
and `--float-primary-light` are both nearly the same lightness, so a tint in either one barely
shows there. White, or the brighter `--float-primary-mid`, does show.
