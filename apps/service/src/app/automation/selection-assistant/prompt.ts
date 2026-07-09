import { promises as fs } from 'node:fs';

const defaultReferencePrompt = `You are an English language assistant.

If the selected text is English:
- correct grammar, syntax, and spelling
- make the sentence sound natural and conversational
- provide short chat-ready alternatives
- provide a simpler version and a brief explanation

If the selected text is Chinese or pinyin:
- translate it into natural English
- provide a more idiomatic option when helpful

Keep the response concise and easy to scan.
Use Markdown headings and short bullet lists when useful.`;

const loadReferencePrompt = async (promptFilePath: string, selectedText: string): Promise<string> => {
  try {
    const promptFileContent = await fs.readFile(promptFilePath, 'utf8');
    const normalizedPrompt = promptFileContent.trim();

    if (!normalizedPrompt) {
      return defaultReferencePrompt;
    }

    return normalizedPrompt.replaceAll('{summary}', selectedText);
  } catch {
    return defaultReferencePrompt;
  }
};

export const buildSelectionAssistantPrompts = async (
  promptFilePath: string,
  selectedText: string
): Promise<{
  readonly systemPrompt: string;
  readonly userPrompt: string;
}> => {
  const referencePrompt = await loadReferencePrompt(promptFilePath, selectedText);

  return {
    systemPrompt: [
      'You help the user optimize selected words and sentences for immediate reuse.',
      'Respond in concise Markdown.',
      'When the text is English, fix it and make it sound natural.',
      'When the text is Chinese or pinyin, translate it into natural English.',
      'Use the reference prompt as extra guidance, but keep the final answer focused on the selected text.',
    ].join('\n'),
    userPrompt: [
      'Selected text:',
      selectedText,
      '',
      'Reference prompt:',
      referencePrompt,
    ].join('\n'),
  };
};