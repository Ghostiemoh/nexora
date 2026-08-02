/* The Nexora mark. One definition, used by the sidebar, the mobile bar, and the
 * favicon at src/app/icon.svg, so the brand can never drift between surfaces. */
export function NexoraMark({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg
      className={`${className} shrink-0 text-primary`}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M40 60V140L100 175L160 140V60L100 25L40 60Z"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      <path
        d="M100 25L40 60L100 95L160 60L100 25Z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <path d="M100 95V175" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      <circle cx="100" cy="100" r="15" fill="currentColor" />
    </svg>
  );
}
