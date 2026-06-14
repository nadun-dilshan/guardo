import React from "react";
import { DocsThemeConfig } from "nextra-theme-docs";

const config: DocsThemeConfig = {
  logo: (
    <span style={{ fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.5px" }}>
      🔐 guardo
    </span>
  ),
  project: {
    link: "https://github.com/nadun-dilshan/guardo",
  },
  docsRepositoryBase: "https://github.com/nadun-dilshan/guardo/tree/main/docs",
  chat: {
    link: "https://www.npmjs.com/package/guardo",
    icon: (
      <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>npm</span>
    ),
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta
        name="description"
        content="guardo — a complete authentication engine for Node.js and Next.js with OTP login, JWT tokens, multi-device sessions, and middleware."
      />
      <meta property="og:title" content="guardo · Production-Ready Auth Engine" />
      <meta
        property="og:description"
        content="OTP login, JWT tokens, multi-device sessions, and middleware for Node.js & Next.js."
      />
      <meta property="og:image" content="/banner.webp" />
      <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    </>
  ),
  footer: {
    content: (
      <span>
        MIT {new Date().getFullYear()} ©{" "}
        <a href="https://github.com/nadun-dilshan" target="_blank" rel="noreferrer">
          nadun-dilshan
        </a>
        . Built with Nextra.
      </span>
    ),
  },
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    backToTop: true,
  },
  color: {
    hue: 250,
    saturation: 90,
  },
};

export default config;
