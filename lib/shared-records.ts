"use client";

import { Dispatch, SetStateAction, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const sharedDataTable = "app_data";
const backupStorageKeyPart = ":backup:";
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type AppDataRow = {
  data_key: string;
  data: unknown;
  updated_at?: string;
};

type LocalRecordSnapshot<TRecord> = {
  exists: boolean;
  isLegacy: boolean;
  records: TRecord[];
  updatedAt: string | null;
};

type StoredRecordsEnvelope = {
  records?: unknown;
  updatedAt?: unknown;
};

type LoadedRecords<TRecord> = {
  records: TRecord[];
  shouldSkipSave: boolean;
};

function parseRecords<TRecord>(
  value: unknown,
  validator: (value: unknown) => value is TRecord,
  fallback: TRecord[]
) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const records = value.filter(validator);
  return records.length > 0 || value.length === 0 ? records : fallback;
}

function recordsMatch<TRecord>(firstRecords: TRecord[], secondRecords: TRecord[]) {
  return JSON.stringify(firstRecords) === JSON.stringify(secondRecords);
}

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function parseLocalSnapshot<TRecord>(
  parsedRecords: unknown,
  validator: (value: unknown) => value is TRecord,
  fallback: TRecord[]
): LocalRecordSnapshot<TRecord> {
  if (Array.isArray(parsedRecords)) {
    return {
      exists: true,
      isLegacy: true,
      records: parseRecords(parsedRecords, validator, fallback),
      updatedAt: null
    };
  }

  if (parsedRecords && typeof parsedRecords === "object") {
    const envelope = parsedRecords as StoredRecordsEnvelope;

    if (Array.isArray(envelope.records)) {
      return {
        exists: true,
        isLegacy: false,
        records: parseRecords(envelope.records, validator, fallback),
        updatedAt: typeof envelope.updatedAt === "string" ? envelope.updatedAt : null
      };
    }
  }

  return {
    exists: false,
    isLegacy: false,
    records: fallback,
    updatedAt: null
  };
}

function readLocalSnapshot<TRecord>(
  storageKey: string,
  validator: (value: unknown) => value is TRecord,
  fallback: TRecord[]
): LocalRecordSnapshot<TRecord> {
  const storage = getBrowserStorage();

  if (!storage) {
    return {
      exists: false,
      isLegacy: false,
      records: fallback,
      updatedAt: null
    };
  }

  const savedRecords = storage.getItem(storageKey);

  if (!savedRecords) {
    return {
      exists: false,
      isLegacy: false,
      records: fallback,
      updatedAt: null
    };
  }

  try {
    const parsedRecords: unknown = JSON.parse(savedRecords);
    return parseLocalSnapshot(parsedRecords, validator, fallback);
  } catch {
    storage.removeItem(storageKey);
    return {
      exists: false,
      isLegacy: false,
      records: fallback,
      updatedAt: null
    };
  }
}

function writeLocalSnapshot<TRecord>(storageKey: string, records: TRecord[], updatedAt: string) {
  const storage = getBrowserStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.setItem(storageKey, JSON.stringify({ records, updatedAt }));
    return true;
  } catch (error) {
    console.warn(`Unable to save ${storageKey} in browser storage.`, error);
    return false;
  }
}

function getBackupStorageKey(storageKey: string, updatedAt: string | null) {
  const backupDate = updatedAt ?? new Date().toISOString();

  return `${storageKey}${backupStorageKeyPart}${backupDate}`;
}

async function backupRemoteRecordsBeforeEmptySave(storageKey: string) {
  if (!supabase) {
    return;
  }

  const { data, error } = await supabase
    .from(sharedDataTable)
    .select("data, updated_at")
    .eq("data_key", storageKey)
    .maybeSingle<AppDataRow>();

  if (error || !data || !Array.isArray(data.data) || data.data.length === 0) {
    return;
  }

  const backupUpdatedAt = data.updated_at ?? new Date().toISOString();
  const { error: backupError } = await supabase.from(sharedDataTable).upsert({
    data_key: getBackupStorageKey(storageKey, backupUpdatedAt),
    data: data.data,
    updated_at: backupUpdatedAt
  });

  if (backupError) {
    console.warn(`Unable to back up ${storageKey} before empty save.`, backupError.message);
  }
}

async function saveSharedRecords<TRecord>(storageKey: string, records: TRecord[], updatedAt = new Date().toISOString()) {
  writeLocalSnapshot(storageKey, records, updatedAt);

  if (!supabase) {
    return;
  }

  if (records.length === 0) {
    await backupRemoteRecordsBeforeEmptySave(storageKey);
  }

  const { error } = await supabase
    .from(sharedDataTable)
    .upsert({
      data_key: storageKey,
      data: records,
      updated_at: updatedAt
    });

  if (error) {
    console.warn(`Unable to sync ${storageKey} to Supabase.`, error.message);
  }
}

