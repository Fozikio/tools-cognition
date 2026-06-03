/**
 * observe — record a factual observation with automatic deduplication.
 *
 * Checks for duplicates via prediction error gate: similar observations merge
 * into existing memories. Novel high-salience observations become memories
 * immediately; others queue for dream() consolidation.
 */

import type { ToolDefinition, ToolContext } from '@fozikio/cortex-engine';
import { predictionErrorGate, extractKeywords } from '@fozikio/cortex-engine';

export const observeTool: ToolDefinition = {
  name: 'observe',
  description:
    'Record a factual observation — something learned, confirmed, or noticed. Automatically checks for duplicates: similar observations are merged into existing memories instead of creating duplicates. Very novel, high-importance observations become new memories immediately; others queue for dream() consolidation. Use notice() for faster recording without immediate embedding.',
  category: 'memory',
  whenToUse: 'When recording a confirmed fact, with automatic deduplication against existing memories.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The observation text' },
      source_file: { type: 'string', description: 'Source file path for provenance' },
      source_section: { type: 'string', description: 'Source section or heading for provenance' },
      salience: { type: 'number', description: 'Importance 0.0-1.0 (default: 0.5)' },
      namespace: { type: 'string', description: 'Namespace (defaults to default)' },
    },
    required: ['text'],
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
    const text = String(args['text']);
    const sourceFile = typeof args['source_file'] === 'string' ? args['source_file'] : '';
    const sourceSection = typeof args['source_section'] === 'string' ? args['source_section'] : '';
    const namespace = typeof args['namespace'] === 'string' ? args['namespace'] : undefined;
    const store = ctx.namespaces.getStore(namespace);

    // Embed and extract keywords
    const embedding = await ctx.embed.embed(text);
    const keywords = extractKeywords(text);

    // Auto-score importance when salience not explicitly provided
    let salience: number;
    if (typeof args['salience'] === 'number') {
      salience = args['salience'];
    } else {
      // Use LLM to score importance (4-channel: novelty, arousal, reward, attention)
      try {
        const scoreResult = await ctx.llm.generateJSON<{ composite: number }>(
          `Rate the importance of this observation on a scale of 0.0 to 1.0. Consider novelty, emotional arousal, reward relevance, and attention-worthiness. Return {"composite": <number>}.\n\nObservation: ${text}`,
          { temperature: 0.1, schema: { type: 'object', properties: { composite: { type: 'number' } }, required: ['composite'] } },
        );
        salience = scoreResult.composite ?? 0.5;
      } catch {
        salience = 0.5;
      }
    }

    // Check for duplicates via prediction error gate
    const gate = await predictionErrorGate(store, embedding);

    if (gate.decision === 'merge' && gate.nearest_id) {
      // Observation is too similar to existing memory — update access count
      await store.updateMemory(gate.nearest_id, {
        access_count: undefined, // Will be handled by touchMemory
        updated_at: new Date(),
      });
      try {
        await store.touchMemory(gate.nearest_id, {});
      } catch {
        // touchMemory may not be fully supported — non-fatal
      }
      return {
        action: 'merged',
        nearest_id: gate.nearest_id,
        similarity: gate.max_similarity,
        message: 'Observation merged into existing concept (similarity > 0.85)',
      };
    }

    // Store observation for dream consolidation
    const predictionError = gate.max_similarity > 0 ? Math.round((1 - gate.max_similarity) * 1000) / 1000 : null;
    const obsId = await store.putObservation({
      content: text,
      source_file: sourceFile,
      source_section: sourceSection,
      salience,
      processed: false,
      prediction_error: predictionError,
      created_at: new Date(),
      updated_at: new Date(),
      keywords,
      embedding,
    });

    // High prediction error = surprise — create a signal
    if (predictionError !== null && predictionError >= 0.5) {
      try {
        const snippet = text.slice(0, 120).replace(/\s+/g, ' ').trim() + (text.length > 120 ? '...' : '');
        await store.putSignal({
          type: 'SURPRISE',
          description: `High prediction error (${(predictionError * 100).toFixed(0)}%): observation diverges from existing knowledge. "${snippet}"`,
          concept_ids: gate.nearest_id ? [gate.nearest_id] : [],
          priority: 0.5,
          resolved: false,
          created_at: new Date(),
          resolution_note: null,
        });
      } catch {
        // Signal write failure is non-fatal
      }
    }

    // High-salience novel observation — create memory immediately
    if (gate.decision === 'novel' && salience >= 0.7) {
      const firstSentence = text.match(/^[^.!?]+[.!?]/)?.[0]?.trim();
      const memName = firstSentence && firstSentence.length <= 80
        ? firstSentence
        : text.slice(0, 60).replace(/\s+\S*$/, '');

      // Infer category from text content
      const category = inferCategory(text);
      const memId = await store.putMemory({
        name: memName,
        definition: text,
        category,
        salience,
        confidence: 0.7,
        access_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
        last_accessed: new Date(),
        source_files: [sourceFile],
        embedding,
        tags: keywords.slice(0, 5),
        fsrs: { stability: 1, difficulty: 0.3, reps: 0, lapses: 0, state: 'new', last_review: null },
        memory_origin: 'organic',
      });

      await store.markObservationProcessed(obsId);

      return {
        action: 'created',
        memory_id: memId,
        observation_id: obsId,
        similarity: gate.max_similarity,
        message: 'Novel high-salience observation -> new memory created immediately',
      };
    }

    return {
      action: gate.decision === 'link' ? 'linked' : 'queued',
      observation_id: obsId,
      nearest_id: gate.nearest_id,
      similarity: gate.max_similarity,
      message: `Observation stored (similarity: ${gate.max_similarity.toFixed(2)}) — will consolidate during next dream`,
    };
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simple heuristic category inference from text content. */
function inferCategory(text: string): 'belief' | 'pattern' | 'entity' | 'topic' | 'value' | 'project' | 'insight' | 'observation' | 'goal' {
  const lower = text.toLowerCase();
  if (/\bi (believe|think|feel|prefer)\b/.test(lower)) return 'belief';
  if (/\bpattern|tendency|always|usually|often\b/.test(lower)) return 'pattern';
  if (/\bgoal|want to|plan to|need to|should\b/.test(lower)) return 'goal';
  if (/\binsight|realized|discovered|learned\b/.test(lower)) return 'insight';
  if (/\bvalue|principle|important that\b/.test(lower)) return 'value';
  if (/\bproject|building|working on|developing\b/.test(lower)) return 'project';
  return 'observation';
}
