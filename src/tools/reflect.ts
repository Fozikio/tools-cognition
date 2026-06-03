/**
 * reflect — generate a short reflective passage about a memory, signal, or observation.
 *
 * Uses LLM to produce thoughtful reflection, then stores it in
 * the reflections collection with source_type and source_id.
 */

import type { ToolDefinition, ToolContext } from '@fozikio/cortex-engine';

const REFLECTIONS_COLLECTION = 'reflections';
const SIGNALS_COLLECTION = 'signals';
const OBSERVATIONS_COLLECTION = 'observations';

export const reflectTool: ToolDefinition = {
  name: 'reflect',
  description:
    'Generate and store a short reflective passage about a memory, signal, or observation. Provide exactly one of memory_id, signal_id, or observation_id. The reflection is saved permanently. Use for deeper processing of important items rather than routine recording — for routine recording use observe().',
  category: 'consolidation',
  whenToUse: 'When processing a memory, signal, or observation more deeply to surface insight.',
  inputSchema: {
    type: 'object',
    properties: {
      memory_id: { type: 'string', description: 'Memory document ID' },
      signal_id: { type: 'string', description: 'Signal document ID' },
      observation_id: { type: 'string', description: 'Observation document ID' },
      namespace: { type: 'string', description: 'Namespace (defaults to default)' },
    },
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
    const memoryId = typeof args['memory_id'] === 'string' ? args['memory_id'] : undefined;
    const signalId = typeof args['signal_id'] === 'string' ? args['signal_id'] : undefined;
    const observationId = typeof args['observation_id'] === 'string' ? args['observation_id'] : undefined;
    const namespace = typeof args['namespace'] === 'string' ? args['namespace'] : undefined;
    const store = ctx.namespaces.getStore(namespace);

    const provided = [memoryId, signalId, observationId].filter(Boolean);
    if (provided.length !== 1) {
      return { error: 'Provide exactly one of memory_id, signal_id, or observation_id.' };
    }

    let context: string;
    let sourceType: string;
    let sourceId: string;

    if (memoryId) {
      const mem = await store.getMemory(memoryId);
      if (!mem) return { error: `Memory ${memoryId} not found` };
      context = `${mem.name}: ${mem.definition}`.trim();
      sourceType = 'memory';
      sourceId = memoryId;
    } else if (signalId) {
      const doc = await store.get(SIGNALS_COLLECTION, signalId);
      if (!doc) return { error: `Signal ${signalId} not found` };
      context = `[${doc['type'] ?? 'signal'}] ${doc['description'] ?? ''}`.trim();
      sourceType = 'signal';
      sourceId = signalId;
    } else {
      const doc = await store.get(OBSERVATIONS_COLLECTION, observationId!);
      if (!doc) return { error: `Observation ${observationId} not found` };
      context = typeof doc['content'] === 'string' ? doc['content'] : '';
      sourceType = 'observation';
      sourceId = observationId!;
    }

    if (!context) {
      return { error: 'Entity has no content to reflect on' };
    }

    // Generate reflective passage via LLM
    const reflectionText = await ctx.llm.generate(
      `Write a short reflective passage (2-4 sentences) about this concept. Consider what it means, what it connects to, what questions it raises, and what might be missing. Be thoughtful, not comprehensive.\n\nConcept: ${context}`,
      { temperature: 0.7 },
    );

    // Store the reflection
    const refId = await store.put(REFLECTIONS_COLLECTION, {
      source_type: sourceType,
      source_id: sourceId,
      content: reflectionText,
      created_at: new Date().toISOString(),
    });

    const snippet = reflectionText.length > 200
      ? reflectionText.slice(0, 197) + '...'
      : reflectionText;

    return { reflection_id: refId, snippet };
  },
};
