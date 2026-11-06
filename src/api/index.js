/*export { llmApi } from './llm.js';
export { voiceApi } from './voice.js';
export { mediaApi } from './media.js';

export const api = { ...llmApi, ...voiceApi, ...mediaApi };
export * from './giphy.js';
export * from './iplookup.js';
export * from './photiu.js';
export * from './youtube.js'*/
import { llmApi } from './llm.js';
import { voiceApi } from './voice.js';
import { mediaApi } from './media.js';
export { llmApi, voiceApi, mediaApi };
export const api = { ...llmApi, ...voiceApi, ...mediaApi };

export * from './giphy.js';
export * from './iplookup.js';
export * from './photiu.js';
export * from './youtube.js';
