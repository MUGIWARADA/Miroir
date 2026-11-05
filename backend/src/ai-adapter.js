// Extension seam for a future AI coach. Implementations may add explanatory
// text only; deterministic review scores and rule statuses stay authoritative.
export function createAiAdapter(provider = null) {
  return {
    async explain({ trade, review }) {
      if (!provider || typeof provider.explain !== 'function') return { status: 'not_configured' };
      try {
        const output = await provider.explain({ trade, review });
        if (!output || typeof output.summary !== 'string') return { status: 'unavailable' };
        return {
          status: 'available',
          summary: output.summary.slice(0, 1200),
          actions: Array.isArray(output.actions) ? output.actions.filter((item) => typeof item === 'string').slice(0, 5).map((item) => item.slice(0, 300)) : []
        };
      } catch {
        return { status: 'unavailable' };
      }
    }
  };
}
