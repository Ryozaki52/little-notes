
import { useEffect, useState } from 'react'
import {
    translations,
    type Language,
    type TranslationKey,
} from './translations'

const LANGUAGE_KEY = 'little-notes-language'

function getInitialLanguage(): Language {
    try {
        const saved = localStorage.getItem(LANGUAGE_KEY)

        if (saved === 'zh' || saved === 'en') {
            return saved
        }
    } catch {
        // Fall back to English if storage is unavailable.
    }

    return 'en'
}

export function useLanguage() {
    const [language, setLanguage] =
        useState<Language>(getInitialLanguage)

    useEffect(() => {
        try {
            localStorage.setItem(LANGUAGE_KEY, language)
        } catch {
            // Language still works without localStorage.
        }

        document.documentElement.lang =
            language === 'zh' ? 'zh-CN' : 'en'
    }, [language])

    function t(key: TranslationKey): string {
        return translations[language][key]
    }

    return {
        language,
        setLanguage,
        t,
    }
}
