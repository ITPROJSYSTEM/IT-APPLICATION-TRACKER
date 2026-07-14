"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { FormattedText } from "@/components/formatted-text";
import { CalendarDays, ChevronLeft, ChevronRight, Edit3, Plus, Save, Trash2, X } from "lucide-react";

type CalendarMode = "week" | "month";

type TaskActivity = {
  id: string;
  date: string;
  details: string;
};

const activityStorageKey = "it-application-tracker-task-calendar-activities";
const dayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDisplayDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}

function getMonthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getStartOfWeek(date: Date) {
  const nextDate = new Date(date);
  const day = nextDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  nextDate.setDate(nextDate.getDate() + mondayOffset);
  nextDate.setHours(0, 0, 0, 0);

  return nextDate;
}

function getMonthGridDates(date: Date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const gridStart = getStartOfWeek(firstDay);

  return Array.from({ length: 42 }, (_, index) => {
    const nextDate = new Date(gridStart);
    nextDate.setDate(gridStart.getDate() + index);
    return nextDate;
  });
}

function getWeekDates(date: Date) {
  const weekStart = getStartOfWeek(date);

  return Array.from({ length: 7 }, (_, index) => {
    const nextDate = new Date(weekStart);
    nextDate.setDate(weekStart.getDate() + index);
    return nextDate;
  });
}

function parseSavedActivities(value: string | null): TaskActivity[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((activity): activity is TaskActivity => {
      return (
        activity &&
        typeof activity === "object" &&
        "id" in activity &&
        "date" in activity &&
        "details" in activity &&
        typeof activity.id === "string" &&
        typeof activity.date === "string" &&
        typeof activity.details === "string"
      );
    });
  } catch {
    return [];
  }
}

