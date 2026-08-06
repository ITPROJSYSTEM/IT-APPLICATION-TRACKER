"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentUserStorageKey, demoUserProfile, getInitials, readCurrentUserProfile } from "@/lib/user-profile";
import {
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FolderKanban,
  Laptop,
  LayoutDashboard,
  LogOut,
  Moon,
  NotebookText,
  Rocket,
  Sun,
  Wrench
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/task-calendar-activities", label: "Task Calendar Activities", icon: CalendarDays },
  { href: "/project-modification", label: "Project Modification", icon: Wrench },
  { href: "/test-cases", label: "Test Case Management", icon: ClipboardCheck },
  { href: "/projects", label: "Project Maintenance", icon: FolderKanban },
  { href: "/deployment-tracker", label: "Deployment Tracker", icon: Rocket },
  { href: "/notes", label: "Notes", icon: NotebookText }
];
const themeStorageKey = "it-application-tracker-theme";
const themes = [
  { id: "maroon-dark", label: "Warm Taupe", icon: Moon },
  { id: "maroon-light", label: "Ivory Minimal", icon: Sun }
] as const;

type ThemeId = (typeof themes)[number]["id"];

function isThemeId(value: string | null): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeId>("maroon-dark");
  const [currentUser, setCurrentUser] = useState(demoUserProfile);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem(themeStorageKey);
    const nextTheme = isThemeId(savedTheme) ? savedTheme : "maroon-dark";

    setTheme(nextTheme);
    setCurrentUser(readCurrentUserProfile());
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function changeTheme(nextTheme: ThemeId) {
    setTheme(nextTheme);
    localStorage.setItem(themeStorageKey, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  async function logOut() {
    localStorage.removeItem(currentUserStorageKey);
    await supabase?.auth.signOut();
    setCurrentUser(demoUserProfile);
    setIsProfileMenuOpen(false);
    router.push("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Application navigation">
        <div className="sidebar-brand-panel" aria-label="Application brand">
          <span className="sidebar-brand-mark" aria-hidden="true">
            <Laptop size={34} />
          </span>
          <span className="sidebar-brand-copy">
            <strong>IT Application</strong>
            <small>Tracker</small>
            <em>Plan. Track. Deliver.</em>
          </span>
        </div>
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
        <div className="sidebar-visual" aria-label="IT Application Tracker">
          <div className="sidebar-visual-media" aria-hidden="true" />
          <strong>Technology drives innovation</strong>
          <small>Building solutions for a better tomorrow.</small>
        </div>
        <div className={`profile-menu${isProfileMenuOpen ? " open" : ""}`}>
          <div className="profile-menu-slot">
            {isProfileMenuOpen ? (
              <div className="profile-dropdown" role="menu">
                <div className="profile-dropdown-group" aria-label="Theme selector">
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
                <div className="profile-dropdown-actions">
                  <button className="account-action" type="button" role="menuitem" onClick={logOut}>
                    <LogOut size={17} />
                    <span>Log out</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <button
            className={`brand sidebar-profile profile-menu-trigger${isProfileMenuOpen ? " active" : ""}`}
            type="button"
            aria-expanded={isProfileMenuOpen}
            aria-haspopup="menu"
            onClick={() => setIsProfileMenuOpen((current) => !current)}
          >
            <span className="brand-mark profile-mark">
              {currentUser.avatarUrl ? (
                <span
                  aria-hidden="true"
                  className="profile-photo"
                  style={{ backgroundImage: `url("${currentUser.avatarUrl}")` }}
                />
              ) : (
                getInitials(currentUser.fullName)
              )}
            </span>
            <span className="profile-copy">
              <strong>{currentUser.fullName}</strong>
              <small>{currentUser.position}</small>
            </span>
            <ChevronDown className="profile-chevron" size={17} />
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
