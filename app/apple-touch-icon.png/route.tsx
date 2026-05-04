import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0a0a0a",
          color: "#b6ff3b",
          display: "flex",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: 58,
          fontWeight: 800,
          height: "100%",
          justifyContent: "center",
          letterSpacing: 0,
          width: "100%"
        }}
      >
        SG
      </div>
    ),
    {
      height: 180,
      width: 180
    }
  );
}
