/* The card people actually see.
 *
 * A link pasted into WhatsApp, Slack, or X is rendered from this image. With
 * nothing declared, those apps fall back to scraping the favicon and blowing it
 * up, which is why the preview looked like a stray icon rather than a product.
 *
 * Drawn at build time from the same mark and palette the app uses, so the card
 * cannot drift from the brand. No remote fonts are fetched: a font request that
 * fails would take the whole image down with it, and a missing preview is worse
 * than a plainly-typeset one. */

import { ImageResponse } from "next/og";

export const alt = "Nexora — the analytics OS that runs in your browser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GOLD = "#e7b856";
const SURFACE = "#101315";
const TEXT = "#f1f2ed";
const MUTED = "#b7bfba";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: SURFACE,
          padding: "72px 80px",
          position: "relative",
        }}
      >
        {/* A wash of the brand gold, so the card is not a black rectangle in a
            feed full of black rectangles. */}
        <div
          style={{
            position: "absolute",
            top: -260,
            right: -180,
            width: 780,
            height: 780,
            borderRadius: 9999,
            background:
              "radial-gradient(circle, rgba(231,184,86,0.22) 0%, rgba(231,184,86,0.05) 45%, rgba(231,184,86,0) 70%)",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="76" height="76" viewBox="0 0 200 200" fill="none">
            <path
              d="M40 60V140L100 175L160 140V60L100 25L40 60Z"
              stroke={GOLD}
              strokeWidth="12"
              strokeLinejoin="round"
            />
            <path
              d="M100 25L40 60L100 95L160 60L100 25Z"
              fill={GOLD}
              fillOpacity="0.2"
              stroke={GOLD}
              strokeWidth="8"
              strokeLinejoin="round"
            />
            <path d="M100 95V175" stroke={GOLD} strokeWidth="8" strokeLinecap="round" />
            <circle cx="100" cy="100" r="15" fill={GOLD} />
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 46, fontWeight: 700, color: TEXT, letterSpacing: -1.2 }}>
              Nexora
            </div>
            <div
              style={{
                fontSize: 17,
                color: MUTED,
                letterSpacing: 5,
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              Analytics OS
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 62,
              fontWeight: 700,
              color: TEXT,
              lineHeight: 1.12,
              letterSpacing: -2,
              maxWidth: 940,
            }}
          >
            Clean the data. Summarize it. Chart it. Ship it.
          </div>
          <div style={{ fontSize: 27, color: MUTED, lineHeight: 1.4, maxWidth: 900 }}>
            Dataset Doctor finds every broken cell. Pivot tables, dashboards, and reports follow —
            then export live to Power BI and Tableau.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {["Local-first", "No account", "Power BI + Tableau export"].map((tag) => (
            <div
              key={tag}
              style={{
                display: "flex",
                fontSize: 21,
                color: GOLD,
                border: "1px solid rgba(231,184,86,0.32)",
                background: "rgba(231,184,86,0.09)",
                borderRadius: 9999,
                padding: "10px 22px",
              }}
            >
              {tag}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
