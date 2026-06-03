/**
 * dream — run the full memory consolidation cycle.
 *
 * Delegates to dreamConsolidate() from cortex-engine which handles all 7 phases:
 * cluster, refine, create, connect, score, abstract, report.
 *
 * This is a heavyweight operation (can take minutes).
 */

import type { ToolDefinition, ToolContext } from '@fozikio/cortex-engine';
import { dreamConsolidate } from '@fozikio/cortex-engine';

export const dreamTool: ToolDefinition = {
  name: 'dream',
  description:
    'Run the memory consolidation cycle — clusters unprocessed observations into memories, refines existing definitions, discovers new connections between concepts, scores memories for review priority, and generates a summary report. This is a heavyweight operation (can take minutes). Check sleep_pressure() first to see if consolidation is needed.',
  category: 'consolidation',
  whenToUse: 'When running a consolidation cycle to abstract and refine unconsolidated observations.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Namespace (defaults to default)' },
    },
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
    const namespace = typeof args['namespace'] === 'string' ? args['namespace'] : undefined;
    const store = ctx.namespaces.getStore(namespace);

    const result = await dreamConsolidate(store, ctx.embed, ctx.llm);

    return {
      phases_completed: 7,
      clustered: result.phases.cluster.clustered,
      unclustered: result.phases.cluster.unclustered,
      refined: result.phases.refine.refined,
      created: result.phases.create.created,
      edges_discovered: result.phases.connect.edges_discovered,
      memories_scored: result.phases.score.scored,
      report: result.phases.report.text,
      abstractions_created: result.phases.abstract.abstractions,
      total_processed: result.total_processed,
      integration_rate: result.integration_rate,
      fiedler_value: result.fiedler_value,
      duration_ms: result.duration_ms,
    };
  },
};
