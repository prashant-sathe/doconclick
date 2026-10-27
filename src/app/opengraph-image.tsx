import { ImageResponse } from "next/og";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";

export const alt = `${SITE_NAME} | Healthcare Platform`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // White-text logo for the dark brand background (assets/brand).
  const logo = `data:image/png;base64,${await readFile(join(process.cwd(), "public/logo-dark.png"), "base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #143a82 0%, #11607e 55%, #0f9b72 100%)",
          padding: "80px",
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img src={logo} width={800} height={161} />
        <div
          style={{
            display: "flex",
            marginTop: 44,
            fontSize: 34,
            color: "rgba(255,255,255,0.9)",
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>
    ),
    { ...size }
  );
}
