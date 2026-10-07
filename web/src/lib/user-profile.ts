import type { RecordModel } from "pocketbase";
import { pb } from "@/lib/pocketbase";

const GOOGLE_AVATAR_STORAGE_PREFIX = "pokus-google-avatar:";
const AVATAR_FIELDS = ["avatar", "avatarURL", "avatarUrl", "picture", "photo"];

function getStringField(record: RecordModel, field: string) {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function saveOAuthAvatar(
  recordId: string,
  meta: Record<string, unknown> | undefined,
) {
  const avatarURL = meta?.avatarURL ?? meta?.avatarUrl;

  if (typeof avatarURL === "string" && avatarURL.startsWith("https://")) {
    localStorage.setItem(`${GOOGLE_AVATAR_STORAGE_PREFIX}${recordId}`, avatarURL);
  }
}

export function getUserAvatarURL(record: RecordModel) {
  for (const field of AVATAR_FIELDS) {
    const value = getStringField(record, field);
    if (!value) continue;

    if (value.startsWith("https://") || value.startsWith("http://")) {
      return value;
    }

    return pb.files.getURL(record, value, { thumb: "100x100" });
  }

  return localStorage.getItem(`${GOOGLE_AVATAR_STORAGE_PREFIX}${record.id}`);
}

export function getUserDisplayName(record: RecordModel) {
  return (
    getStringField(record, "name") ??
    getStringField(record, "fullName") ??
    getStringField(record, "username") ??
    getStringField(record, "email") ??
    "Pokus user"
  );
}

export function getUserInitials(record: RecordModel) {
  const displayName = getUserDisplayName(record);
  const nameParts = displayName.includes("@")
    ? [displayName.split("@")[0]]
    : displayName.split(/\s+/);

  return nameParts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
