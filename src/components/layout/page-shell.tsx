/* One container rule for every page in the workspace.
 *
 * Before this, the app used five different max-widths and six different
 * padding combinations across its pages, so moving from Dashboard to Reports
 * shifted the content sideways and up by a few pixels for no reason anyone
 * chose. Worse, several pages padded their loading and empty states
 * differently from their loaded state, so the content jumped as soon as the
 * data arrived. None of it was broken enough to file as a bug, which is
 * exactly why it survived: it read as the interface being slightly unsettled
 * everywhere.
 *
 * These are exported as class strings rather than a wrapper component because
 * most page roots are already motion.div elements carrying their own entrance
 * animation, and wrapping those in another div to fix padding would trade one
 * structural oddity for another.
 *
 * Two widths, because the need is real: analysis pages want the room, and a
 * settings form set in a 1440px column is a worse form. Everything else is
 * identical, so the frame stays still while the content changes. */

/** Dashboards, grids, pivots: anything with a table or a chart in it. */
export const SHELL_WIDE = "mx-auto w-full max-w-[1440px]";

/** Forms and prose, where a long measure hurts more than it helps. */
export const SHELL_NARROW = "mx-auto w-full max-w-4xl";

/** The single padding scale. A flat p-8 leaves 32px of gutter on a 360px
 *  phone and squeezes a table into nothing, so it steps up with the viewport
 *  instead of being generous everywhere or mean everywhere. */
export const SHELL_PAD = "p-4 sm:p-6 md:p-8";

/** A loaded analysis page. */
export const PAGE_WIDE = `${SHELL_WIDE} ${SHELL_PAD}`;

/** A loaded form or prose page. */
export const PAGE_NARROW = `${SHELL_NARROW} ${SHELL_PAD}`;

/** Loading and empty states. Same padding and width as the loaded page, so
 *  nothing moves at the moment the data arrives. */
export const PAGE_CENTERED = `${SHELL_WIDE} ${SHELL_PAD} flex min-h-[60vh] items-center justify-center`;
