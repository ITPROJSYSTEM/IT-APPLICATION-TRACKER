type RecordWithId = {
  id: string;
};

const idSegmentPattern = /^([A-Za-z]+)-?(\d+)$/;

function getRecordIdParts(recordId: string) {
  const trimmedId = recordId.trim();
  const match = idSegmentPattern.exec(trimmedId);

  if (!match) {
    return {
      prefix: trimmedId.toUpperCase(),
      number: Number.POSITIVE_INFINITY,
      raw: trimmedId
    };
  }

  return {
    prefix: match[1].toUpperCase(),
    number: Number(match[2]),
    raw: trimmedId
  };
}

export function compareRecordIds(firstId: string, secondId: string) {
  const first = getRecordIdParts(firstId);
  const second = getRecordIdParts(secondId);
  const prefixComparison = first.prefix.localeCompare(second.prefix, undefined, { numeric: true, sensitivity: "base" });

  if (prefixComparison !== 0) {
    return prefixComparison;
  }

  if (first.number !== second.number) {
    return first.number - second.number;
  }

  return first.raw.localeCompare(second.raw, undefined, { numeric: true, sensitivity: "base" });
}

export function sortRecordsById<TRecord extends RecordWithId>(records: TRecord[]) {
  return [...records].sort((first, second) => compareRecordIds(first.id, second.id));
}
