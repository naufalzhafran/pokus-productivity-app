import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { pb } from "@/lib/pocketbase";
import {
  getUserAvatarURL,
  getUserDisplayName,
  getUserInitials,
} from "@/lib/user-profile";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  className?: string;
  size?: "default" | "sm" | "lg";
}

export function UserAvatar({ className, size = "lg" }: UserAvatarProps) {
  const record = pb.authStore.record;
  if (!record) return null;

  const displayName = getUserDisplayName(record);
  const avatarURL = getUserAvatarURL(record);

  return (
    <Avatar size={size} className={cn(className)} title={displayName}>
      {avatarURL ? (
        <AvatarImage
          src={avatarURL}
          alt={`${displayName}'s profile picture`}
          referrerPolicy="no-referrer"
        />
      ) : null}
      <AvatarFallback aria-label={`${displayName}'s profile picture`}>
        {getUserInitials(record)}
      </AvatarFallback>
    </Avatar>
  );
}
