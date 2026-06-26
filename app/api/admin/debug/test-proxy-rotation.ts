import { getProxyUrl } from "@/lib/sync/proxy-config";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Fetch 5 times to show IP rotation
    const proxies = [];
    for (let i = 0; i < 5; i++) {
      const url = await getProxyUrl();
      proxies.push({
        attempt: i + 1,
        url: url
          ? `${url.split("//")[1]}`
          : "no proxy configured",
      });
    }

    return NextResponse.json({
      status: "ok",
      message: "Smartproxy IP rotation test (5 attempts)",
      proxies,
      info: "Each call should return a different IP if Smartproxy API is working",
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
