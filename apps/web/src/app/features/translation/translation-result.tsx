import { Button, message } from 'antd';
import { Copy, Volume2 } from 'lucide-react';
import type { TranslationEntry, TranslationLanguage } from './translation-api';

const languages = {
  en: { label: 'English', locale: 'en-US' },
  zh: { label: 'Chinese', locale: 'zh-CN' },
};

interface TranslationResultProps {
  entry: TranslationEntry;
}

export const TranslationResult = ({ entry: { query, result } }: TranslationResultProps) => {
  const [feedback, feedbackHolder] = message.useMessage();
  const source = languages[result.sourceLanguage];
  const targetLanguage = result.sourceLanguage === 'en' ? 'zh' : 'en';
  const target = languages[targetLanguage];

  const speak = (text: string, language: TranslationLanguage) => {
    const synthesis = window.speechSynthesis;
    if (!synthesis) {
      void feedback.error('Speech playback is unavailable.');
      return;
    }
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = languages[language].locale;
    speech.onerror = (event) => {
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        void feedback.error(`Could not play audio. Check that a ${languages[language].label} voice is installed.`);
      }
    };
    synthesis.cancel();
    synthesis.speak(speech);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      void feedback.success('Copied to clipboard');
    } catch {
      void feedback.error('Could not copy to clipboard');
    }
  };

  return (
    <div aria-live="polite" className="flex flex-col gap-5">
      {feedbackHolder}
      <h3 className="text-2xl font-semibold wrap-anywhere" lang={source.locale}>{query}</h3>
      {result.kind === 'word' ? (
        <>
          <div className="flex items-center gap-1">
            <Button type="text" icon={<Volume2 size={18} />} aria-label="Play word pronunciation"
              onClick={() => speak(query, result.sourceLanguage)} />
            <span className="text-lg">{result.pronunciation}</span>
          </div>
          <p className="border-b border-(--app-border) pb-2 text-(--app-text-secondary)">
            {source.label} → {target.label}
          </p>
          {result.meanings.map(({ partOfSpeech, senses }, index) => (
            <div key={index}>
              <h4 className="font-semibold">{partOfSpeech}</h4>
              <ol className="mt-1 list-decimal space-y-1 pl-5 wrap-anywhere" lang={target.locale}>
                {senses.map((sense, senseIndex) => <li key={senseIndex}>{sense}</li>)}
              </ol>
            </div>
          ))}
        </>
      ) : (
        ([
          ['Casual', result.casual],
          ['Standard', result.standard],
        ] as const).map(([label, text]) => (
          <section key={label} className="border-t border-(--app-border) pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="rounded-md bg-(--app-color-primary-bg) px-2.5 py-1 font-semibold text-(--app-color-primary-text)">
                {label} translation
              </h4>
              <div className="flex items-center">
                <Button type="text" icon={<Copy size={16} />} aria-label={`Copy ${label.toLowerCase()} translation`}
                  onClick={() => void copy(text)}>Copy</Button>
                <Button type="text" icon={<Volume2 size={18} />} aria-label={`Play ${label.toLowerCase()} translation`}
                  onClick={() => speak(text, targetLanguage)} />
              </div>
            </div>
            <p className="mt-2 text-lg wrap-anywhere" lang={target.locale}>{text}</p>
          </section>
        ))
      )}
    </div>
  );
};
