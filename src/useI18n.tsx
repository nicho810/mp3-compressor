import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Language, translations, languages } from './i18n'

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
  languages: typeof languages
}

const I18nContext = createContext<I18nContextType | null>(null)

const STORAGE_KEY = 'mp3-compress-language'

function getInitialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && translations[stored as Language]) {
    return stored as Language
  }
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage)

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem(STORAGE_KEY, lang)
  }, [])

  const t = useCallback((key: string): string => {
    return translations[language][key] || key
  }, [language])

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, languages }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}
