import { Button, message } from 'antd';
import { Copy } from 'lucide-react';
import { Children, isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SelectionAssistantMarkdownProps {
  outputText: string;
  copyEnabled: boolean;
}

type MarkdownChild = NonNullable<ExtraProps['node']>['children'][number];

const fieldPattern = /^(Original|Corrected|Suggestion|Casual|Similar|Simple|Explanation)\s*:/i;
const inlineTags = new Set(['strong', 'em', 'del', 'code', 'br']);

const isPlainInline = (child: MarkdownChild): boolean =>
  child.type === 'text' || (
    child.type === 'element' && inlineTags.has(child.tagName) && child.children.every(isPlainInline)
  );

const readField = (content: ReactNode[], startsWithBold: boolean) => {
  const [first, second] = content;
  const following = typeof second === 'string' ? second : '';

  if (startsWithBold && isValidElement<{ children: ReactNode }>(first) && typeof first.props.children === 'string') {
    const boldText = first.props.children;
    const match = fieldPattern.exec(boldText + following);
    if (match && match[0].length >= boldText.length) {
      const suffix = match[0].slice(boldText.length);
      return {
        name: match[1].toLowerCase(),
        label: <>{first}{suffix}</>,
        body: typeof second === 'string'
          ? [following.slice(suffix.length).trimStart(), ...content.slice(2)]
          : content.slice(1),
      };
    }
  }

  const match = typeof first === 'string' ? fieldPattern.exec(first) : null;
  if (match && typeof first === 'string') {
    return {
      name: match[1].toLowerCase(),
      label: match[0],
      body: [first.slice(match[0].length).trimStart(), ...content.slice(1)],
    };
  }

  return { name: '', label: null, body: content };
};

const splitAlternatives = (body: ReactNode[]) => {
  const alternatives: ReactNode[][] = [[]];
  let current = alternatives[0];

  for (const child of body) {
    const parts = typeof child === 'string' ? child.split(/[ \t]+\/[ \t]+/) : [child];
    current.push(parts[0]);
    for (const part of parts.slice(1)) {
      current = [part];
      alternatives.push(current);
    }
  }

  return alternatives;
};

export const SelectionAssistantMarkdown = ({ outputText, copyEnabled }: SelectionAssistantMarkdownProps) => {
  const [feedback, feedbackHolder] = message.useMessage();

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      void feedback.success({ key: 'assistant-copy', content: 'Copied to clipboard' });
    } catch {
      void feedback.error({ key: 'assistant-copy', content: 'Could not copy to clipboard' });
    }
  };

  const renderLine = (children: ReactNode, node: ExtraProps['node']) => {
    if (!copyEnabled || !node?.children.every(isPlainInline)) {
      return children;
    }

    const first = node.children[0];
    const { name, label, body } = readField(
      Children.toArray(children),
      first?.type === 'element' && first.tagName === 'strong',
    );
    const alternatives = name === 'suggestion' || name === 'similar' ? splitAlternatives(body) : [body];

    return (
      <>
        {label && <>{label}{' '}</>}
        {alternatives.map((alternative, index) => {
          const isCopyable = alternative.some((part) =>
            typeof part === 'string' ? Boolean(part.trim()) && !/^n\/a$/i.test(part.trim()) : isValidElement(part),
          );

          return (
            <span key={index}>
              {index > 0 && ' / '}
              {isCopyable ? (
                <Button
                  type="text"
                  title="Copy text"
                  className="h-auto! max-w-full px-1! py-0! align-baseline text-left! whitespace-normal!"
                  icon={<Copy size={14} className="opacity-50" aria-hidden="true" />}
                  iconPlacement="end"
                  onClick={(event) => void copyText(event.currentTarget.innerText.trim())}
                >
                  <span className="min-w-0 wrap-anywhere">{alternative}</span>
                </Button>
              ) : alternative}
            </span>
          );
        })}
      </>
    );
  };

  return (
    <>
      {feedbackHolder}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="mt-4 text-base font-semibold first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-4 text-base font-semibold first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-4 text-sm font-semibold first:mt-0">{children}</h4>,
          p: ({ children, node }) => <p className="mt-3 first:mt-0">{renderLine(children, node)}</p>,
          ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>,
          ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>,
          li: ({ children, node }) => <li>{renderLine(children, node)}</li>,
          code: ({ children }) => <code className="markdown-code">{children}</code>,
          pre: ({ children }) => <pre className="markdown-code-block">{children}</pre>,
          strong: ({ children }) => <strong className="markdown-strong">{children}</strong>,
        }}
      >
        {outputText}
      </ReactMarkdown>
    </>
  );
};
