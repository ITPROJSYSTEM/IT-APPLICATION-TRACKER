"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, ClipboardCheck, FolderKanban, LayoutDashboard, LogIn, Moon, Sun, Wrench } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/task-calendar-activities", label: "Task Calendar Activities", icon: CalendarDays },
  { href: "/project-modification", label: "Project Modification", icon: Wrench },
  { href: "/test-cases", label: "Test Case Management", icon: ClipboardCheck },
  { href: "/projects", label: "Project Maintenance", icon: FolderKanban },
  { href: "/login", label: "Log in", icon: LogIn }
];
const themeStorageKey = "it-application-tracker-theme";
const currentUserStorageKey = "it-application-tracker-current-user";
const themes = [
  { id: "maroon-dark", label: "Maroon Dark", icon: Moon },
  { id: "maroon-light", label: "Maroon Light", icon: Sun }
] as const;

type ThemeId = (typeof themes)[number]["id"];

function isThemeId(value: string | null): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

function formatUserName(value: string | null) {
  if (!value) {
    return "Jessica Maica Libre";
  }

  const name = value.includes("@") ? value.split("@")[0] : value;
  const cleanedName = name.replace(/[._-]+/g, " ").trim();

  if (!cleanedName) {
    return "Jessica Maica Libre";
  }

  return cleanedName.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemeId>("maroon-dark");
  const [currentUser, setCurrentUser] = useState("Jessica Maica Libre");

  useEffect(() => {
    const savedTheme = localStorage.getItem(themeStorageKey);
    const nextTheme = isThemeId(savedTheme) ? savedTheme : "maroon-dark";

    setTheme(nextTheme);
    setCurrentUser(formatUserName(localStorage.getItem(currentUserStorageKey)));
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function changeTheme(nextTheme: ThemeId) {
    setTheme(nextTheme);
    localStorage.setItem(themeStorageKey, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Application navigation">
        <Link href="/dashboard" className="brand sidebar-profile">
          <span className="brand-mark profile-mark">
            {getInitials(currentUser)}
          </span>
          <span>
            <strong>{currentUser}</strong>
            <small>Project Coordinator</small>
          </span>
        </Link>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                href={item.href}
                className={`nav-link${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                key={item.href}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-theme" aria-label="Theme selector">
          <span>Theme</span>
          <div className="theme-options">
            {themes.map((item) => {
              const Icon = item.icon;
              const isSelected = theme === item.id;

              return (
                <button
                  aria-pressed={isSelected}
                  className={`theme-option${isSelected ? " active" : ""}`}
                  key={item.id}
                  onClick={() => changeTheme(item.id)}
                  type="button"
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
