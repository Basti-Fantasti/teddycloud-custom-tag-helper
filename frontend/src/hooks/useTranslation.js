import { useContext } from 'react';
import { TranslationContext } from '../context/TranslationContext';

/**
 * Custom hook for accessing translation functionality
 *
 * Usage:
 *   const { t, language, setLanguage } = useTranslation();
 *
 *   // Simple translation
 *   <h1>{t('app.title')}</h1>
 *
 *   // With replacements
 *   <p>{t('tagSetup.linkSuccess', { uid: '12345', name: 'My Tonie' })}</p>
 *
 *   // Change language
 *   <button onClick={() => setLanguage('de')}>Deutsch</button>
 */
export function useTranslation() {
  const context = useContext(TranslationContext);

  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }

  return context;
}
