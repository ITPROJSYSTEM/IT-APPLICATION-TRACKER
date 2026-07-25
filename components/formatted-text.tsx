"use client";

import { MouseEvent, useId, useState } from "react";

type FormattedTextProps = {
  value: string;
  expandable?: boolean;
  collapseAt?: number;
};

function getShouldCollapse(value: string, collapseAt: number) {
  const lineCount = value.split(/\r\n|\r|\n/).length;

  return value.trim().length > collapseAt || lineCount > 3;
}

export function FormattedText({ value, expandable = true, collapseAt = 180 }: FormattedTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const shouldCollapse = expandable && getShouldCollapse(value, collapseAt);

  function toggleExpanded(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setIsExpanded((current) => !current);
  }

  return (
    <span className="formatted-text-block">
      <span
        className={`formatted-text${shouldCollapse && !isExpanded ? " formatted-text-collapsed" : ""}`}
        id={contentId}
      >
        {value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
          }

          return <span key={`${part}-${index}`}>{part}</span>;
        })}
      </span>
      {shouldCollapse ? (
        <button
          aria-controls={contentId}
          aria-expanded={isExpanded}
          className="formatted-text-toggle"
          onClick={toggleExpanded}
          type="button"
        >
          {isExpanded ? "View less" : "View more"}
        </button>
      ) : null}
    </span>
  );
}
