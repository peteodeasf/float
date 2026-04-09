import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDownwardArrow,
  createDownwardArrow,
  updateDownwardArrow,
  approveDownwardArrow,
  ArrowStep
} from '../../api/treatment'

interface Props {
  rungId: string
  patientId: string
}

export default function DownwardArrowPanel({ rungId, patientId: _patientId }: Props) {
  const queryClient = useQueryClient()
  const [newQuestion, setNewQuestion] = useState('')
  const [newResponse, setNewResponse] = useState('')
  const [fearedOutcome, setFearedOutcome] = useState('')
  const [bipDerived, setBipDerived] = useState('')
  const [showApproveForm, setShowApproveForm] = useState(false)

  const { data: arrow, isLoading } = useQuery({
    queryKey: ['downward-arrow', rungId],
    queryFn: () => getDownwardArrow(rungId)
  })

  const createMutation = useMutation({
    mutationFn: () => createDownwardArrow(rungId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downward-arrow', rungId] })
    }
  })

  const addStepMutation = useMutation({
    mutationFn: (steps: ArrowStep[]) => updateDownwardArrow(arrow!.id, {
      arrow_steps: steps
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downward-arrow', rungId] })
      setNewQuestion('')
      setNewResponse('')
    }
  })

  // updateOutcomeMutation reserved for inline outcome editing
  // const updateOutcomeMutation = useMutation({...})

  const approveMutation = useMutation({
    mutationFn: (data: { feared_outcome: string; bip_derived: number }) =>
      approveDownwardArrow(arrow!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downward-arrow', rungId] })
      queryClient.invalidateQueries({ queryKey: ['flags', undefined] })
      setShowApproveForm(false)
    }
  })

  const handleAddStep = () => {
    if (!arrow || !newQuestion || !newResponse) return
    const steps = [
      ...arrow.arrow_steps,
      { question: newQuestion, response: newResponse }
    ]
    addStepMutation.mutate(steps)
  }

  const handleApprove = () => {
    if (!fearedOutcome || !bipDerived) return
    approveMutation.mutate({
      feared_outcome: fearedOutcome,
      bip_derived: parseFloat(bipDerived)
    })
  }

  if (isLoading) return null

  if (!arrow) {
    return (
      <div className="mt-4 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Downward Arrow
          </p>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="text-xs text-teal-600 font-medium hover:underline"
          >
            + Start Downward Arrow
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Use the Downward Arrow to identify the child's most feared outcome for this rung
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          Downward Arrow
        </p>
        {arrow.feared_outcome_approved && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            ✓ Approved
          </span>
        )}
      </div>

      {/* Arrow steps */}
      {arrow.arrow_steps.length > 0 && (
        <div className="space-y-2 mb-4">
          {arrow.arrow_steps.map((step, i) => (
            <div key={i} className="flex gap-2">
              <div className="flex flex-col items-center">
                <div className="w-5 h-5 rounded-full bg-teal-100 text-teal-600 text-xs flex items-center justify-center font-medium shrink-0">
                  {i + 1}
                </div>
                {i < arrow.arrow_steps.length - 1 && (
                  <div className="w-px h-4 bg-teal-100 mt-1" />
                )}
              </div>
              <div className="pb-2">
                <p className="text-xs text-slate-400">{step.question}</p>
                <p className="text-sm text-slate-700 font-medium">{step.response}</p>
              </div>
            </div>
          ))}
          {/* Arrow pointing down to feared outcome */}
          {arrow.feared_outcome && (
            <div className="flex gap-2 items-start">
              <div className="flex flex-col items-center">
                <div className="w-px h-2 bg-teal-200" />
                <span className="text-teal-300 text-lg leading-none">↓</span>
              </div>
              <div>
                <p className="text-xs text-slate-400">Most feared outcome</p>
                <p className="text-sm font-semibold text-slate-800">
                  {arrow.feared_outcome}
                </p>
                {arrow.bip_derived !== null && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    BIP: {arrow.bip_derived}%
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add next step */}
      {!arrow.feared_outcome_approved && (
        <div className="bg-slate-50 rounded-lg p-3 space-y-2 mb-3">
          <p className="text-xs font-medium text-slate-500">
            {arrow.arrow_steps.length === 0
              ? 'Start: ask the child what they fear will happen'
              : 'Next: drill down further'}
          </p>
          <input
            type="text"
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            placeholder="What will happen if...?"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <input
            type="text"
            value={newResponse}
            onChange={e => setNewResponse(e.target.value)}
            placeholder="Child's response"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            onClick={handleAddStep}
            disabled={!newQuestion || !newResponse || addStepMutation.isPending}
            className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            Add step
          </button>
        </div>
      )}

      {/* Approve feared outcome */}
      {arrow.arrow_steps.length >= 2 && !arrow.feared_outcome_approved && (
        <>
          {!showApproveForm ? (
            <button
              onClick={() => {
                setFearedOutcome(arrow.feared_outcome ?? '')
                setBipDerived(arrow.bip_derived?.toString() ?? '')
                setShowApproveForm(true)
              }}
              className="text-xs text-green-600 font-medium hover:underline"
            >
              ✓ Approve feared outcome and set BIP
            </button>
          ) : (
            <div className="bg-green-50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-green-700">
                Confirm the most feared outcome is drilled down sufficiently
              </p>
              <input
                type="text"
                value={fearedOutcome}
                onChange={e => setFearedOutcome(e.target.value)}
                placeholder="Most feared outcome"
                className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={bipDerived}
                  onChange={e => setBipDerived(e.target.value)}
                  placeholder="BIP %"
                  min={0} max={100}
                  className="w-24 px-3 py-2 border border-green-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <span className="text-xs text-green-600">% belief this will occur</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowApproveForm(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={!fearedOutcome || !bipDerived || approveMutation.isPending}
                  className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {approveMutation.isPending ? 'Approving...' : 'Approve'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
