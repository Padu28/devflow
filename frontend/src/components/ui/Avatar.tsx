import { cn, getInitials } from '@/lib/utils';
import type { UserBrief } from '@/lib/types';

export function Avatar({
  user,
  size = 'md',
  className,
}: {
  user: Pick<UserBrief, 'display_name' | 'avatar_color'>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    xs: 'h-5 w-5 text-[9px]',
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-8 w-8 text-xs',
    lg: 'h-10 w-10 text-sm',
  }[size];

  return (
    <span
      title={user.display_name}
      aria-label={user.display_name}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-[#0A0A0B] ring-1 ring-black/15',
        sizes,
        className,
      )}
      style={{ backgroundColor: user.avatar_color || '#C6F432' }}
    >
      {getInitials(user.display_name)}
    </span>
  );
}

export function AvatarStack({
  users,
  max = 4,
  size = 'sm',
}: {
  users: Pick<UserBrief, 'id' | 'display_name' | 'avatar_color'>[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
}) {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((u) => (
        <Avatar
          key={u.id}
          user={u}
          size={size}
          className="ring-2 ring-[var(--surface)]"
        />
      ))}
      {overflow > 0 && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--muted-bg)] text-[10px] font-medium text-[var(--text-muted)] ring-2 ring-[var(--surface)]">
          +{overflow}
        </span>
      )}
    </div>
  );
}

