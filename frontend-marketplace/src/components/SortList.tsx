"use client";
import React, { useState, useRef, useEffect } from "react";

export interface SortOption {
  value: string;
  label: string;
  icon?: string;
}

interface SortListProps {
  options: SortOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const SortList: React.FC<SortListProps> = ({
  options,
  value,
  onChange,
  placeholder = "Sort by...",
  className = "",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((option) => option.value === value);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < options.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : options.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < options.length) {
            onChange(options[highlightedIndex].value);
            setIsOpen(false);
          }
          break;
        case "Escape":
          setIsOpen(false);
          buttonRef.current?.focus();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, highlightedIndex, options, onChange]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset highlighted index when opening
  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex(
        (option) => option.value === value
      );
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, options, value]);

  const handleOptionClick = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const handleButtonClick = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Custom dropdown button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleButtonClick}
        disabled={disabled}
        data-sort-selected="true"
        className={`
          w-full flex items-center justify-between px-4 py-2
          transition-all duration-200 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-offset-2
          ${
            disabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:shadow-md cursor-pointer"
          }
        `}
        style={{
          background: "var(--sort-bg)",
          border: "1px solid var(--sidebar-border)",
          color: "var(--foreground)",
          boxShadow: isOpen ? "var(--card-shadow)" : "none",
          borderRadius: "var(--sort-border-radius)", // Use CSS variable for elliptical shape
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby="sort-label"
      >
        <div className="flex items-center gap-3">
          {selectedOption?.icon && (
            <span className="text-lg" role="img" aria-hidden="true">
              {selectedOption.icon}
            </span>
          )}
          <span className="font-medium text-sm truncate">
            {selectedOption?.label || placeholder}
          </span>
        </div>
        <svg
          className={`w-5 h-5 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          style={{ color: "var(--sort-arrow-color)" }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg overflow-hidden shadow-lg animate-fade-in"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--sidebar-border)",
            boxShadow: "var(--card-shadow)",
          }}
          role="listbox"
          aria-label="Sort options"
        >
          <div className="py-1 max-h-60 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleOptionClick(option.value)}
                className={`
                  w-full flex items-center gap-3 px-4 py-2 text-left
                  transition-colors duration-150 ease-in-out
                  hover:opacity-80
                  ${option.value === value ? "font-semibold" : "font-normal"}
                `}
                style={{
                  color: "var(--foreground)",
                  backgroundColor: "transparent",
                  borderRadius: "var(--sort-border-radius)", // Use CSS variable for elliptical shape
                }}
                role="option"
                aria-selected={option.value === value}
              >
                {option.icon && (
                  <span className="text-lg" role="img" aria-hidden="true">
                    {option.icon}
                  </span>
                )}
                <span className="text-sm">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SortList;
