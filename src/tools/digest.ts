/**
 * digest — extract identity-rich content from text into typed observations.
 *
 * Uses LLM to categorize content into beliefs, questions, hypotheses,
 * reflections, and facts. Each item is stored with its correct content_type
 * so downstream tools (dream, query) can filter by type.
 *
 * Replaces manual observe() spam — the whole point is typed routing.
 */

import type { ToolDefinition, ToolContext } from '@fozikio/cortex-engine';
import { predictionErrorGate, extractKeywords } from '@fozikio/cortex-engine';
import type { MemoryCategory } from '@fozikio/cortex-engine';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExtractedItem {
  text: string;
  type: 'belief' | 'question' | 'hypothesis' | 'reflection' | 'fact';
  salience: number;
}

type ContentType = 'declarative' | 'interrogative' | 'speculative' | 'reflective';

const CONTENT_TYPE_MAP: Record<ExtractedItem['type'], ContentType> = {
  belief: 'declarative',
  question: 'interrogative',
  hypothesis: 'speculative',
  reflection: 'reflective',
  fact: 'declarative',
};

export const digestTool: ToolDefinition = {
  name: 'digest',
  description:
    "Extract identity-rich content from text into typed observations. LLM categorizes content into beliefs (declarative), questions (interrogative), hypotheses (speculative), reflections (reflective), and facts (declarative). Each item is stored with proper content_type and provenance. Use for ingesting journals, workshop pieces, mind files, creative writing — any content that has identity signal. Deduplicates via prediction error gate.",
  category: 'memory',
  whenToUse: 'When ingesting a document to extract facts as observations and generate reflections.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The text to digest' },
      source_file: { type: 'string', description: 'Source file path for provenance tracking' },
      namespace: { type: 'string', description: 'Namespace (defaults to default)' },
    },
    required: ['content'],
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
    const content = String(args['content']);
    const sourceFile = String(args['source_file'] ?? 'unknown');
    const namespace = typeof args['namespace'] === 'string' ? args['namespace'] : undefined;
    const store = ctx.namespaces.getStore(namespace);
    const startMs = Date.now();

    if (content.length < 20) {
      return { error: 'Content too short for extraction (minimum 20 characters)' };
    }

    // Extract typed items via LLM
    let items: ExtractedItem[];
    try {
      items = await extractItems(content, ctx);
    } catch (err) {
      return {
        extracted: 0,
        stored: 0,
        merged: 0,
        duration_ms: Date.now() - startMs,
        error: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (items.length === 0) {
      return {
        extracted: 0,
        stored: 0,
        merged: 0,
        duration_ms: Date.now() - startMs,
        message: 'No extractable items found in content',
      };
    }

    const results: Array<{ id: string; type: string; content_type: string; action: string }> = [];
    let merged = 0;
    let stored = 0;
    let memoriesCreated = 0;

    for (const item of items.slice(0, 10)) {
      if (!item.text || item.text.length < 10) continue;
      if (!CONTENT_TYPE_MAP[item.type]) continue;

      try {
        const embedding = await ctx.embed.embed(item.text);
        const gate = await predictionErrorGate(store, embedding);
        const contentType = CONTENT_TYPE_MAP[item.type];
        const itemSalience = typeof item.salience === 'number'
          ? Math.min(0.9, Math.max(0.3, item.salience))
          : 0.5;

        if (gate.decision === 'merge') {
          // Duplicate — touch existing memory
          if (gate.nearest_id) {
            try {
              await store.touchMemory(gate.nearest_id, {});
            } catch {
              // Non-fatal
            }
          }
          merged++;
          results.push({
            id: gate.nearest_id ?? '',
            type: item.type,
            content_type: contentType,
            action: 'merged',
          });
          continue;
        }

        const keywords = extractKeywords(item.text);
        const predictionError = Math.round((1 - gate.max_similarity) * 1000) / 1000;

        const obsId = await store.putObservation({
          content: item.text,
          source_file: sourceFile,
          source_section: `digest:extract:${item.type}`,
          salience: itemSalience,
          processed: false,
          prediction_error: predictionError,
          created_at: new Date(),
          updated_at: new Date(),
          keywords,
          embedding,
          content_type: contentType,
        });

        // High-salience novel items -> create memory immediately
        let action = gate.decision === 'link' ? 'linked' : 'queued';
        if (gate.decision === 'novel' && itemSalience >= 0.7) {
          const memName = item.text.length <= 80
            ? item.text
            : item.text.slice(0, 60).replace(/\s+\S*$/, '');

          await store.putMemory({
            name: memName,
            definition: item.text,
            category: inferCategory(item.text),
            salience: itemSalience,
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
          action = 'created';
          memoriesCreated++;
        }

        stored++;
        results.push({
          id: obsId,
          type: item.type,
          content_type: contentType,
          action,
        });
      } catch {
        // Single item failure — continue with rest
      }
    }

    return {
      extracted: items.length,
      stored,
      merged,
      memories_created: memoriesCreated,
      duration_ms: Date.now() - startMs,
      items: results,
      source_file: sourceFile,
    };
  },
};

// ─── LLM Extraction ─────────────────────────────────────────────────────────

async function extractItems(content: string, ctx: ToolContext): Promise<ExtractedItem[]> {
  const snippet = content.length > 3000 ? content.slice(0, 3000) + '...' : content;

  const prompt =
    `Extract structured knowledge from this text. Categorize each item:\n\n` +
    `- belief: a position held, value, preference, opinion, or aesthetic choice\n` +
    `- question: an open question, curiosity, or unresolved wonder\n` +
    `- hypothesis: an untested idea, speculation, or "what if"\n` +
    `- reflection: a synthesized insight, emotional response, or pattern noticed\n` +
    `- fact: a concrete, verified piece of information\n\n` +
    `Return a JSON array. Each item: { "text": "...", "type": "belief|question|hypothesis|reflection|fact", "salience": 0.3-0.9 }\n` +
    `IMPORTANT: Keep "text" values SHORT — one sentence max, 15-30 words. Distill, don't quote.\n` +
    `Higher salience for strongly held beliefs, recurring patterns, and emotional reactions.\n` +
    `Only include items with real substance — skip filler and operational noise. Max 8 items.\n` +
    `If nothing worth extracting, return [].\n\n` +
    `Text:\n${snippet}`;

  const raw = await ctx.llm.generate(prompt, { temperature: 0.2 });

  // Clean LLM output: strip code fences, fix common JSON issues
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  try {
    const items = JSON.parse(cleaned);
    return Array.isArray(items) ? items : [];
  } catch (e1) {
    // LLM produced invalid JSON — try to extract array via regex
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const items = JSON.parse(match[0]);
        return Array.isArray(items) ? items : [];
      } catch { /* truly broken */ }
    }
    const preview = cleaned.slice(0, 200);
    throw new Error(`JSON parse failed: ${e1 instanceof Error ? e1.message : String(e1)}. Response preview: ${preview}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferCategory(text: string): MemoryCategory {
  const lower = text.toLowerCase();
  if (/\bi (believe|think|feel|prefer)\b/.test(lower)) return 'belief';
  if (/\bpattern|tendency|always|usually|often\b/.test(lower)) return 'pattern';
  if (/\bgoal|want to|plan to|need to|should\b/.test(lower)) return 'goal';
  if (/\binsight|realized|discovered|learned\b/.test(lower)) return 'insight';
  if (/\bvalue|principle|important that\b/.test(lower)) return 'value';
  if (/\bproject|building|working on|developing\b/.test(lower)) return 'project';
  return 'observation';
}
