// utils/medicineUtils.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ExtendedClient } from '../types/ExtendedClient.js';
import { MEDICINE_POSTS_CONFIG, MODEL_CONFIG } from '../config.js';

const HISTORY_FILE = join(process.cwd(), 'data', 'medicine-history.json');
const MAX_GENERATION_ATTEMPTS = 5;

export interface MedicineHistory {
  medicines: string[];
}

export interface MedicineResult {
  name: string;
  content: string;
}

/**
 * Normalize medicine name for comparison (uppercase, trimmed)
 */
export function normalizeMedicineName(name: string): string {
  return name.toUpperCase().trim();
}

/**
 * Load the history of already posted medicines
 */
export function loadHistory(): MedicineHistory {
  try {
    if (existsSync(HISTORY_FILE)) {
      const data = readFileSync(HISTORY_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading medicine history:', error);
  }
  return { medicines: [] };
}

/**
 * Check if a medicine name already exists in history (case-insensitive)
 */
export function isDuplicate(medicineName: string, history?: MedicineHistory): boolean {
  const historyData = history ?? loadHistory();
  const normalizedName = normalizeMedicineName(medicineName);

  return historyData.medicines.some(
    (existing) => normalizeMedicineName(existing) === normalizedName
  );
}

/**
 * Save a medicine name to the history (normalized to uppercase)
 */
export function saveToHistory(medicineName: string): void {
  try {
    const history = loadHistory();
    const normalizedName = normalizeMedicineName(medicineName);

    // Double-check to prevent duplicates
    if (isDuplicate(normalizedName, history)) {
      console.warn(`⚠️ Attempted to save duplicate medicine: ${medicineName}`);
      return;
    }

    history.medicines.push(normalizedName);

    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    console.log(`📝 Saved to history: ${normalizedName}`);
  } catch (error) {
    console.error('Error saving to medicine history:', error);
  }
}

/**
 * Get deduplicated history list for the AI prompt
 */
export function getDeduplicatedHistoryList(): string[] {
  const history = loadHistory();
  const seen = new Set<string>();
  const deduplicated: string[] = [];

  for (const medicine of history.medicines) {
    const normalized = normalizeMedicineName(medicine);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduplicated.push(normalized);
    }
  }

  return deduplicated;
}

/**
 * Extract medicine name from API response
 * Handles various formats the AI might return
 */
function extractMedicineName(firstLine: string): string {
  let name = firstLine.trim();

  // Remove markdown formatting if present
  name = name.replace(/\*\*/g, '');

  // If it contains "—" or "-", take the first part (the principle active)
  if (name.includes('—')) {
    name = name.split('—')[0].trim();
  } else if (name.includes(' - ')) {
    name = name.split(' - ')[0].trim();
  }

  // Remove any "nom commercial" suffix if AI included it
  name = name.replace(/\s*nom commercial.*$/i, '').trim();

  return name;
}

/**
 * Generate medicine post content using OpenAI with retry logic
 */
export async function generateMedicinePost(client: ExtendedClient): Promise<MedicineResult | null> {
  const history = loadHistory();

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    try {
      // Use deduplicated, normalized list for the prompt
      const postedMedicines = getDeduplicatedHistoryList().join(', ');

      const modelConfig = MODEL_CONFIG[MEDICINE_POSTS_CONFIG.model];

      const prompt = `Tu es un assistant médical expert. Génère une fiche courte et concise sur un médicament en français.

${postedMedicines ? `IMPORTANT: Ne parle PAS de ces médicaments déjà traités: ${postedMedicines}

Choisis un médicament DIFFÉRENT de ceux listés ci-dessus. Varie les classes thérapeutiques et les lettres de l'alphabet.` : ''}

Format EXACT à respecter:
**[Nom du principe actif]** — nom commercial **[Nom commercial]**
[Classe thérapeutique]
Indications : **[indication 1]** et **[indication 2]**

Exemple:
**Aripiprazole** — nom commercial **Abilify**
Antipsychotique de **deuxième génération**
Indications : **épisodes maniaques** et **schizophrénie**

Retourne UNIQUEMENT le nom du principe actif sur la première ligne (sans formatage), puis le contenu formaté sur les lignes suivantes.
Format de réponse:
NOM_PRINCIPE_ACTIF
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
      const medicineName = extractMedicineName(rawName);
      const content = lines.slice(1).join('\n').trim();

      // Check for duplicate BEFORE returning
      if (isDuplicate(medicineName, history)) {
        console.warn(`⚠️ Attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}: AI returned duplicate "${medicineName}", retrying...`);
        continue;
      }

      console.log(`✅ Generated unique medicine: ${medicineName} (attempt ${attempt})`);
      return { name: medicineName, content };

    } catch (error) {
      console.error(`Error generating medicine post (attempt ${attempt}):`, error);
      if (attempt === MAX_GENERATION_ATTEMPTS) {
        return null;
      }
    }
  }

  console.error(`❌ Failed to generate unique medicine after ${MAX_GENERATION_ATTEMPTS} attempts`);
  return null;
}
