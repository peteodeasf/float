import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { LadderEditor } from './SessionPage'

function openEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['insights', 'p1', 'situation'], [])
  qc.setQueryData(['plan-rungs', 'plan1'], [])
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LadderEditor planId="plan1" patientId="p1" triggers={[]} onDone={() => {}} onArrow={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('adding a trigger situation', () => {
  // Issue #50: Peter asked for the hint in the box to read "Add a trigger situation", the name
  // the screen's own question uses, not "Add a situation the child finds hard".
  it('hints "Add a trigger situation"', () => {
    openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Add situation' }))
    expect(screen.getByLabelText('A situation')).toHaveAttribute('placeholder', 'Add a trigger situation')
  })
})
