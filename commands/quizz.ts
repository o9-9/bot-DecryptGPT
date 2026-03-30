// commands/quizz.ts
import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType,
} from 'discord.js';
import type { ExtendedClient } from '../types/ExtendedClient.js';
import { MODEL_CONFIG, DEFAULT_MODEL } from '../config.js';

interface QuizQuestion {
  question: string;
  choices: string[];
  answer: number;
  explanation: string;
}

interface QuizData {
  title: string;
  questions: QuizQuestion[];
}

const QUIZ_LENGTH = 5;
const CHOICES_COUNT = 4;
const CHOICE_LABELS = ['A', 'B', 'C', 'D'];
const CHOICE_STYLES = [ButtonStyle.Primary, ButtonStyle.Primary, ButtonStyle.Primary, ButtonStyle.Primary];
const ANSWER_TIMEOUT = 600_000; // 10 min silent timeout to prevent stale state

const DIFFICULTY_PROMPTS: Record<string, string> = {
  facile: `Niveau FACILE. Questions de base pour débutants en médecine (PACES/PASS/LAS).
- Définitions simples, termes courants, notions fondamentales
- Une seule bonne réponse évidente, les distracteurs sont clairement faux
- Pas de piège, pas de subtilité`,

  normal: `Niveau INTERMÉDIAIRE. Questions d'externat classiques.
- Nécessite une bonne compréhension des mécanismes physiopathologiques
- Les distracteurs sont plausibles mais distinguables avec de bonnes connaissances
- Couvre sémiologie, pharmacologie de base, diagnostics courants`,

  difficile: `Niveau DIFFICILE. Questions exigeantes de fin d'externat.
- Pièges subtils, diagnostics différentiels complexes, détails pharmacologiques précis
- Les distracteurs sont très proches de la bonne réponse
- Nécessite des connaissances approfondies et du raisonnement clinique
- Inclure des cas cliniques courts si pertinent`,

  edn: `Niveau TRÈS DIFFICILE — EDN (Épreuves Dématérialisées Nationales, le concours de classement des étudiants en médecine en France, anciennement ECN/iECN).
- Questions de niveau concours national, les plus difficiles possibles
- Cas cliniques complexes avec plusieurs étapes de raisonnement
- Les 4 choix doivent tous sembler plausibles — les distracteurs sont des erreurs classiques de raisonnement
- Items transversaux mêlant plusieurs spécialités
- Détails sémiologiques fins, posologies exactes, critères diagnostiques précis, recommandations HAS/collèges
- Le but est de piéger l'étudiant qui n'a pas des connaissances parfaites`,
};

/**
 * Generate quiz data from OpenAI
 */
async function generateQuiz(client: ExtendedClient, subject: string, difficulty: string): Promise<QuizData> {
  const modelConfig = MODEL_CONFIG[DEFAULT_MODEL];
  const difficultyPrompt = DIFFICULTY_PROMPTS[difficulty] ?? DIFFICULTY_PROMPTS.normal;

  const prompt = `Génère un quiz médical en français sur le sujet: "${subject}".

${difficultyPrompt}

Le quiz doit contenir exactement ${QUIZ_LENGTH} questions à choix multiples avec ${CHOICES_COUNT} choix chacune.

Réponds UNIQUEMENT avec du JSON valide, sans markdown, sans backticks, sans texte autour. Le format exact:
{
  "title": "Quiz: [sujet]",
  "questions": [
    {
      "question": "La question ici ?",
      "choices": ["Choix A", "Choix B", "Choix C", "Choix D"],
      "answer": 0,
      "explanation": "Explication courte (1-2 phrases) de la bonne réponse."
    }
  ]
}

Règles:
- "answer" est l'index (0-3) de la bonne réponse dans le tableau "choices"
- Les questions doivent être variées et couvrir différents aspects du sujet
- Les choix ne doivent PAS contenir de lettre préfixe (pas de "A)", "B)", etc.)
- Les explications doivent être concises et pédagogiques`;

  const response = await client.openai.responses.create({
    model: modelConfig.model,
    input: [
      {
        type: 'message' as const,
        role: 'user' as const,
        content: prompt,
      },
    ],
    max_output_tokens: 2048,
  });

  // Extract text from response
  let text = '';
  for (const item of response.output) {
    if (item.type === 'message' && item.content && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (content.type === 'output_text' && content.text) {
          text += content.text;
        }
      }
    }
  }

  // Clean up potential markdown wrapping
  text = text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const data: QuizData = JSON.parse(text);

  // Validate structure
  if (!data.questions || data.questions.length !== QUIZ_LENGTH) {
    throw new Error('Invalid quiz: wrong number of questions');
  }

  for (const q of data.questions) {
    if (!q.choices || q.choices.length !== CHOICES_COUNT) {
      throw new Error('Invalid quiz: wrong number of choices');
    }
    if (q.answer < 0 || q.answer >= CHOICES_COUNT) {
      throw new Error('Invalid quiz: answer index out of range');
    }

    // Shuffle choices to avoid LLM bias (answer almost always at index 0)
    const correctChoice = q.choices[q.answer];
    for (let i = q.choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q.choices[i], q.choices[j]] = [q.choices[j], q.choices[i]];
    }
    q.answer = q.choices.indexOf(correctChoice);
  }

  return data;
}

/**
 * Build an embed for a question
 */
