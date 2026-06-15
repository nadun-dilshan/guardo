import nextra from "nextra";

const withNextra = nextra({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.tsx",
  defaultShowCopyCode: true,
});

// GitHub Pages serves this project site under /guardo/, so assets must be
// prefixed with that base path. Only apply it for production builds (the
// static export); `next dev` stays at the root for local development.
const basePath = process.env.NODE_ENV === "production" ? "/guardo" : "";

export default withNextra({
  reactStrictMode: true,
  // Static HTML export → ./out, served by GitHub Pages.
  output: "export",
  images: { unoptimized: true },
  // Trailing slashes keep relative asset paths working on static hosts.
  trailingSlash: true,
  // Serve the site and all _next assets from the /guardo/ subpath.
  basePath,
  assetPrefix: basePath,
});
