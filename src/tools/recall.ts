/**
 * recall — time-based memory browsing.
 *
 * wander() is random. recall() is temporal — retrieve what was formed
 * or reinforced in a specific time window.
 */

import type { ToolDefinition, ToolContext } from '@fozikio/cortex-engine';

export const recallTool: ToolDefinition = {
  name: 'recall',
  description:
    'List recent observations and memories in chronological order. Use query() to search by meaning, recall() to see what was recorded lately. Filter by type (observations, memories, or both) and time window (default: last 7 days).',
  category: 'memory',
  whenToUse: 'When listing recent observations in chronological order, optionally filtered by type.',
  inputSchema: {
    type: 'object',
    properties: {
      days_ago: { type: 'number', description: 'Look back this many days (default: 7)' },
      limit: { type: 'number', description: 'Max results (default: 10)' },
      type: {
        type: 'string',
        enum: ['observations', 'memories', 'both'],
        description: 'What to retrieve (default: observations)',
      },
      namespace: { type: 'string', description: 'Namespace (defaults to default)' },
    },
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
    const daysAgo = typeof args['days_ago'] === 'number' ? Math.min(args['days_ago'], 90) : 7;
    const limit = typeof args['limit'] === 'number' ? Math.min(args['limit'], 20) : 10;
    const type = typeof args['type'] === 'string' ? args['type'] : 'observations';
    const namespace = typeof args['namespace'] === 'string' ? args['namespace'] : undefined;
    const store = ctx.namespaces.getStore(namespace);

    const cutoffMs = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffMs);

    const results: Array<{
      type: string;
      id: string;
      content: string;
      salience: number;
      when: string;
      prediction_error?: number | null;
    }> = [];

    if (type === 'observations' || type === 'both') {
      // Query observations created after the cutoff
      const observations = await store.query(
        'observations',
        [{ field: 'created_at', op: '>=', value: cutoffDate }],
        { limit, orderBy: 'created_at', orderDir: 'desc' },
      );

      for (const doc of observations) {
        const createdAt = doc['created_at'];
        const when = createdAt instanceof Date
          ? createdAt.toISOString().slice(0, 16)
          : typeof createdAt === 'string' ? createdAt.slice(0, 16) : '';
        results.push({
          type: 'observation',
          id: typeof doc['id'] === 'string' ? doc['id'] : '',
          content: typeof doc['content'] === 'string' ? doc['content'] : '',
          salience: typeof doc['salience'] === 'number' ? doc['salience'] : 0,
          when,
          prediction_error: typeof doc['prediction_error'] === 'number' ? doc['prediction_error'] : null,
        });
      }
    }

    if (type === 'memories' || type === 'both') {
      // Get recent memories — use getRecentMemories for time-scoped retrieval
      const memories = await store.getRecentMemories(daysAgo, limit);

      for (const mem of memories) {
        const when = mem.last_accessed instanceof Date
          ? mem.last_accessed.toISOString().slice(0, 16)
          : '';
        results.push({
          type: 'memory',
          id: mem.id,
          content: `${mem.name}: ${mem.definition}`,
          salience: mem.salience,
          when,
        });
      }
    }

    // Sort by time descending
    results.sort((a, b) => b.when.localeCompare(a.when));

    return {
      window_days: daysAgo,
      count: results.length,
      results: results.slice(0, limit),
    };
  },
};
