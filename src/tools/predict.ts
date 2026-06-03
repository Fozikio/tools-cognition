/**
 * predict — proactive knowledge surfacing.
 *
 * Looks at recent observations and an optional hint to surface
 * knowledge you might need next. Unlike query() which answers a
 * specific question, predict() surfaces knowledge proactively.
 */

import type { ToolDefinition, ToolContext } from '@fozikio/cortex-engine';
import { hydeExpand, spreadActivation } from '@fozikio/cortex-engine';

const LOOKBACK_HOURS = 24;
const TOP_K = 5;

export const predictTool: ToolDefinition = {
  name: 'predict',
  description:
    "Anticipate what memories might be relevant given your current context. Looks at recent observations and an optional hint to surface knowledge you might need next. Unlike query() which answers a specific question, predict() surfaces knowledge proactively. Best used at session start or when switching tasks.",
  category: 'memory',
  whenToUse: 'When generating a prediction from current context to test against what actually happens.',
  inputSchema: {
    type: 'object',
    properties: {
      context: { type: 'string', description: "Optional: what you're currently working on or thinking about" },
      namespace: { type: 'string', description: 'Namespace (defaults to default)' },
    },
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
    const contextHint = typeof args['context'] === 'string' ? args['context'] : '';
    const namespace = typeof args['namespace'] === 'string' ? args['namespace'] : undefined;
    const store = ctx.namespaces.getStore(namespace);

    // Gather recent observations as implicit context
    const sinceDate = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);
    const recentObs = await store.query(
      'observations',
      [{ field: 'created_at', op: '>=', value: sinceDate }],
      { limit: 10, orderBy: 'created_at', orderDir: 'desc' },
    );

    const recentObservations = recentObs
      .map((d) => typeof d['content'] === 'string' ? d['content'] : '')
      .join(' ');

    // Build composite context: recent activity + optional hint
    const compositeContext = [recentObservations, contextHint]
      .filter(Boolean)
      .join('\n\n');

    if (!compositeContext.trim()) {
      return {
        predicted: [],
        note: 'No recent context to predict from. Pass context= to provide a hint.',
      };
    }

    // HyDE-expand the composite context and search
    const embedding = await hydeExpand(compositeContext, ctx.llm, ctx.embed);
    const initial = await store.findNearest(embedding, TOP_K * 2);
    const activated = await spreadActivation(store, initial, embedding, 1);

    // Temporal weighting — boost recently updated memories
    const now = Date.now();
    const reranked = activated
      .map((r) => {
        const updatedAt = r.memory.updated_at instanceof Date
          ? r.memory.updated_at.getTime()
          : typeof (r.memory.updated_at as { toMillis?: () => number }).toMillis === 'function'
            ? (r.memory.updated_at as { toMillis: () => number }).toMillis()
            : new Date(String(r.memory.updated_at)).getTime();
        const ageDays = (now - updatedAt) / (1000 * 60 * 60 * 24);
        const recency = Math.exp(-ageDays / 30);
        return { ...r, score: r.score * (1 + 0.3 * recency) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    // Touch to reinforce
    await Promise.all(
      reranked.map((r) =>
        store.touchMemory(r.memory.id, {}).catch(() => { /* non-fatal */ })
      ),
    );

    return {
      predicted: reranked.map((r) => ({
        id: r.memory.id,
        name: r.memory.name,
        definition: r.memory.definition,
        category: r.memory.category,
        score: Math.round(r.score * 1000) / 1000,
      })),
      context_used: {
        recent_observations: recentObs.length,
        hint_provided: Boolean(contextHint),
      },
    };
  },
};
