import { Button, Card, Select, TextInput } from '../../components/ui/primitives'
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
  const [parentName, setParentName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parent2Name, setParent2Name] = useState('')
  const [parent2Email, setParent2Email] = useState('')
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
    // One or two parent/guardian contacts. Drop a row that has neither a name nor an email.
    const parentContacts = [
      { name: parentName.trim() || undefined, email: parentEmail.trim() || undefined },
      { name: parent2Name.trim() || undefined, email: parent2Email.trim() || undefined },
    ].filter(c => c.name || c.email)
    mutation.mutate({
      name,
      email,
      age: age ? Number(age) : undefined,
      gender: gender || undefined,
      phone_number: phone || undefined,
      parent_phone: parentPhone || undefined,
      parent_contacts: parentContacts.length ? parentContacts : undefined,
    })
  }

  const labelStyle = { color: 'var(--float-text)' }
  const optionalStyle = { color: 'var(--float-text-hint)' }

  return (
    <div className="min-h-screen" style={{ background: 'var(--float-bg)' }}>
      <nav
        className="px-8 py-4 flex items-center gap-4"
        style={{ background: 'var(--float-surface)', borderBottom: '1px solid var(--float-border)' }}
      >
        <Button kind="quiet" size="sm" onClick={() => navigate('/dashboard')}>
          ← Back
        </Button>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--float-text)' }}>Add patient</h1>
      </nav>

      <main className="px-8 py-8 max-w-lg mx-auto">
        <Card style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>
                Full name
              </label>
              <TextInput
                block
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jamie Smith"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>
                Email
              </label>
              <TextInput
                block
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jamie@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>
                Phone number
                <span className="font-normal ml-1" style={optionalStyle}>(optional)</span>
              </label>
              <TextInput
                block
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>
                Age
                <span className="font-normal ml-1" style={optionalStyle}>(optional)</span>
              </label>
              <TextInput
                block
                type="number"
                min="1"
                max="99"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="14"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>
                Gender
                <span className="font-normal ml-1" style={optionalStyle}>(optional)</span>
              </label>
              <Select
                block
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">Select...</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </Select>
            </div>

            <div className="pt-4" style={{ borderTop: '1px solid var(--float-border)' }}>
              <p className="text-sm font-semibold" style={labelStyle}>Parent / guardian 1</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>
                Name
                <span className="font-normal ml-1" style={optionalStyle}>(optional)</span>
              </label>
              <TextInput
                block
                type="text"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                placeholder="Sarah Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>
                Email
                <span className="font-normal ml-1" style={optionalStyle}>(optional)</span>
              </label>
              <TextInput
                block
                type="email"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
                placeholder="parent@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>
                Phone
                <span className="font-normal ml-1" style={optionalStyle}>(optional)</span>
              </label>
              <TextInput
                block
                type="text"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="pt-4" style={{ borderTop: '1px solid var(--float-border)' }}>
              <p className="text-sm font-semibold" style={labelStyle}>Parent / guardian 2</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>
                Name
                <span className="font-normal ml-1" style={optionalStyle}>(optional)</span>
              </label>
              <TextInput
                block
                type="text"
                value={parent2Name}
                onChange={(e) => setParent2Name(e.target.value)}
                placeholder="Alex Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>
                Email
                <span className="font-normal ml-1" style={optionalStyle}>(optional)</span>
              </label>
              <TextInput
                block
                type="email"
                value={parent2Email}
                onChange={(e) => setParent2Email(e.target.value)}
                placeholder="parent2@example.com"
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: 'var(--float-danger)' }}>{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                kind="secondary"
                onClick={() => navigate('/dashboard')}
                style={{ flex: 1 }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                kind="primary"
                disabled={mutation.isPending}
                style={{ flex: 1 }}
              >
                {mutation.isPending ? 'Creating...' : 'Add patient'}
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  )
}
