import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Boards",
    short_name: "Boards",
    description: "Team tasks arranged on boards, lists, and cards.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#0079bf",
    theme_color: "#0079bf",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
