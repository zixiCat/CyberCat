// Keep the original query intact; these boundaries only guide interpretation.
export const splitTranslationIdentifier = (query: string): string | undefined => {
  if (!/^[a-z][a-z0-9_.-]*$/i.test(query)) {
    return undefined;
  }
  const words = query
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([a-z])([0-9])/gi, '$1 $2')
    .replace(/([0-9])([a-z])/gi, '$1 $2')
    .replace(/[_.]+/g, ' ')
    .trim();
  return words !== query && words.includes(' ') ? words : undefined;
};
