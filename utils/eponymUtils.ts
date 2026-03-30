// utils/eponymUtils.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ExtendedClient } from '../types/ExtendedClient.js';
import { EPONYM_POSTS_CONFIG, MODEL_CONFIG } from '../config.js';

const HISTORY_FILE = join(process.cwd(), 'data', 'eponym-history.json');
const MAX_GENERATION_ATTEMPTS = 5;

export interface EponymHistory {
  eponyms: string[];
}

export interface EponymResult {
  name: string;
  content: string;
}

/**
 * Normalize eponym name for comparison (uppercase, trimmed)
 */
export function normalizeEponymName(name: string): string {
  return name.toUpperCase().trim();
}

/**
 * Load the history of already posted eponyms
 */
export function loadEponymHistory(): EponymHistory {
  try {
    if (existsSync(HISTORY_FILE)) {
      const data = readFileSync(HISTORY_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading eponym history:', error);
  }
  return { eponyms: [] };
}

/**
 * Check if an eponym name already exists in history (case-insensitive)
 */
export function isEponymDuplicate(eponymName: string, history?: EponymHistory): boolean {
  const historyData = history ?? loadEponymHistory();
  const normalizedName = normalizeEponymName(eponymName);

  return historyData.eponyms.some(
    (existing) => normalizeEponymName(existing) === normalizedName
  );
}

/**
 * Save an eponym name to the history (normalized to uppercase)
 */
export function saveEponymToHistory(eponymName: string): void {
  try {
    const history = loadEponymHistory();
    const normalizedName = normalizeEponymName(eponymName);

    // Double-check to prevent duplicates
    if (isEponymDuplicate(normalizedName, history)) {
      console.warn(`⚠️ Attempted to save duplicate eponym: ${eponymName}`);
      return;
    }

    history.eponyms.push(normalizedName);

    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    console.log(`📝 Saved to eponym history: ${normalizedName}`);
  } catch (error) {
    console.error('Error saving to eponym history:', error);
  }
}

/**
 * Get deduplicated history list for the AI prompt
 */
export function getDeduplicatedEponymList(): string[] {
  const history = loadEponymHistory();
  const seen = new Set<string>();
  const deduplicated: string[] = [];

  for (const eponym of history.eponyms) {
    const normalized = normalizeEponymName(eponym);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduplicated.push(normalized);
    }
  }

  return deduplicated;
}

/**
 * Extract eponym name from API response
 * Handles various formats the AI might return
 */
function extractEponymName(firstLine: string): string {
  let name = firstLine.trim();

  // Remove markdown formatting if present
  name = name.replace(/\*\*/g, '');

  // If it contains "—" or "-", take the first part
  if (name.includes('—')) {
    name = name.split('—')[0].trim();
  } else if (name.includes(' - ')) {
    name = name.split(' - ')[0].trim();
  }

  return name;
}

/**
 * Generate eponym post content using OpenAI with retry logic
 */
export async function generateEponymPost(client: ExtendedClient): Promise<EponymResult | null> {
  const history = loadEponymHistory();

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    try {
      // Use deduplicated, normalized list for the prompt
      const postedEponyms = getDeduplicatedEponymList().join(', ');

      const modelConfig = MODEL_CONFIG[EPONYM_POSTS_CONFIG.model];

      const prompt = `Tu es un assistant médical expert. Génère une fiche courte et concise sur un éponyme médical (score, signe, syndrome, classification, loi, manœuvre, etc. portant un nom propre) en français.

${postedEponyms ? `IMPORTANT: Ne parle PAS de ces éponymes déjà traités: ${postedEponyms}

Choisis un éponyme DIFFÉRENT de ceux listés ci-dessus. Varie les spécialités médicales (cardiologie, neurologie, rhumatologie, chirurgie, pédiatrie, gynécologie, urgences, etc.) et les types d'éponymes (scores, signes cliniques, syndromes, classifications, manœuvres, lois physiologiques, etc.).` : ''}

Format EXACT à respecter:
**[Nom de l'éponyme]** — [type : score / signe / syndrome / classification / manœuvre / loi / etc.]
[Spécialité médicale]
Définition : **[explication courte en 1-2 phrases]**
Exemple clinique : **[situation clinique concrète où on l'utilise]**

Exemple:
**Score de Glasgow** — score
Neurologie / Urgences
Définition : **Évalue le niveau de conscience d'un patient sur 15 points** (ouverture des yeux, réponse verbale, réponse motrice)
Exemple clinique : **Traumatisme crânien aux urgences** pour décider de la prise en charge

Retourne UNIQUEMENT le nom de l'éponyme sur la première ligne (sans formatage), puis le contenu formaté sur les lignes suivantes.
Format de réponse:
NOM_EPONYME
[contenu formaté]`;

      const response = await client.openai.responses.create({
        model: modelConfig.model,
        input: [
          {
            type: 'message',
            role: 'user',
            content: prompt,
          },
        ],
        max_output_tokens: 512,
      });

      // Extract response
      let fullResponse = '';

      for (const item of response.output) {
        if (item.type === 'message' && item.content && Array.isArray(item.content)) {
          for (const content of item.content) {
            if (content.type === 'output_text' && content.text) {
              fullResponse += content.text;
            }
          }
        }
      }

      if (!fullResponse) {
        throw new Error('No valid response from API');
      }

      const lines = fullResponse.trim().split('\n');
      const rawName = lines[0].trim();
      const eponymName = extractEponymName(rawName);
      const content = lines.slice(1).join('\n').trim();

      // Check for duplicate BEFORE returning
      if (isEponymDuplicate(eponymName, history)) {
        console.warn(`⚠️ Attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}: AI returned duplicate eponym "${eponymName}", retrying...`);
        continue;
      }

      console.log(`✅ Generated unique eponym: ${eponymName} (attempt ${attempt})`);
      return { name: eponymName, content };

    } catch (error) {
      console.error(`Error generating eponym post (attempt ${attempt}):`, error);
      if (attempt === MAX_GENERATION_ATTEMPTS) {
        return null;
      }
    }
  }

  console.error(`❌ Failed to generate unique eponym after ${MAX_GENERATION_ATTEMPTS} attempts`);
  return null;
}
