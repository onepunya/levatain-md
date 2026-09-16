import { llmApi } from './llm.js';
import { voiceApi } from './voice.js';
import { mediaApi } from './media.js';

export const api = { ...llmApi, ...voiceApi, ...mediaApi };
