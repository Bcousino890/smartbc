import { getSectorsByCommune } from "@/lib/db/queries/locations";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  const region = searchParams.get("region");
  const commune = searchParams.get("commune");

  if (!country || !region || !commune) {
    return Response.json(
      { error: "Country code, region code, and commune code are required" },
      { status: 400 }
    );
  }

  try {
    const sectors = await getSectorsByCommune(country, region, commune);
    return Response.json(sectors);
  } catch (error) {
    console.error("Error fetching sectors:", error);
    return Response.json(
      { error: "Failed to fetch sectors" },
      { status: 500 }
    );
  }
}
