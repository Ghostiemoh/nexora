/* The chart palette, kept in its own module because three very different
 * consumers need it: the renderer on screen, the SVG written for an image
 * export, and the theme files handed to Power BI and Tableau. A chart that
 * changes colour on its way out of the product is a chart nobody trusts.
 *
 * Tuned against the application surface (#101315): gold leads, then a cool
 * counterweight, then warm and cool alternating so neighbouring series never
 * blur into each other. */

export const CHART_PALETTE = [
  "#e7b856",
  "#8dc6bd",
  "#d99a6c",
  "#9bb8d3",
  "#c8a2c8",
  "#a8c686",
  "#e0a3a3",
  "#b9c4bc",
];

/** The surface charts are drawn against. */
export const CHART_SURFACE = "#101315";
/** Body text on that surface. */
export const CHART_FOREGROUND = "#f1f2ed";
/** Axis labels and other secondary text. */
export const CHART_MUTED = "#b7bfba";
