import React, { useState, useRef, useEffect } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const themeOptions: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { mode: "light", label: "Light", icon: <Sun size={14} className="text-amber-500" /> },
    { mode: "dark", label: "Dark", icon: <Moon size={14} className="text-blue-400" /> },
    { mode: "system", label: "System", icon: <Monitor size={14} className="text-gray-400" /> },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)} (${resolvedTheme})`}
        className="flex items-center justify-center rounded p-1.5 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
        aria-label="Toggle theme"
      >
        {theme === "light" && <Sun size={16} className="text-amber-500" />}
        {theme === "dark" && <Moon size={16} className="text-blue-400" />}
        {theme === "system" && <Monitor size={16} className="text-gray-500 dark:text-zinc-400" />}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-32 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-100">
          {themeOptions.map((opt) => (
            <button
              key={opt.mode}
              type="button"
              onClick={() => {
                setTheme(opt.mode);
                setIsOpen(false);
              }}
              className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {opt.icon}
                <span>{opt.label}</span>
              </div>
              {theme === opt.mode && (
                <Check size={13} className="text-blue-600 dark:text-blue-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
