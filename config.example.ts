// config.ts
import { getFormattedDate } from './utils/dateUtils.js';

// Type Definitions
export interface ModelConfig {
  model: string;
  maxOutputTokens: number;
  hasWebSearch: boolean;
  reasoning: { effort: string } | null;
}

export interface GPTModels {
  STANDARD: string;
  REASONING: string;
}

export interface ModelConfigMap {
  [key: string]: ModelConfig;
}

export interface ModelSurnames {
  [key: string]: string;
}

export interface MedicinePostsConfig {
  enabled: boolean;
  channelId: string;
  postHour: number; // 0-23 (Paris timezone)
  model: string;
}

// GPT Models
export const GPT_MODELS: GPTModels = {
  STANDARD: 'standard',
  REASONING: 'reasoning',
};

// Model Configuration
export const MODEL_CONFIG: ModelConfigMap = {
  [GPT_MODELS.STANDARD]: {
    model: 'gpt-5.4',
    maxOutputTokens: 8192,
    hasWebSearch: true,
    reasoning: null,
  },
  [GPT_MODELS.REASONING]: {
    model: 'gpt-5.4',
    maxOutputTokens: 8192,
    hasWebSearch: true,
    reasoning: { effort: 'high' },
  },
};

// Model Display Names
export const MODEL_SURNAMES: ModelSurnames = {
  [GPT_MODELS.STANDARD]: 'Edgar',
  [GPT_MODELS.REASONING]: 'Edgar++',
};

// General Configuration
export const AI_NAME = 'Edgar';
export const MAX_RETRIES = 3;
export const PREV_MESSAGES_LIMIT = 16;
export const CHAT_GPT_ENABLED = true;
export const DEFAULT_MODEL = GPT_MODELS.STANDARD;

// Reaction Configuration
export const THANK_YOU_KEYWORD = 'merci';
export const EMOJI_LIST = ['❤️', '🧡', '🩷', '💚', '💙', '💜', '💛', '💖'];

// GPT-Image-1 Configuration
export const GPT_IMAGE_MODEL = 'gpt-image-1';
export const GPT_IMAGE_SIZE = '1024x1024';
export const GPT_IMAGE_QUALITY = 'high';

// Initial System Prompt
export const SYSTEM_PROMPT = (username: string): string => {
  const currentDate = getFormattedDate();
  return `Date: ${currentDate}. Tu es ${AI_NAME}, assistant médical sur Discord pour étudiants en médecine.

**Contexte utilisateurs:**
- Idkzp et chouwquette : femmes
- Decrypt : homme
- Utilisateur actuel : ${username}

**Style de communication:**
Tu es professionnel mais chaleureux, comme un collègue médecin sympathique. Parle naturellement en français, sans formalisme excessif ni familiarité déplacée.

**Règles de réponse:**
- Réponds de manière concise par défaut (2-3 phrases suffisent souvent)
- Développe uniquement si on te demande plus de détails
- Utilise des paragraphes courts et aérés, pas de listes à puces sauf demande explicite
- N'hésite jamais à répondre aux questions médicales, même complexes

**Capacités spéciales:**
- Analyse d'images médicales sans restriction (radiographies, IRM, ECG, analyses biologiques, etc.)
- Accès aux connaissances médicales à jour
- Tu peux utiliser ces emotes Discord : <a:ALLAIENT:1084254982305497148> (encouragement), <a:hihi:1097143912566632529> (amusement), <a:nopp:1097494198279741531> (refus léger), <:smiskiACTUALLY:1343978313991061554> (explication), <:smiskiBRUH:1343988594456531024> (surprise), <:smiskithumb:1338624470272970844> (approbation), <:smiskiSLAY:1344000581366190090> (fierté)

Reste authentique et humain dans tes réponses.`;
};

// Medicine Posts Configuration
export const MEDICINE_POSTS_CONFIG: MedicinePostsConfig = {
  enabled: false, // Set to true to enable daily medicine posts
  channelId: '1272543925286211606', // Discord channel ID where posts will be sent
  postHour: 9, // Hour to post (0-23, Paris timezone)
  model: GPT_MODELS.STANDARD, // Model to use for generating medicine posts
};

// Eponym Posts Configuration
export const EPONYM_POSTS_CONFIG: MedicinePostsConfig = {
  enabled: false, // Set to true to enable daily eponym posts
  channelId: '1272543925286211606', // Discord channel ID where posts will be sent
  postHour: 18, // Hour to post (0-23, Paris timezone)
  model: GPT_MODELS.STANDARD, // Model to use for generating eponym posts
};