import { apiClient } from './client'

/** The setup screens. Every route acts on whoever is signed in. docs/plans/clinician-practice-onboarding.md */

export type SetupStep = 'details' | 'practice' | 'agreements'

export interface SetupState {
  role: 'clinician' | 'practice_manager'
  is_practice_owner: boolean
  steps: SetupStep[]
  next_step: SetupStep | null
  setup_complete: boolean
  email: string
  details: { name: string; credentials: string | null; phone_number: string | null }
  practice: { name: string; state: string | null; phone: string | null }
}

export interface Agreement {
  document: 'terms' | 'baa'
  version: string
  title: string
  body: string
}

export const getSetupState = async (): Promise<SetupState> => (await apiClient.get('/setup')).data

export const saveSetupDetails = async (data: {
  name: string; credentials: string | null; phone_number: string | null
}): Promise<SetupState> => (await apiClient.put('/setup/details', data)).data

export const saveSetupPractice = async (data: {
  name: string; state: string; phone: string | null
}): Promise<SetupState> => (await apiClient.put('/setup/practice', data)).data

export const getAgreements = async (): Promise<Agreement[]> => (await apiClient.get('/setup/agreements')).data

export const acceptAgreements = async (accepted: Agreement[], authorizedToSign: boolean): Promise<SetupState> =>
  (await apiClient.post('/setup/agreements', {
    accepted: accepted.map(a => ({ document: a.document, version: a.version })),
    authorized_to_sign: authorizedToSign,
  })).data
