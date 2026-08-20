import type { IconName } from "@/lib/navigation";

/**
 * Inline SVG icon set.
 *
 * Hand-rolled rather than pulling in an icon library: we use ~16 glyphs, and a
 * dependency would ship thousands. All are 24x24 on a common stroke so they
 * sit consistently in the sidebar.
 */

const PATHS: Record<IconName, string> = {
  dashboard: "M4 5h6v6H4zM14 5h6v4h-6zM14 13h6v6h-6zM4 15h6v4H4z",
  search: "M11 4a7 7 0 105.2 11.7L21 20.5M11 4a7 7 0 00-7 7 7 7 0 007 7",
  match: "M7 8a3 3 0 106 0 3 3 0 10-6 0M3 20a5 5 0 0110 0M16 11l2 2 4-4",
  building: "M4 21V6l7-3 7 3v15M4 21h14M9 11h1M13 11h1M9 15h1M13 15h1M9 21v-3h4v3",
  users: "M6 8a3 3 0 106 0 3 3 0 10-6 0M2 20a4 4 0 018 0M16 7a3 3 0 110 6M17 20a4 4 0 015-3.9",
  guest: "M4 21V7l8-4 8 4v14M4 21h16M10 21v-5h4v5",
  wallet: "M3 8a2 2 0 012-2h13a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 10h18M16 14h2",
  card: "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 10h18M7 15h4",
  vote: "M4 6h16M4 12h10M4 18h7M16 16l2 2 4-4",
  meal: "M6 3v8a2 2 0 004 0V3M8 11v10M18 3c-1.5 2-2 4-2 6s.5 3 2 3v9",
  wrench: "M20 5a4 4 0 01-5.4 5.4L6 19a2 2 0 11-3-3l8.6-8.6A4 4 0 0117 2l-3 3 2 2 3-3z",
  rotate: "M4 12a8 8 0 0113.7-5.7L21 9M21 4v5h-5M20 12a8 8 0 01-13.7 5.7L3 15M3 20v-5h5",
  gavel: "M9 4l6 6-3 3-6-6zM12 13l6 6M4 21h9",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  pin: "M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5",
  calendar: "M4 7a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2zM4 10h16M8 3v4M16 3v4",
  shield: "M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6zM9 12l2 2 4-4",
  message: "M4 4h16v12H9l-5 4z",
};

export function Icon({ name, className = "h-[18px] w-[18px]" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
