import { llmApi } from './llm.js';
import { voiceApi } from './voice.js';
import { mediaApi } from './media.js';

export const api = { ...llmApi, ...voiceApi, ...mediaApi };
export * from './boppy.js';
export * from './giphy.js';
export * from './iplookup.js';
export * from './photiu.js';
export * from './songfinder.js';
export * from './youtube.js';
