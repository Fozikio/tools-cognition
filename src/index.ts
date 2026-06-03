/**
 * @fozikio/tools-cognition — cognitive tools plugin for cortex-engine.
 *
 * Provides 12 tools: observe, wonder, speculate, believe, belief, recall,
 * wander, dream, reflect, digest, predict, ruminate.
 *
 * These tools handle observation recording (typed by content), belief
 * management, memory consolidation, creative cognition, and proactive
 * knowledge surfacing.
 */

import type { ToolPlugin } from '@fozikio/cortex-engine';
import { observeTool } from './tools/observe.js';
import { wonderTool } from './tools/wonder.js';
import { speculateTool } from './tools/speculate.js';
import { believeTool } from './tools/believe.js';
import { beliefTool } from './tools/belief.js';
import { recallTool } from './tools/recall.js';
import { wanderTool } from './tools/wander.js';
import { dreamTool } from './tools/dream.js';
import { reflectTool } from './tools/reflect.js';
import { digestTool } from './tools/digest.js';
import { predictTool } from './tools/predict.js';
import { ruminateTool } from './tools/ruminate.js';

const plugin: ToolPlugin = {
  name: '@fozikio/tools-cognition',
  tools: [
    observeTool,
    wonderTool,
    speculateTool,
    believeTool,
    beliefTool,
    recallTool,
    wanderTool,
    dreamTool,
    reflectTool,
    digestTool,
    predictTool,
    ruminateTool,
  ],
};

export default plugin;

// Named re-exports for direct use
export { observeTool } from './tools/observe.js';
export { wonderTool } from './tools/wonder.js';
export { speculateTool } from './tools/speculate.js';
export { believeTool } from './tools/believe.js';
export { beliefTool } from './tools/belief.js';
export { recallTool } from './tools/recall.js';
export { wanderTool } from './tools/wander.js';
export { dreamTool } from './tools/dream.js';
export { reflectTool } from './tools/reflect.js';
export { digestTool } from './tools/digest.js';
export { predictTool } from './tools/predict.js';
export { ruminateTool } from './tools/ruminate.js';
