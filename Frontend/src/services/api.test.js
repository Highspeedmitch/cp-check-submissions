import { api, apiUrl, ApiError, API_ORIGIN } from "./api";

describe("api client", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  test("adds authentication and serializes JSON requests", async () => {
    localStorage.setItem("token", "test-token");
    fetch.mockResolvedValue(new Response(
      JSON.stringify({ saved: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));

    await expect(api.put("/api/example", { name: "Property" }))
      .resolves.toEqual({ saved: true });

    const [, options] = fetch.mock.calls[0];
    expect(options.headers.get("Authorization")).toBe("Bearer test-token");
    expect(options.headers.get("Content-Type")).toBe("application/json");
    expect(options.body).toBe(JSON.stringify({ name: "Property" }));
  });

  test("builds backend URLs from the configured API origin", () => {
    expect(apiUrl("/api/properties")).toBe(`${API_ORIGIN}/api/properties`);
    expect(apiUrl("api/properties")).toBe(`${API_ORIGIN}/api/properties`);
  });

  test("surfaces the backend error message", async () => {
    fetch.mockResolvedValue(new Response(
      JSON.stringify({ error: "Invalid account status." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    ));

    await expect(api.get("/api/example")).rejects.toMatchObject({
      name: "ApiError",
      message: "Invalid account status.",
      status: 400,
    });
    await expect(api.get("/api/example")).rejects.toBeInstanceOf(ApiError);
  });
});
