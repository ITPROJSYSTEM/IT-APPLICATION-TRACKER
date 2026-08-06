"use client";

import { FormEvent, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { FormattedText } from "@/components/formatted-text";
import { exportRowsToExcel } from "@/lib/export-excel";
import { sortRecordsById } from "@/lib/record-sort";
import { useSyncedRecords } from "@/lib/shared-records";
import { Edit3, FileSpreadsheet, NotebookText, Plus, Save, Trash2, X } from "lucide-react";

type NoteRecord = {
  id: string;
  details: string;
  createdAt: string;
};

const noteStorageKey = "it-application-tracker-notes";
const initialNotes: NoteRecord[] = [];
const emptyNote: NoteRecord = {
  id: "",
  details: "",
  createdAt: ""
};

function isNoteRecord(value: unknown): value is NoteRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const note = value as Partial<NoteRecord>;

  return (
    typeof note.id === "string" &&
    typeof note.details === "string" &&
    typeof note.createdAt === "string"
  );
}

function generateNoteId(records: NoteRecord[]) {
  const highestNumber = records.reduce((highest, note) => {
    const match = /^NTE-(\d+)$/.exec(note.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  return `NTE-${String(highestNumber + 1).padStart(3, "0")}`;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function NotesPage() {
  const { records, setRecords } = useSyncedRecords(noteStorageKey, initialNotes, isNoteRecord);
  const [formData, setFormData] = useState<NoteRecord>(emptyNote);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");

  const filteredNotes = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matchingNotes = records.filter((note) => {
      const searchableValue = [note.details, formatCreatedAt(note.createdAt)]
        .join(" ")
        .toLowerCase();

      return !normalizedSearch || searchableValue.includes(normalizedSearch);
    });

    return sortRecordsById(matchingNotes);
  }, [records, searchTerm]);

  function updateField<Field extends keyof NoteRecord>(field: Field, value: NoteRecord[Field]) {
    setFormData((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  function resetForm() {
    setFormData(emptyNote);
    setEditingId(null);
    setMessage("");
  }

  function openNewNoteForm() {
    resetForm();
    setIsFormVisible(true);
  }

  function closeForm() {
    resetForm();
    setIsFormVisible(false);
  }

  function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextNote: NoteRecord = {
      id: editingId ? formData.id : generateNoteId(records),
      details: formData.details.trim(),
      createdAt: editingId ? formData.createdAt : new Date().toISOString()
    };

    if (!nextNote.details) {
      setMessage("Complete the note details before saving.");
      return;
    }

    if (editingId) {
      setRecords((current) => current.map((note) => (note.id === editingId ? nextNote : note)));
      setMessage("Note updated.");
    } else {
      setRecords((current) => sortRecordsById([...current, nextNote]));
      setMessage("Note added.");
    }

    setFormData(emptyNote);
    setEditingId(null);
    setIsFormVisible(false);
    setSearchTerm("");
  }

  function editNote(note: NoteRecord) {
    setFormData(note);
    setEditingId(note.id);
    setIsFormVisible(true);
    setMessage("");
  }

  function deleteNote(noteId: string) {
    setRecords((current) => current.filter((note) => note.id !== noteId));

    if (editingId === noteId) {
      closeForm();
    } else {
      setMessage("Note removed.");
    }
  }

  function exportNotesToExcel() {
    exportRowsToExcel({
      filename: "notes.xlsx",
      sheetName: "Notes",
      headers: ["Details", "Created"],
      rows: filteredNotes.map((note) => [
        note.details,
        formatCreatedAt(note.createdAt)
      ])
    });
  }

  return (
    <AppShell>
      <section className="page-header">
        <div>
          <p className="eyebrow">Knowledge log</p>
          <h1>Notes</h1>
        </div>
        <button className="primary-action" type="button" onClick={openNewNoteForm}>
          <Plus size={17} />
          Add Note
        </button>
      </section>

      {isFormVisible ? (
        <section className="panel maintenance-panel" aria-label="Notes form">
          <div className="panel-heading">
            <h2>
              <NotebookText size={17} />
              {editingId ? "Edit Note" : "Add Note"}
            </h2>
            <button className="ghost-action" type="button" onClick={closeForm} aria-label="Close notes form">
              <X size={17} />
            </button>
          </div>
          <form className="maintenance-form notes-form" onSubmit={saveNote}>
            <label className="notes-detail-field">
              Details
              <textarea
                value={formData.details}
                onChange={(event) => updateField("details", event.target.value)}
                placeholder="Note details"
                rows={10}
              />
            </label>
            <div className="form-actions">
              <button className="primary-action" type="submit">
                <Save size={17} />
                {editingId ? "Save Changes" : "Save Note"}
              </button>
              <button className="secondary-action" type="button" onClick={resetForm}>
                Clear
              </button>
            </div>
            {message ? <p className="inline-message">{message}</p> : null}
          </form>
        </section>
      ) : null}

      <section className="toolbar notes-toolbar" aria-label="Notes filters">
        <input
          placeholder="Search details or created date"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <button
          className="secondary-action"
          type="button"
          onClick={exportNotesToExcel}
          disabled={filteredNotes.length === 0}
        >
          <FileSpreadsheet size={17} />
          Export Excel
        </button>
      </section>
      {!isFormVisible && message ? <p className="inline-message toolbar-message">{message}</p> : null}

      <section className="panel notes-panel">
        <div className="panel-heading">
          <h2>
            <NotebookText size={17} />
            Notes
          </h2>
          <span>{filteredNotes.length} records</span>
        </div>
        <div className="table-wrap">
          <table className="notes-table">
            <thead>
              <tr>
                <th>Details</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredNotes.map((note) => (
                <tr key={note.id}>
                  <td><FormattedText value={note.details} /></td>
                  <td className="date-cell">{formatCreatedAt(note.createdAt)}</td>
                  <td>
                    <span className="row-actions">
                      <button
                        className="icon-action"
                        type="button"
                        onClick={() => editNote(note)}
                        aria-label="Edit note"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        className="icon-action danger-action"
                        type="button"
                        onClick={() => deleteNote(note.id)}
                        aria-label="Delete note"
                      >
                        <Trash2 size={16} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty-state">No notes match the current search.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
