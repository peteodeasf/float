import { useState } from 'react'

/**
 * The setup question "Which safety or avoidance behaviors or rituals might you want to do?": the
 * behaviors on the child's plan to pick from, plus any typed in. Shared by the child's setup and
 * the clinician's session sheet; each draws its own chips. docs/plans/exposure-worksheet-questions.md
 */
export function useSafetyPicker(planSafety: string[], initial: string[] = []) {
  const [picked, setPicked] = useState<string[]>(initial)
  const [own, setOwn] = useState('')
  // The plan's behaviors first, then any the child added.
  const options = [...planSafety, ...picked.filter(x => !planSafety.includes(x))]
  const toggle = (name: string) =>
    setPicked(prev => (prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]))
  const addOwn = () => {
    const v = own.trim()
    if (v && !picked.includes(v)) setPicked(prev => [...prev, v])
    setOwn('')
  }
  // What to save: the picked ones, plus one typed and not yet added, so it is not lost.
  const typed = own.trim()
  const answer = typed && !picked.includes(typed) ? [...picked, typed] : picked
  return { picked, setPicked, own, setOwn, options, toggle, addOwn, answer }
}
