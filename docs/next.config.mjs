import nextra from "nextra";

const withNextra = nextra({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.tsx",
  defaultShowCopyCode: true,
});

export default withNextra({
  reactStrictMode: true,
  // Static HTML export → ./out, served by GitHub Pages.
  output: "export",
  images: { unoptimized: true },
  // Trailing slashes keep relative asset paths working on static hosts.
  trailingSlash: true,
});
