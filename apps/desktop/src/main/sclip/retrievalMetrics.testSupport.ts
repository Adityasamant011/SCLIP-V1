/** Offline/shadow retrieval diagnostics, NOT creative scoring or runtime gates. */
type Window = { media_id: string; start_us: number; end_us: number }
type Passage = Window & { preceding?: string; following?: string }

export function retrievalMetrics(passages: Passage[], winners: Window[], k: number) {
  const selected = passages.slice(0, k)
  const coverage = winners.map(winner => {
    const spans = selected.filter(p => p.media_id === winner.media_id)
      .map(p => [Math.max(p.start_us, winner.start_us), Math.min(p.end_us, winner.end_us)])
      .filter(([a, b]) => b! > a!).sort((a, b) => a[0]! - b[0]!)
    let covered = 0, cursor = winner.start_us
    for (const [a, b] of spans) { covered += Math.max(0, b! - Math.max(cursor, a!)); cursor = Math.max(cursor, b!) }
    return { ...winner, covered_us: covered, coverage_fraction: covered / (winner.end_us - winner.start_us),
      fully_recalled: covered === winner.end_us - winner.start_us }
  })
  return { k, winner_recall_at_k: winners.length ? coverage.filter(w => w.fully_recalled).length / winners.length : null,
    winner_coverage: coverage,
    passages_with_neighbor_text: selected.filter(p => p.preceding || p.following).length,
    // Irrelevance needs human labels, not Jev's uncalibrated relevance values.
    irrelevant_passage_rate: null,
    note: 'Strict temporal winner coverage, not semantic/editorial quality. Human relevance/context review still required.' }
}
