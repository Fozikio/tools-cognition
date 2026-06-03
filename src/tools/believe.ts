/**
 * believe — update a belief about an existing memory.
 *
 * Logs the previous definition, records why the belief changed,
 * re-embeds the new definition, and updates the memory in place.
 */

import type { ToolDefinition, ToolContext } from '@fozikio/cortex-engine';

export const believeTool: ToolDefinition = {
  name: 'believe',
  description:
    'Update what you believe about an existing memory. Logs the previous definition, records why the belief changed, and updates the memory in place. Use when your understanding of a concept has evolved — not for new observations. Requires the concept_id of the memory to update.',
  category: 'beliefs',
  whenToUse: 'When revising a belief\'s definition with a new understanding and the reason it changed.',
  inputSchema: {
    type: 'object',
    properties: {
      concept_id: { type: 'string', description: 'ID of the memory/concept being revised' },
      new_definition: { type: 'string', description: 'The updated definition or belief' },
      reason: { type: 'string', description: 'Why this belief is changing' },
      namespace: { type: 'string', description: 'Namespace (defaults to default)' },
    },
    required: ['concept_id', 'new_definition', 'reason'],
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
    const conceptId = String(args['concept_id']);
    const newDefinition = String(args['new_definition']);
    const reason = String(args['reason']);
    const namespace = typeof args['namespace'] === 'string' ? args['namespace'] : undefined;
    const store = ctx.namespaces.getStore(namespace);

    // Get the current memory
    const memory = await store.getMemory(conceptId);
    if (!memory) {
      return { error: `Memory not found: ${conceptId}`, concept_id: conceptId };
    }

    const oldDefinition = memory.definition;

    // Log belief change
    const beliefId = await store.putBelief({
      concept_id: conceptId,
      old_definition: oldDefinition,
      new_definition: newDefinition,
      reason,
      changed_at: new Date(),
    });

    // Re-embed the new definition
    let newEmbedding: number[] | undefined;
    try {
      newEmbedding = await ctx.embed.embed(newDefinition);
    } catch {
      // Embedding failure is non-fatal — update the text, skip embedding
    }

    // Update the memory with the new definition
    const updates: Partial<{ definition: string; updated_at: Date; embedding: number[] }> = {
      definition: newDefinition,
      updated_at: new Date(),
    };
    if (newEmbedding) {
      updates.embedding = newEmbedding;
    }
    await store.updateMemory(conceptId, updates);

    return {
      belief_id: beliefId,
      concept_id: conceptId,
      concept_name: memory.name,
      old_definition: oldDefinition,
      new_definition: newDefinition,
      reason,
    };
  },
};
