import type { ReactNode, SVGProps } from "react";

/** One stroke icon set (24px grid, 1.75 stroke, currentColor) so every control draws the same way. */
function Svg({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

type IconProps = SVGProps<SVGSVGElement>;

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
  </Svg>
);

export const FlameIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21c-3.9 0-7-2.8-7-6.6 0-2.6 1.5-4.6 3-6.1.3 1.6 1.2 2.7 2.3 3.2C10 8 11.4 5 14 3c.2 2.6 1.6 4.3 3 5.8 1.3 1.4 2 3.2 2 5.6C19 18.2 15.9 21 12 21z" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" />
  </Svg>
);

export const TrendingIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />
  </Svg>
);

export const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
);

export const PlayIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" />
  </svg>
);

/** The live-signal mark from docs/logo.svg: a dot with broadcast rings. */
export const LogoMark = (p: IconProps) => (
  <svg viewBox="0 0 120 120" aria-hidden="true" {...p}>
    <defs>
      <linearGradient id="logo-mark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff9a3c" />
        <stop offset="1" stopColor="#ff453a" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="12" fill="url(#logo-mark)" />
    <path d="M39 39a30 30 0 0 0 0 42M81 39a30 30 0 0 1 0 42" fill="none" stroke="url(#logo-mark)" strokeWidth="8" strokeLinecap="round" opacity=".85" />
    <path d="M25 25a50 50 0 0 0 0 70M95 25a50 50 0 0 1 0 70" fill="none" stroke="url(#logo-mark)" strokeWidth="8" strokeLinecap="round" opacity=".45" />
  </svg>
);