async function loadSharedRecords<TRecord>(
  storageKey: string,
  validator: (value: unknown) => value is TRecord,
  fallback: TRecord[]
): Promise<LoadedRecords<TRecord>> {
  const localSnapshot = readLocalSnapshot(storageKey, validator, fallback);

  if (!supabase) {
    return { records: localSnapshot.records, shouldSkipSave: true };
  }

  const { data, error } = await supabase
    .from(sharedDataTable)
    .select("data, updated_at")
    .eq("data_key", storageKey)
    .maybeSingle<AppDataRow>();

  if (error) {
    console.warn(`Unable to load ${storageKey} from Supabase.`, error.message);
    return { records: localSnapshot.records, shouldSkipSave: true };
  }

  if (!data) {
    if (localSnapshot.exists) {
      await saveSharedRecords(storageKey, localSnapshot.records, localSnapshot.updatedAt ?? undefined);
      return { records: localSnapshot.records, shouldSkipSave: true };
    }

    return { records: fallback, shouldSkipSave: true };
  }

  const sharedRecords = parseRecords(data.data, validator, localSnapshot.records);
  const remoteUpdatedAt = data.updated_at ?? null;
  const localHasDifferentRecords = localSnapshot.exists && !recordsMatch(localSnapshot.records, sharedRecords);
  const localIsEmpty = localSnapshot.records.length === 0;
  const remoteHasRecords = sharedRecords.length > 0;
  const localIsNewer =
    localSnapshot.updatedAt && remoteUpdatedAt
      ? new Date(localSnapshot.updatedAt).getTime() > new Date(remoteUpdatedAt).getTime()
      : false;
  const shouldProtectRemoteRecords = localIsEmpty && remoteHasRecords;
  const localLooksUserEdited =
    localSnapshot.isLegacy &&
    localHasDifferentRecords &&
    !localIsEmpty &&
    !recordsMatch(localSnapshot.records, fallback);

  if (localHasDifferentRecords && !shouldProtectRemoteRecords && (localIsNewer || localLooksUserEdited)) {
    await saveSharedRecords(storageKey, localSnapshot.records, localSnapshot.updatedAt ?? undefined);
    return { records: localSnapshot.records, shouldSkipSave: true };
  }

  writeLocalSnapshot(storageKey, sharedRecords, remoteUpdatedAt ?? new Date().toISOString());
  return { records: sharedRecords, shouldSkipSave: true };
}

type SyncedRecordsResult<TRecord> = {
  records: TRecord[];
  setRecords: Dispatch<SetStateAction<TRecord[]>>;
  isReady: boolean;
};

export function useSyncedRecords<TRecord>(
  storageKey: string,
  fallback: TRecord[],
  validator: (value: unknown) => value is TRecord
): SyncedRecordsResult<TRecord> {
  const [records, setRecords] = useState<TRecord[]>(fallback);
  const [isReady, setIsReady] = useState(false);
  const skipNextRemoteSave = useRef(false);

  const updateSyncedRecords = useCallback<Dispatch<SetStateAction<TRecord[]>>>(
    (nextRecordsOrUpdater) => {
      setRecords((currentRecords) => {
        const nextRecords =
          typeof nextRecordsOrUpdater === "function"
            ? (nextRecordsOrUpdater as (currentRecords: TRecord[]) => TRecord[])(currentRecords)
            : nextRecordsOrUpdater;

        skipNextRemoteSave.current = false;
        writeLocalSnapshot(storageKey, nextRecords, new Date().toISOString());
        return nextRecords;
      });
    },
    [storageKey]
  );

  useBrowserLayoutEffect(() => {
    const localSnapshot = readLocalSnapshot(storageKey, validator, fallback);

    skipNextRemoteSave.current = true;
    setRecords((currentRecords) =>
      recordsMatch(currentRecords, localSnapshot.records) ? currentRecords : localSnapshot.records
    );
    setIsReady(true);
  }, [fallback, storageKey, validator]);

  useEffect(() => {
    let isActive = true;

    async function loadRecords() {
      const nextRecords = await loadSharedRecords(storageKey, validator, fallback);

      if (!isActive) {
        return;
      }

      skipNextRemoteSave.current = nextRecords.shouldSkipSave;
      setRecords(nextRecords.records);
      setIsReady(true);
    }

    void loadRecords();

    const supabaseClient = supabase;

    if (!supabaseClient) {
      return () => {
        isActive = false;
      };
    }

    const channel = supabaseClient
      .channel(`shared-records:${storageKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: sharedDataTable,
          filter: `data_key=eq.${storageKey}`
        },
        (payload) => {
          const nextRow = payload.new as AppDataRow | null;

          if (!nextRow) {
            skipNextRemoteSave.current = true;
            setRecords([]);
            writeLocalSnapshot(storageKey, [], new Date().toISOString());
            return;
          }

          const nextRecords = parseRecords(nextRow.data, validator, fallback);
          skipNextRemoteSave.current = true;
          setRecords(nextRecords);
          writeLocalSnapshot(storageKey, nextRecords, nextRow.updated_at ?? new Date().toISOString());
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      void supabaseClient.removeChannel(channel);
    };
  }, [fallback, storageKey, validator]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (skipNextRemoteSave.current) {
      skipNextRemoteSave.current = false;
      return;
    }

    void saveSharedRecords(storageKey, records);
  }, [isReady, records, storageKey]);

  return { records, setRecords: updateSyncedRecords, isReady };
}
