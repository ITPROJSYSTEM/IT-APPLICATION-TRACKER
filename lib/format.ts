export function formatDateForDisplay(value: string) {
  if (/^pending$/i.test(value.trim())) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}
