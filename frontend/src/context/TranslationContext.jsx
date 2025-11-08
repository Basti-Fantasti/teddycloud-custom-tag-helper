import { createContext, useState, useEffect } from 'react';

// Import translation files
import en from '../locales/en.json';
import de from '../locales/de.json';

// Available translations
const translations = {
  en,
  de
};

// Create context
export const TranslationContext = createContext();

export function TranslationProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    // Load from localStorage or default to 'en'
    return localStorage.getItem('uiLanguage') || 'en';
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
