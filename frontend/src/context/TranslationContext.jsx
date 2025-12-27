import { createContext, useState, useEffect } from 'react';

// Import translation files
import en from '../locales/en.json';
import de from '../locales/de.json';

// Available translations
const translations = {
  en,
  de
};

// Supported languages
const SUPPORTED_LANGUAGES = ['en', 'de'];

/**
 * Detect browser language and map to supported language
 * @returns {string} Language code ('en' or 'de')
 */
function detectBrowserLanguage() {
  // Get browser language (e.g., 'de-DE', 'en-US', 'de')
  const browserLang = navigator.language || navigator.userLanguage || 'en';

  // Extract primary language code (e.g., 'de-DE' -> 'de')
  const primaryLang = browserLang.split('-')[0].toLowerCase();

  // Return if supported, otherwise default to 'en'
  return SUPPORTED_LANGUAGES.includes(primaryLang) ? primaryLang : 'en';
}

// Create context
export const TranslationContext = createContext();

export function TranslationProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    // Load from localStorage, or detect browser language as fallback
    const stored = localStorage.getItem('uiLanguage');
    if (stored) {
      return stored;
    }
    return detectBrowserLanguage();
  });

  useEffect(() => {
    // Save to localStorage when language changes
    localStorage.setItem('uiLanguage', language);
  }, [language]);

  const t = (key, replacements = {}) => {
    // Split key by dots to traverse nested object (e.g., "app.title")
    const keys = key.split('.');
    let value = translations[language];

    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        // Key not found, return the key itself
        console.warn(`Translation key not found: ${key}`);
        return key;
      }
    }

    // Handle replacements (e.g., "Hello {name}" with { name: "John" })
    if (typeof value === 'string' && Object.keys(replacements).length > 0) {
      return value.replace(/\{(\w+)\}/g, (match, placeholder) => {
        return replacements[placeholder] !== undefined ? replacements[placeholder] : match;
      });
    }

    return value || key;
  };

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </TranslationContext.Provider>
  );
}
