import "server-only";

export async function POST(req: Request) {
  try {
    const { token, feedKey, sandbox } = await req.json();

    if (!token || !feedKey) {
      return Response.json({ error: "token y feedKey son requeridos" }, { status: 400 });
    }

    const baseUrl = sandbox
      ? "https://partners-sandbox.idealista.com"
      : "https://partners.idealista.com";

    const res = await fetch(`${baseUrl}/v1/customer/publishinfo`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        feedKey,
      },
    });

    const rawBody = await res.text();

    if (!res.ok) {
      return Response.json(
        { error: `API error ${res.status}`, details: rawBody },
        { status: res.status }
      );
    }

    return Response.json(JSON.parse(rawBody));
  } catch (error) {
    console.error("Publish info error:", error);
    return Response.json({ error: "Error al consultar Idealista" }, { status: 500 });
  }
}
