/**
 * wonder — record an open question or curiosity.
 *
 * Stored with content_type 'interrogative' so questions don't pollute
 * knowledge retrieval. Surfaces during wander() and dream().
 */

import type { ToolDefinition, ToolContext } from '@fozikio/cortex-engine';
import { extractKeywords } from '@fozikio/cortex-engine';

export const wonderTool: ToolDefinition = {
  name: 'wonder',
  description:
    "Record an open question or curiosity — something you want to explore but haven't resolved. Stored separately from factual observations (content_type: 'interrogative') so questions don't pollute knowledge retrieval. Use observe() for facts, wonder() for questions, speculate() for hypotheses.",
  category: 'memory',
  whenToUse: 'When recording an open question to revisit or resolve later.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The question or curiosity (e.g. "Why does the sync daemon stall after 300k seconds?")',
      },
      salience: { type: 'number', description: 'Importance 0.0-1.0 (default: 0.5)' },
      context: { type: 'string', description: 'What prompted this question' },
      namespace: { type: 'string', description: 'Namespace (defaults to default)' },
    },
    required: ['text'],
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
    const text = String(args['text']);
    const salience = typeof args['salience'] === 'number' ? args['salience'] : 0.5;
    const context = String(args['context'] ?? '');
    const namespace = typeof args['namespace'] === 'string' ? args['namespace'] : undefined;
    const store = ctx.namespaces.getStore(namespace);

    const embedding = await ctx.embed.embed(text);
    const keywords = extractKeywords(text);

    const id = await store.putObservation({
      content: text,
      source_file: context,
      source_section: 'wonder',
      salience,
      processed: false,
      prediction_error: null,
      created_at: new Date(),
      updated_at: new Date(),
      keywords,
      embedding,
      content_type: 'interrogative',
    });

    return {
      id,
      content_type: 'interrogative',
      keywords,
      salience,
      message: 'Question recorded — will surface during wander() and dream() but excluded from default query() results.',
    };
  },
};
