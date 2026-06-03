/**
 * wander — serendipitous graph traversal.
 *
 * Random walk through memories with occasional surprise jumps
 * to memories that are due for review. Hops between connected
 * concepts for serendipitous discovery.
 */

import type { ToolDefinition, ToolContext } from '@fozikio/cortex-engine';
import { retrievability } from '@fozikio/cortex-engine';
import type { CortexStore, FSRSData } from '@fozikio/cortex-engine';

interface WanderStep {
  name: string;
  definition: string;
  retrievability: number;
  type: 'start' | 'walk' | 'surprise_jump';
}

export const wanderTool: ToolDefinition = {
  name: 'wander',
  description:
    'Take a random walk through memories for serendipitous discovery. Hops between connected concepts with occasional surprise jumps to memories that are due for review. Use to surface forgotten or neglected knowledge. Optionally start from a specific topic. Use query() for targeted search instead.',
  category: 'graph',
  whenToUse: 'When exploring the memory graph by walking semantic links from a starting point.',
  inputSchema: {
    type: 'object',
    properties: {
      from_text: { type: 'string', description: 'Optional starting point (text to embed)' },
      steps: { type: 'number', description: 'Walk steps (default: 5)' },
      namespace: { type: 'string', description: 'Namespace (defaults to default)' },
    },
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
    const fromText = typeof args['from_text'] === 'string' ? args['from_text'] : undefined;
    const steps = typeof args['steps'] === 'number' ? args['steps'] : 5;
    const namespace = typeof args['namespace'] === 'string' ? args['namespace'] : undefined;
    const store = ctx.namespaces.getStore(namespace);
    const maxSteps = Math.min(steps, 10);

    const path: WanderStep[] = [];

    // Determine starting memory
    let currentId: string;
    if (fromText) {
      const embedding = await ctx.embed.embed(fromText);
      const nearest = await store.findNearest(embedding, 1);
      currentId = nearest[0]?.memory.id ?? await randomMemoryId(store);
    } else {
      currentId = await randomMemoryId(store);
    }

    if (!currentId) {
      return { steps: 0, path: [], note: 'No memories available to wander through.' };
    }

    for (let step = 0; step < maxSteps; step++) {
      const mem = await store.getMemory(currentId);
      if (!mem) break;

      const r = computeRetrievability(mem.fsrs);
      path.push({
        name: mem.name,
        definition: mem.definition,
        retrievability: Math.round(r * 100) / 100,
        type: step === 0 ? 'start' : r < 0.5 ? 'surprise_jump' : 'walk',
      });

      // Decide next step: surprise jump to overdue memory, or walk to neighbor
      const shouldJump = r > 0.7 && Math.random() < 0.4;
      if (shouldJump) {
        currentId = await overdueMemoryId(store) ?? await randomNeighborId(store, currentId) ?? currentId;
      } else {
        currentId = await randomNeighborId(store, currentId) ?? await randomMemoryId(store);
      }
    }

    return { steps: path.length, path };
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeRetrievability(fsrs: FSRSData): number {
  if (!fsrs.last_review) return 0.5;
  const lastReviewMs = fsrs.last_review instanceof Date
    ? fsrs.last_review.getTime()
    : typeof (fsrs.last_review as { toMillis?: () => number }).toMillis === 'function'
      ? (fsrs.last_review as { toMillis: () => number }).toMillis()
      : new Date(String(fsrs.last_review)).getTime();
  const elapsed = (Date.now() - lastReviewMs) / (1000 * 60 * 60 * 24);
  return retrievability(fsrs.stability, elapsed);
}

async function randomMemoryId(store: CortexStore): Promise<string> {
  // getAllMemories is expensive but is the only portable way to get a random memory
  const memories = await store.getRecentMemories(365, 20);
  if (memories.length === 0) return '';
  return memories[Math.floor(Math.random() * memories.length)].id;
}

async function randomNeighborId(store: CortexStore, fromId: string): Promise<string | null> {
  const edges = await store.getEdgesFrom(fromId);
  if (edges.length === 0) return null;
  const edge = edges[Math.floor(Math.random() * edges.length)];
  return edge.target_id;
}

async function overdueMemoryId(store: CortexStore): Promise<string | null> {
  // Find memories in review state, sorted by oldest review date
  // Use generic query since CortexStore doesn't have a specific method for this
  const results = await store.query(
    'memories',
    [{ field: 'fsrs.state', op: '==', value: 'review' }],
    { limit: 5, orderBy: 'fsrs.last_review', orderDir: 'asc' },
  );
  if (results.length === 0) return null;
  return typeof results[0]['id'] === 'string' ? results[0]['id'] : null;
}
