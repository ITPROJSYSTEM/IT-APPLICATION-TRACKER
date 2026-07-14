"use client";

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const sharedDataTable = "app_data";

type AppDataRow = {
  data_key: string;
  data: unknown;
  updated_at?: string;
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

function readLocalRecords<TRecord>(
  storageKey: string,
  validator: (value: unknown) => value is TRecord,
  fallback: TRecord[]
) {
  const savedRecords = localStorage.getItem(storageKey);

  if (!savedRecords) {
    return fallback;
  }

  try {
    const parsedRecords: unknown = JSON.parse(savedRecords);
    return parseRecords(parsedRecords, validator, fallback);
  } catch {
    localStorage.removeItem(storageKey);
    return fallback;
  }
}

async function saveSharedRecords<TRecord>(storageKey: string, records: TRecord[]) {
  localStorage.setItem(storageKey, JSON.stringify(records));

  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from(sharedDataTable)
    .upsert({
      data_key: storageKey,
      data: records,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.warn(`Unable to sync ${storageKey} to Supabase.`, error.message);
  }
}

async function loadSharedRecords<TRecord>(
  storageKey: string,
  validator: (value: unknown) => value is TRecord,
  fallback: TRecord[]
) {
  const localRecords = readLocalRecords(storageKey, validator, fallback);

  if (!supabase) {
    return localRecords;
  }

  const { data, error } = await supabase
    .from(sharedDataTable)
    .select("data")
    .eq("data_key", storageKey)
    .maybeSingle<AppDataRow>();

  if (error) {
    console.warn(`Unable to load ${storageKey} from Supabase.`, error.message);
    return localRecords;
  }

  if (!data) {
    await saveSharedRecords(storageKey, localRecords);
    return localRecords;
  }

  const sharedRecords = parseRecords(data.data, validator, localRecords);
  localStorage.setItem(storageKey, JSON.stringify(sharedRecords));
  return sharedRecords;
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

  useEffect(() => {
    let isActive = true;

    async function loadRecords() {
      const nextRecords = await loadSharedRecords(storageKey, validator, fallback);

      if (!isActive) {
        return;
      }

      skipNextRemoteSave.current = true;
      setRecords(nextRecords);
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
            localStorage.setItem(storageKey, JSON.stringify([]));
            return;
          }

          const nextRecords = parseRecords(nextRow.data, validator, fallback);
          skipNextRemoteSave.current = true;
          setRecords(nextRecords);
          localStorage.setItem(storageKey, JSON.stringify(nextRecords));
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
      localStorage.setItem(storageKey, JSON.stringify(records));
      return;
    }

    void saveSharedRecords(storageKey, records);
  }, [isReady, records, storageKey]);

  return { records, setRecords, isReady };
}
