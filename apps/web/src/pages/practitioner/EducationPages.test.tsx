import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }))

import EducationIndexPage from './EducationIndexPage'
import EducationModulePage from './EducationModulePage'

function open(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/education" element={<EducationIndexPage />} />
        <Route path="/education/:moduleId" element={<EducationModulePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => localStorage.clear())

describe('the Education page', () => {
  it('groups the modules in treatment order, with a place to start', () => {
    open('/education')
    for (const g of ['Foundations', 'Assessment', 'Treatment', 'Working with parents', 'The app']) {
      expect(screen.getByRole('heading', { name: g })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /Start here/ })).toHaveTextContent('1. Understanding Anxiety')
    expect(screen.getByRole('img', { name: '0 of 8 modules done' })).toBeInTheDocument()
  })

  it('offers to continue the module last opened', () => {
    localStorage.setItem('education_started_downward-arrow', 'true')
    localStorage.setItem('education_last_opened', 'downward-arrow')
    open('/education')
    expect(screen.getByRole('button', { name: /Continue where you left off/ })).toHaveTextContent('4. The Downward Arrow')
  })
})

describe('a module', () => {
  it('shows its sections, its diagrams and what you will learn', () => {
    open('/education/understanding-anxiety')
    expect(screen.getByRole('heading', { level: 1, name: 'Understanding Anxiety' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'On this page' })).toHaveTextContent('The anxiety cycle')
    expect(screen.getByRole('img', { name: /The anxiety cycle/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /The Worry Hill/ })).toBeInTheDocument()
    expect(localStorage.getItem('education_started_understanding-anxiety')).toBe('true')
  })

  it('the quiz shows straight away whether an answer is right, and why', () => {
    open('/education/understanding-anxiety')
    expect(screen.getByText('Question 1 of 5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Genetic predisposition/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Not quite.')
    expect(screen.getByRole('button', { name: /Genetic predisposition/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(screen.getByText('Question 2 of 5')).toBeInTheDocument()
  })

  it('the exercise shows the model answer once each task has an answer', () => {
    open('/education/assessment-tools')
    const show = screen.getByRole('button', { name: 'Show the model answer' })
    expect(show).toBeDisabled()
    screen.getAllByPlaceholderText('Your answer').forEach(t => fireEvent.change(t, { target: { value: 'x' } }))
    fireEvent.click(show)
    expect(screen.getByText('Model answer')).toBeInTheDocument()
    expect(localStorage.getItem('education_complete_assessment-tools')).toBe('true')
  })
})
