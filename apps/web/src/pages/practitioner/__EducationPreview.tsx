import { useParams } from 'react-router-dom'
import EducationIndexPage from './EducationIndexPage'
import EducationModulePage from './EducationModulePage'

/** Dev only: the clinician's Education pages without signing in. docs/plans/education-redesign.md */
export default function EducationPreview() {
  const { moduleId } = useParams<{ moduleId: string }>()
  return moduleId
    ? <EducationModulePage basePath="/__education-preview" />
    : <EducationIndexPage basePath="/__education-preview" />
}
