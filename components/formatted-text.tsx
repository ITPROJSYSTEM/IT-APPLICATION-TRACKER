type FormattedTextProps = {
  value: string;
};

export function FormattedText({ value }: FormattedTextProps) {
  return (
    <span className="formatted-text">
      {value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
        }

        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </span>
  );
}
