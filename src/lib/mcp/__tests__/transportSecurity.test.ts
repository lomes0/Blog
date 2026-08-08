/**
 * Refusing a bearer token in cleartext (docs/plans/mcp_support.md phase 5).
 *
 * The environment is a parameter, so these run without touching `process.env`
 * and without the ordering hazard that comes with restoring it.
 */
import { describe, expect, it } from "vitest";
import { isSecureTransport } from "../transportSecurity";

const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers });

describe("isSecureTransport", () => {
  it("accepts a direct HTTPS request", () => {
    expect(isSecureTransport(req("https://blog.example/api/mcp"), {})).toBe(true);
  });

  it("refuses plain HTTP to a public host", () => {
    // The case this whole check exists for: "give it the IP of the blog
    // server", which is where the plan started.
    expect(
      isSecureTransport(req("http://203.0.113.10/api/mcp"), {}),
    ).toBe(false);
  });

  it("trusts a proxy that terminated TLS", () => {
    expect(
      isSecureTransport(
        req("http://blog.example/api/mcp", { "x-forwarded-proto": "https" }),
        {},
      ),
    ).toBe(true);
  });

  it("reads the client's own protocol from a proxy chain, not the last hop", () => {
    // A chain appends, so the client is first. Reading the last entry would
    // report the protocol between two proxies inside the datacentre.
    expect(
      isSecureTransport(
        req("http://blog.example/api/mcp", {
          "x-forwarded-proto": "https, http",
        }),
        {},
      ),
    ).toBe(true);
    expect(
      isSecureTransport(
        req("http://blog.example/api/mcp", {
          "x-forwarded-proto": "http, https",
        }),
        {},
      ),
    ).toBe(false);
  });

  it("allows loopback, with or without a port, v4 and v6", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "localhost"]) {
      expect(isSecureTransport(req("http://blog.example/api/mcp", { host }), {}))
        .toBe(true);
    }
  });

  it("does not mistake a lookalike host for loopback", () => {
    for (const host of ["localhost.evil.example", "127.0.0.1.evil.example", "notlocalhost"]) {
      expect(isSecureTransport(req("http://blog.example/api/mcp", { host }), {}))
        .toBe(false);
    }
  });

  it("honours the explicit opt-out, and only the exact value", () => {
    const insecure = req("http://203.0.113.10/api/mcp");
    expect(isSecureTransport(insecure, { MCP_ALLOW_INSECURE: "1" })).toBe(true);
    // Not "truthy" — a stray "0" or "false" in a deployment's env must not
    // silently disable this.
    expect(isSecureTransport(insecure, { MCP_ALLOW_INSECURE: "0" })).toBe(false);
    expect(isSecureTransport(insecure, { MCP_ALLOW_INSECURE: "false" })).toBe(false);
    expect(isSecureTransport(insecure, { MCP_ALLOW_INSECURE: "" })).toBe(false);
  });
});
