import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Globe, ChevronDown, Check } from "lucide-react";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = i18n.language?.startsWith("vi") ? "vi" : "en";

  const languages = [
    { code: "en", label: "English", flag: "🇺🇸" },
    { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  ];

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleSelectLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={t("language.select", { defaultValue: "Select language" })}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200/90 dark:border-zinc-700/80 bg-gray-50/80 dark:bg-zinc-800/80 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-zinc-100 cursor-pointer transition-colors"
      >
        <Globe size={14} className="text-gray-500 dark:text-zinc-400" />
        <span className="uppercase font-mono text-[11px] font-semibold">
          {currentLang}
        </span>
        <ChevronDown size={12} className="text-gray-400 transition-transform" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-100">
          {languages.map((lang) => {
            const isSelected = currentLang === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleSelectLanguage(lang.code)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-50 dark:bg-zinc-800 text-blue-600 dark:text-blue-400 font-semibold"
                    : "text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </div>
                {isSelected && <Check size={14} className="text-blue-600 dark:text-blue-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
