/**
 * speculate — record a hypothesis or untested idea.
 *
 * Stored with content_type 'speculative' so it's excluded from default
 * query results. Available for dream consolidation and explicit retrieval.
 */

import type { ToolDefinition, ToolContext } from '@fozikio/cortex-engine';
import { extractKeywords } from '@fozikio/cortex-engine';

export const speculateTool: ToolDefinition = {
  name: 'speculate',
  description:
    "Record a hypothesis or untested idea — something that might be true but hasn't been confirmed. Stored with content_type 'speculative' so it's excluded from default query results. Use observe() for confirmed facts, wonder() for questions, speculate() for \"what if\" ideas.",
  category: 'memory',
  whenToUse: 'When recording an untested hypothesis or speculative idea.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The hypothesis (e.g. "Prediction error might serve as a motivation signal for genuine curiosity")',
      },
      salience: { type: 'number', description: 'Importance 0.0-1.0 (default: 0.5)' },
      basis: { type: 'string', description: 'What evidence or reasoning supports this hypothesis' },
      namespace: { type: 'string', description: 'Namespace (defaults to default)' },
    },
    required: ['text'],
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
    const text = String(args['text']);
    const salience = typeof args['salience'] === 'number' ? args['salience'] : 0.5;
    const basis = String(args['basis'] ?? '');
    const namespace = typeof args['namespace'] === 'string' ? args['namespace'] : undefined;
    const store = ctx.namespaces.getStore(namespace);

    const embedding = await ctx.embed.embed(text);
    const keywords = extractKeywords(text);

    const id = await store.putObservation({
      content: text,
      source_file: basis,
      source_section: 'speculate',
      salience,
      processed: false,
      prediction_error: null,
      created_at: new Date(),
      updated_at: new Date(),
      keywords,
      embedding,
      content_type: 'speculative',
    });

    return {
      id,
      content_type: 'speculative',
      keywords,
      salience,
      message: 'Hypothesis recorded — excluded from default queries, but available for dream consolidation and explicit speculative retrieval.',
    };
  },
};
