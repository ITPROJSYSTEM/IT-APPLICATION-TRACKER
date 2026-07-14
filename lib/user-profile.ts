export type CurrentUserProfile = {
  email: string;
  fullName: string;
  position: string;
  avatarUrl: string;
};

export const currentUserStorageKey = "it-application-tracker-current-user";

export const demoUserProfile: CurrentUserProfile = {
  email: "admin@tracker.local",
  fullName: "Jessica Maica Libre",
  position: "Project Coordinator",
  avatarUrl: ""
};

function getMetadataString(metadata: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function formatUserName(value: string | null | undefined) {
  if (!value) {
    return demoUserProfile.fullName;
  }

  const name = value.includes("@") ? value.split("@")[0] : value;
  const cleanedName = name.replace(/[._-]+/g, " ").trim();

  if (!cleanedName) {
    return demoUserProfile.fullName;
  }

  return cleanedName.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildUserProfile(email: string | null | undefined, metadata?: Record<string, unknown>): CurrentUserProfile {
  const userEmail = email?.trim() || demoUserProfile.email;
  const fullName = getMetadataString(metadata, ["full_name", "fullName", "name", "display_name"]) || formatUserName(userEmail);
  const position = getMetadataString(metadata, ["position", "job_title", "jobTitle", "title", "role"]) || demoUserProfile.position;
  const avatarUrl = getMetadataString(metadata, ["avatar_url", "avatarUrl", "picture", "photo_url", "photoUrl", "image"]);

  return {
    email: userEmail,
    fullName,
    position,
    avatarUrl
  };
}

export function saveCurrentUserProfile(profile: CurrentUserProfile) {
  localStorage.setItem(currentUserStorageKey, JSON.stringify(profile));
}

export function readCurrentUserProfile() {
  const saved = localStorage.getItem(currentUserStorageKey);

  if (!saved) {
    return demoUserProfile;
  }

  try {
    const parsed: unknown = JSON.parse(saved);

    if (parsed && typeof parsed === "object") {
      const profile = parsed as Partial<CurrentUserProfile>;

      return buildUserProfile(profile.email, {
        full_name: profile.fullName,
        position: profile.position,
        avatar_url: profile.avatarUrl
      });
    }
  } catch {
    return buildUserProfile(saved);
  }

  return buildUserProfile(saved);
}

export function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
