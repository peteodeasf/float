import { useState } from 'react'

interface Field {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  placeholder?: string
  required?: boolean
  options?: { value: string; label: string }[]
}

interface InlineFormProps {
  fields: Field[]
  onSubmit: (data: Record<string, any>) => void
  onCancel: () => void
  submitLabel?: string
  isLoading?: boolean
}

export default function InlineForm({
  fields,
  onSubmit,
  onCancel,
  submitLabel = 'Add',
  isLoading = false
}: InlineFormProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.key, '']))
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: Record<string, any> = {}
    fields.forEach(f => {
      if (values[f.key]) {
        data[f.key] = f.type === 'number' ? parseFloat(values[f.key]) : values[f.key]
      }
    })
    onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 rounded-lg p-4 space-y-3">
      {fields.map(field => (
        <div key={field.key}>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {field.label}
            {!field.required && <span className="text-slate-400 ml-1">(optional)</span>}
          </label>
          {field.type === 'select' ? (
            <select
              value={values[field.key]}
              onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {field.options?.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type}
              value={values[field.key]}
              onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              required={field.required}
              min={field.type === 'number' ? 0 : undefined}
              max={field.type === 'number' ? 10 : undefined}
              step={field.type === 'number' ? 0.5 : undefined}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Adding...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
