import { getCommunesByRegion } from "@/lib/db/queries/locations";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  const region = searchParams.get("region");

  if (!country || !region) {
    return Response.json(
      { error: "Country code and region code are required" },
      { status: 400 }
    );
  }

  try {
    const communes = await getCommunesByRegion(country, region);
    return Response.json(communes);
  } catch (error) {
    console.error("Error fetching communes:", error);
    return Response.json(
      { error: "Failed to fetch communes" },
      { status: 500 }
    );
  }
}
