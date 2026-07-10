import fs from 'fs-extra';

const loadPromptTemplate = (promptFilePath: string): string => {
  return fs.readFileSync(promptFilePath, 'utf8');
};

const renderPromptTemplate = (promptTemplate: string, selectedText: string): string => {
  if (promptTemplate.includes('{summary}')) {
    return promptTemplate.replaceAll('{summary}', selectedText);
  }

  return [promptTemplate, '', 'Text:', selectedText].join('\n');
};

export const buildSelectionAssistantPrompts = (
  promptFilePath: string,
  selectedText: string
): {
  readonly systemPrompt: string;
  readonly userPrompt: string;
} => {
  const promptTemplate = loadPromptTemplate(promptFilePath);

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