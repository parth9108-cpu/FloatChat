// src/contexts/LanguageContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import translations from '../translations';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState('en');
  
  // Load saved language from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('oceanfront_language');
    if (saved && translations[saved]) {
      setCurrentLanguage(saved);
    }
  }, []);

  const changeLanguage = (langCode) => {
    if (translations[langCode]) {
      setCurrentLanguage(langCode);
      localStorage.setItem('oceanfront_language', langCode);
    }
  };

  const t = (key) => {
    return translations[currentLanguage][key] || translations.en[key] || key;
  };

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'hi', name: '[translate:हिंदी]', flag: '🇮🇳' },
    { code: 'mr', name: '[translate:मराठी]', flag: '🇮🇳' },
    { code: 'ta', name: '[translate:தமிழ்]', flag: '🇮🇳' }
  ];

  return (
    <LanguageContext.Provider value={{
      currentLanguage,
      changeLanguage,
      t,
      languages
    }}>
      {children}
    </LanguageContext.Provider>
  );
};
