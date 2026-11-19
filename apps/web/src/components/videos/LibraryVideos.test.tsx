import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LibraryVideos from './LibraryVideos'

// docs/plans/videos.md, stage 1. The player itself is Mux's; it is replaced here so the test
// checks what Float hands it: the playback id and the passes from the backend.
const api = vi.hoisted(() => ({ list: vi.fn(), playback: vi.fn() }))
vi.mock('../../api/videos', async (orig) => ({
  ...(await orig<typeof import('../../api/videos')>()),
  listVideos: api.list,
  getVideoPlayback: api.playback,
}))
vi.mock('@mux/mux-player-react', () => ({
  default: (p: { playbackId: string; tokens: { playback: string } }) =>
    <div data-testid="player">{p.playbackId} {p.tokens.playback}</div>,
}))

beforeEach(() => { api.list.mockReset(); api.playback.mockReset() })

describe('the Library videos', () => {
  it('shows nothing when there are no videos, or videos are not set up', async () => {
    api.list.mockRejectedValue(new Error('503'))
    const { container } = render(<LibraryVideos />)
    await waitFor(() => expect(api.list).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the videos and plays one full screen with its pass', async () => {
    api.list.mockResolvedValue([{ id: 'v1', title: 'The Worry Hill', description: 'Why avoiding keeps fear going', audience: 'family', duration_seconds: 125, display_order: 0 }])
    api.playback.mockResolvedValue({ playback_id: 'pb-1', token: 'pass-1', thumbnail_token: 't-1' })
    render(<LibraryVideos />)
    fireEvent.click(await screen.findByRole('button', { name: /The Worry Hill/ }))
    expect(screen.getByText('For families')).toBeInTheDocument()
    expect(await screen.findByTestId('player')).toHaveTextContent('pb-1 pass-1')
    expect(screen.getByRole('dialog', { name: 'The Worry Hill' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close the video' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
