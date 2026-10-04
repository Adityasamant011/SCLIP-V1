/** Product intent handshake: initialize lifecycle before asking Hermes to review.
 * No issue or creative action is selected by this request. */
export async function startAutonomousReview(mcp: { url: string; bearer_token: string }, projectId: string): Promise<{ url: string; review_id: string }> {
  const url = new URL(mcp.url)
  url.pathname = '/mcp/reviews'
  url.search = ''
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${mcp.bearer_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId }) })
  if (!response.ok) throw new Error(`Autonomous review initialization failed (${response.status})`)
  return await response.json() as { url: string; review_id: string }
}
