/* X (and anything else reading twitter:image) gets the same card as everyone
 * else. Re-exported rather than duplicated so the two can never drift. */

export { default, alt, size, contentType } from "./opengraph-image";