function buildQuestionEmbed(quiz: QuizData, index: number, score: number): EmbedBuilder {
  const q = quiz.questions[index];

  const choicesText = q.choices
    .map((choice, i) => `**${CHOICE_LABELS[i]}.** ${choice}`)
    .join('\n');

  return new EmbedBuilder()
    .setTitle(`${quiz.title} — Question ${index + 1}/${QUIZ_LENGTH}`)
    .setDescription(`${q.question}\n\n${choicesText}`)
    .setFooter({ text: `Score: ${score}/${QUIZ_LENGTH}` })
    .setColor(0x5865F2);
}

/**
 * Build the answer buttons row
 */
function buildButtons(questionIndex: number, interactionId: string): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  for (let i = 0; i < CHOICES_COUNT; i++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`quizz_${interactionId}_${questionIndex}_${i}`)
        .setLabel(CHOICE_LABELS[i])
        .setStyle(CHOICE_STYLES[i])
    );
  }

  return row;
}

/**
 * Build disabled buttons showing the correct answer
 */
function buildResultButtons(questionIndex: number, interactionId: string, correctIndex: number, chosenIndex: number): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  for (let i = 0; i < CHOICES_COUNT; i++) {
    let style = ButtonStyle.Secondary; // default: grey
    if (i === correctIndex) style = ButtonStyle.Success; // green for correct
    if (i === chosenIndex && chosenIndex !== correctIndex) style = ButtonStyle.Danger; // red for wrong pick

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`quizz_${interactionId}_${questionIndex}_${i}`)
        .setLabel(CHOICE_LABELS[i])
        .setStyle(style)
        .setDisabled(true)
    );
  }

  return row;
}

/**
 * Main quiz command handler
 */
export async function execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
  const subject = interaction.options.getString('sujet', true);
  const difficulty = interaction.options.getString('difficulte', true);

  await interaction.deferReply();

  console.log(`[QUIZZ] Generating quiz on "${subject}" (${difficulty}) for ${interaction.user.username}`);

  let quiz: QuizData;
  try {
    quiz = await generateQuiz(client, subject, difficulty);
  } catch (error) {
    console.error('[QUIZZ] Generation failed:', error);
    await interaction.editReply('❌ Impossible de générer le quiz. Réessaie !');
    return;
  }

  console.log(`[QUIZZ] Quiz generated: "${quiz.title}"`);

  let score = 0;

  for (let i = 0; i < QUIZ_LENGTH; i++) {
    const q = quiz.questions[i];
    const embed = buildQuestionEmbed(quiz, i, score);
    const buttons = buildButtons(i, interaction.id);

    // Send question (edit first message, follow up for the rest)
    const message = i === 0
      ? await interaction.editReply({ embeds: [embed], components: [buttons] })
      : await interaction.followUp({ embeds: [embed], components: [buttons] });

    // Wait for button click
    try {
      const buttonInteraction = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (btn) => btn.user.id === interaction.user.id,
        time: ANSWER_TIMEOUT,
      });

      const chosenIndex = parseInt(buttonInteraction.customId.split('_').pop()!);
      const isCorrect = chosenIndex === q.answer;
      if (isCorrect) score++;

      // Build result embed
      const resultEmbed = new EmbedBuilder()
        .setTitle(`${quiz.title} — Question ${i + 1}/${QUIZ_LENGTH}`)
        .setDescription(
          `${q.question}\n\n` +
          q.choices.map((choice, ci) => `**${CHOICE_LABELS[ci]}.** ${choice}`).join('\n') +
          `\n\n${isCorrect ? '✅ **Bonne réponse !**' : `❌ **Mauvaise réponse !** La réponse était **${CHOICE_LABELS[q.answer]}. ${q.choices[q.answer]}**`}` +
          `\n\n💡 ${q.explanation}`
        )
        .setColor(isCorrect ? 0x57F287 : 0xED4245)
        .setFooter({ text: `Score: ${score}/${QUIZ_LENGTH}` });

      const resultButtons = buildResultButtons(i, interaction.id, q.answer, chosenIndex);

      await buttonInteraction.update({ embeds: [resultEmbed], components: [resultButtons] });

    } catch {
      // Timeout — quiz abandoned, disable buttons and stop
      const timeoutEmbed = new EmbedBuilder()
        .setTitle(`${quiz.title} — Question ${i + 1}/${QUIZ_LENGTH}`)
        .setDescription(
          `${q.question}\n\n` +
          q.choices.map((choice, ci) => `**${CHOICE_LABELS[ci]}.** ${choice}`).join('\n') +
          `\n\n⏰ **Quiz abandonné !**`
        )
        .setColor(0xFEE75C)
        .setFooter({ text: `Score final: ${score}/${QUIZ_LENGTH}` });

      const resultButtons = buildResultButtons(i, interaction.id, q.answer, -1);
      await message.edit({ embeds: [timeoutEmbed], components: [resultButtons] });
      return;
    }

    // Small delay between questions for readability
    if (i < QUIZ_LENGTH - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // Final score
  let emoji: string;
  if (score === QUIZ_LENGTH) emoji = '🏆';
  else if (score >= QUIZ_LENGTH * 0.8) emoji = '🎉';
  else if (score >= QUIZ_LENGTH * 0.6) emoji = '👍';
  else if (score >= QUIZ_LENGTH * 0.4) emoji = '😅';
  else emoji = '📚';

  const finalEmbed = new EmbedBuilder()
    .setTitle(`${emoji} Résultat — ${quiz.title}`)
    .setDescription(`Tu as obtenu **${score}/${QUIZ_LENGTH}** !`)
    .setColor(score >= QUIZ_LENGTH * 0.6 ? 0x57F287 : 0xED4245);

  await interaction.followUp({ embeds: [finalEmbed] });
  console.log(`[QUIZZ] ${interaction.user.username} scored ${score}/${QUIZ_LENGTH} on "${subject}"`);
}