export default function TaskCalendarActivitiesPage() {
  const today = useMemo(() => new Date(), []);
  const [mode, setMode] = useState<CalendarMode>("month");
  const [viewDate, setViewDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [taskDetails, setTaskDetails] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [isStorageReady, setIsStorageReady] = useState(false);

  const selectedDateKey = getDateKey(selectedDate);
  const visibleDates = mode === "month" ? getMonthGridDates(viewDate) : getWeekDates(viewDate);
  const selectedActivities = activities.filter((activity) => activity.date === selectedDateKey);
  const activitiesByDate = activities.reduce<Record<string, TaskActivity[]>>((groups, activity) => {
    groups[activity.date] = [...(groups[activity.date] ?? []), activity];
    return groups;
  }, {});

  useEffect(() => {
    setActivities(parseSavedActivities(localStorage.getItem(activityStorageKey)));
    setIsStorageReady(true);
  }, []);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    localStorage.setItem(activityStorageKey, JSON.stringify(activities));
  }, [activities, isStorageReady]);

  function changeCalendar(step: number) {
    setViewDate((current) => {
      const nextDate = new Date(current);

      if (mode === "month") {
        nextDate.setMonth(current.getMonth() + step);
      } else {
        nextDate.setDate(current.getDate() + step * 7);
      }

      return nextDate;
    });
  }

  function goToToday() {
    const currentDate = new Date();
    setViewDate(currentDate);
    setSelectedDate(currentDate);
  }

  function selectDate(date: Date) {
    setSelectedDate(date);
    setViewDate(date);
    setEditingTaskId(null);
    setTaskDetails("");
  }

  function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!taskDetails.trim()) {
      return;
    }

    if (editingTaskId) {
      setActivities((current) =>
        current.map((activity) =>
          activity.id === editingTaskId
            ? {
                ...activity,
                date: selectedDateKey,
                details: taskDetails
              }
            : activity
        )
      );
      setEditingTaskId(null);
      setTaskDetails("");
      return;
    }

    setActivities((current) => [
      ...current,
      {
        id: `${selectedDateKey}-${Date.now()}`,
        date: selectedDateKey,
        details: taskDetails
      }
    ]);
    setTaskDetails("");
  }

  function editTask(activity: TaskActivity) {
    const taskDate = new Date(`${activity.date}T00:00:00`);
    setSelectedDate(taskDate);
    setViewDate(taskDate);
    setEditingTaskId(activity.id);
    setTaskDetails(activity.details);
  }

  function cancelEditTask() {
    setEditingTaskId(null);
    setTaskDetails("");
  }

  function deleteTask(activityId: string) {
    setActivities((current) => current.filter((activity) => activity.id !== activityId));
    if (editingTaskId === activityId) {
      cancelEditTask();
    }
  }

  return (
    <AppShell>
      <section className="page-header">
        <div>
          <p className="eyebrow">Planning control</p>
          <h1>Task Calendar Activities</h1>
        </div>
      </section>

      <section className="calendar-layout">
        <div className="panel calendar-panel">
          <div className="calendar-toolbar">
            <div className="segmented-control" aria-label="Calendar view">
              <button className={mode === "week" ? "active" : ""} onClick={() => setMode("week")} type="button">
                Week
              </button>
              <button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")} type="button">
                Month
              </button>
            </div>
            <button className="calendar-nav-button" onClick={() => changeCalendar(-1)} type="button" aria-label="Previous calendar period">
              <ChevronLeft size={17} />
            </button>
            <strong>{mode === "month" ? getMonthLabel(viewDate) : `${getDisplayDate(visibleDates[0])} - ${getDisplayDate(visibleDates[6])}`}</strong>
            <div className="calendar-toolbar-actions">
              <button className="calendar-nav-button" onClick={() => changeCalendar(1)} type="button" aria-label="Next calendar period">
                <ChevronRight size={17} />
              </button>
              <button className="secondary-action calendar-today-button" onClick={goToToday} type="button">
                Today
              </button>
            </div>
          </div>

          <div className="calendar-grid" data-mode={mode}>
            {dayLabels.map((day) => (
              <div className="calendar-day-heading" key={day}>
                {day}
              </div>
            ))}
            {visibleDates.map((date) => {
              const dateKey = getDateKey(date);
              const isSelected = dateKey === selectedDateKey;
              const isToday = dateKey === getDateKey(today);
              const isOutsideMonth = mode === "month" && date.getMonth() !== viewDate.getMonth();
              const dateActivities = activitiesByDate[dateKey] ?? [];
              const visibleActivities = dateActivities.slice(0, 3);
              const hiddenActivityCount = Math.max(dateActivities.length - visibleActivities.length, 0);

              return (
                <button
                  className={`calendar-day${isSelected ? " selected" : ""}${isToday ? " today" : ""}${isOutsideMonth ? " outside-month" : ""}`}
                  key={dateKey}
                  onClick={() => selectDate(date)}
                  type="button"
                >
                  <span className="calendar-day-number">{date.getDate()}</span>
                  {dateActivities.length > 0 ? (
                    <span className="calendar-activity-list">
                      {visibleActivities.map((activity) => (
                        <span className="calendar-activity-item" key={activity.id}>
                          <CalendarDays size={12} />
                          <span>
                            <FormattedText value={activity.details} />
                          </span>
                        </span>
                      ))}
                      {hiddenActivityCount > 0 ? <span className="calendar-activity-more">+{hiddenActivityCount} more</span> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="panel selected-date-panel">
          <div className="selected-date-header">
            <span>Selected Date</span>
            <strong>{getDisplayDate(selectedDate)}</strong>
          </div>
          <form className="task-form" onSubmit={saveTask}>
            <textarea
              value={taskDetails}
              onChange={(event) => setTaskDetails(event.target.value)}
              placeholder="Details..."
              rows={7}
            />
            <div className="task-form-actions">
              {editingTaskId ? (
                <button className="secondary-action" type="button" onClick={cancelEditTask}>
                  <X size={17} />
                  Cancel
                </button>
              ) : null}
              <button className="primary-action" type="submit">
                {editingTaskId ? <Save size={17} /> : <Plus size={17} />}
                {editingTaskId ? "Save task" : "Add task"}
              </button>
            </div>
          </form>
          <div className="selected-activities">
            <h2>{selectedActivities.length} Activities</h2>
            {selectedActivities.length > 0 ? (
              <div className="task-list">
                {selectedActivities.map((activity) => (
                  <article className="task-card" key={activity.id}>
                    <p>
                      <FormattedText value={activity.details} />
                    </p>
                    <div className="task-card-actions">
                      <button className="icon-action" type="button" onClick={() => editTask(activity)} aria-label="Edit task">
                        <Edit3 size={15} />
                      </button>
                      <button className="icon-action danger-action" type="button" onClick={() => deleteTask(activity.id)} aria-label="Delete task">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">No activities yet.</div>
            )}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
