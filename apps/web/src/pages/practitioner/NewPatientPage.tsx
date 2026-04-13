import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPatient } from '../../api/patients'

export default function NewPatientPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: createPatient,
    onSuccess: (patient) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] })
      navigate(`/patients/${patient.id}`)
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail ?? 'Failed to create patient')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    mutation.mutate({
      name,
      email,
      age: age ? Number(age) : undefined,
      gender: gender || undefined,
      phone_number: phone || undefined
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-xl font-semibold text-slate-800">Add patient</h1>
      </nav>

      <main className="px-8 py-8 max-w-lg mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Jamie Smith"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="jamie@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Phone number
                <span className="text-slate-400 font-normal ml-1">(optional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Age
                <span className="text-slate-400 font-normal ml-1">(optional)</span>
              </label>
              <input
                type="number"
                min="1"
                max="99"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="14"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Gender
                <span className="text-slate-400 font-normal ml-1">(optional)</span>
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
              >
                <option value="">Select...</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {mutation.isPending ? 'Creating...' : 'Add patient'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
