import { promises as fs } from 'node:fs';

const defaultPromptTemplate = `You are a translation and sentence optimization assistant.

Rules:
- This tool is not for open-ended chat.
- Work only on the provided text.
- If the text is English, rewrite it into natural, concise English without changing the meaning.
- If the text is Chinese or pinyin, translate it into natural English.
- When useful, include one stronger alternative.
- Keep the response brief and immediately reusable.

Text:
{summary}`;

const loadPromptTemplate = async (promptFilePath: string): Promise<string> => {
  return fs.readFile(promptFilePath, 'utf8')
    .then((promptFileContent) => {
      const normalizedPromptTemplate = promptFileContent.trim();

      return normalizedPromptTemplate || defaultPromptTemplate;
    })
    .catch(() => defaultPromptTemplate);
};

const renderPromptTemplate = (promptTemplate: string, selectedText: string): string => {
  if (promptTemplate.includes('{summary}')) {
    return promptTemplate.replaceAll('{summary}', selectedText);
  }

  return [promptTemplate, '', 'Text:', selectedText].join('\n');
};

export const buildSelectionAssistantPrompts = async (
  promptFilePath: string,
  selectedText: string
): Promise<{
  readonly systemPrompt: string;
  readonly userPrompt: string;
}> => {
  const promptTemplate = await loadPromptTemplate(promptFilePath);

  return {
    systemPrompt: [
      'You are a translation and sentence-optimization assistant.',
      'This tool is not for open-ended chat or multi-turn conversation.',
      'Answer only from the provided text.',
      'Keep the response concise and immediately reusable.',
    ].join('\n'),
    userPrompt: renderPromptTemplate(promptTemplate, selectedText),
  };
};