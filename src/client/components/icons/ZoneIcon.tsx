interface ZoneIconProps {
  size?: number;
  className?: string;
}

export function ZoneIcon({ size = 24, className }: ZoneIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <rect x="3" y="3" width="8" height="8" fill="currentColor" rx="1" />
      <rect x="13" y="3" width="8" height="8" fill="none" rx="1" />
      <rect x="3" y="13" width="8" height="8" fill="currentColor" rx="1" />
      <rect x="13" y="13" width="8" height="8" fill="currentColor" rx="1" />
    </svg>
  );
}
