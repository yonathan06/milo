import { ui, languages, defaultLang, showDefaultLang, type Locale, type TranslationKey, type Translations } from './ui.ts';

export function getLangFromUrl(url: URL): Locale {
  const lang = url.pathname.split('/')[1];
  return Object.hasOwn(languages, lang) ? lang as Locale : defaultLang;
}

export function useTranslations(lang: Locale, content?: Translations) {
  const localizedUI: Partial<Translations> = content ?? ui[lang];
  return function t<K extends TranslationKey>(key: K): Translations[K] {
    return localizedUI[key] ?? ui[defaultLang][key];
  };
}

// Remove only a supported leading locale; preserve query strings and fragments.
export function getLocaleNeutralPath(url: URL): string {
  const parts = url.pathname.split('/');
  if (Object.hasOwn(languages, parts[1])) parts.splice(1, 1);
  return (parts.join('/') || '/') + url.search + url.hash;
}

// Pass a locale-neutral internal path, as in the Astro recipe.
export function useTranslatedPath(lang: Locale) {
  return function translatePath(path: string, targetLang: Locale = lang) {
    const pathname = path.startsWith('/') ? path : `/${path}`;
    return !showDefaultLang && targetLang === defaultLang
      ? pathname
      : `/${targetLang}${pathname}`;
  };
}
