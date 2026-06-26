import { getRegionsByCountry } from "@/lib/db/queries/locations";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");

  if (!country) {
    return Response.json(
      { error: "Country code is required" },
      { status: 400 }
    );
  }

  try {
    const regions = await getRegionsByCountry(country);
    return Response.json(regions);
  } catch (error) {
    console.error("Error fetching regions:", error);
    return Response.json(
      { error: "Failed to fetch regions" },
      { status: 500 }
    );
  }
}
