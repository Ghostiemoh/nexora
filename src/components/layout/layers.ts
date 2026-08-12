/* The stacking order, in one place.
 *
 * The app had grown four modal overlays sitting at three different z-indexes
 * (z-50, z-60, z-70), one of which tied with the sticky top navbar. Nothing
 * looked broken, because DOM order happened to break every tie the right way.
 * That is not the same as being correct: it means the next overlay added, or
 * the next component moved up the tree, decides its own layering by accident.
 *
 * The scale below is ordered by how much of the screen a thing owns and how
 * recently the user asked for it. Anything that traps focus outranks anything
 * that does not; anything the user just opened outranks the furniture.
 *
 * Use these constants rather than a literal. A z-index is only ever meaningful
 * relative to its neighbours, so a number chosen alone is a number chosen
 * wrong. */

/** Sticky headers inside a scrolling table. Lowest, because they belong to
 *  their own scroll container and must never escape it. */
export const Z_TABLE_HEADER = "z-10";

/** In-page sticky furniture: the section jump bar. */
export const Z_SECTION_NAV = "z-20";

/** The application top bar, sticky above page content. */
export const Z_NAVBAR = "z-30";

/** Dropdowns, popovers, and menus anchored to a control. Above the chrome
 *  they belong to, below anything modal. */
export const Z_POPOVER = "z-40";

/** Full-screen modal overlays that trap focus. One value for all of them, so
 *  two overlays can never disagree about which is on top. */
export const Z_MODAL = "z-50";

/** Toasts and notifications, which must stay readable over a modal. */
export const Z_TOAST = "z-60";

/** The shared backdrop for a modal overlay: scrim, blur, centring, and the
 *  scroll behaviour a tall dialog needs. */
export const MODAL_BACKDROP = `fixed inset-0 ${Z_MODAL} flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm`;
