import { test } from "node:test";
import assert from "node:assert/strict";
import { publicBaseUrl, LOCAL_DEV_BASE_URL } from "../src/lib/urls";

// Stripe redirect URLs come from server config only; localhost can never appear
// outside local development.

test("local development defaults to the local dev URL", () => {
  assert.equal(publicBaseUrl({ NODE_ENV: "development" }), LOCAL_DEV_BASE_URL);
  assert.equal(publicBaseUrl({}), LOCAL_DEV_BASE_URL);
});

test("local development may use an explicit http PUBLIC_BASE_URL", () => {
  assert.equal(publicBaseUrl({ NODE_ENV: "development", PUBLIC_BASE_URL: "http://localhost:5173/" }), "http://localhost:5173");
});

test("production uses PUBLIC_BASE_URL (origin only)", () => {
  assert.equal(publicBaseUrl({ VERCEL_ENV: "production", PUBLIC_BASE_URL: "https://lehrs.co.uk/" }), "https://lehrs.co.uk");
  assert.equal(publicBaseUrl({ VERCEL_ENV: "production", PUBLIC_BASE_URL: "https://lehrs.co.uk/some/path?x=1" }), "https://lehrs.co.uk");
});

test("production REFUSES to start without PUBLIC_BASE_URL (no header/localhost fallback)", () => {
  assert.throws(() => publicBaseUrl({ VERCEL_ENV: "production" }), /PUBLIC_BASE_URL must be set in production/);
  assert.throws(() => publicBaseUrl({ NODE_ENV: "production" }), /PUBLIC_BASE_URL must be set in production/);
});

test("production can never use localhost, loopback, private or plain-http URLs", () => {
  for (const bad of ["http://localhost:23921", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://192.168.1.10", "https://10.0.0.5", "https://172.16.0.1", "http://lehrs.co.uk"]) {
    assert.throws(() => publicBaseUrl({ VERCEL_ENV: "production", PUBLIC_BASE_URL: bad }), /Server misconfigured/, bad);
  }
});

test("preview uses PUBLIC_BASE_URL if set, otherwise its own https VERCEL_URL", () => {
  assert.equal(publicBaseUrl({ VERCEL_ENV: "preview", VERCEL_URL: "lehr-git-x-team.vercel.app" }), "https://lehr-git-x-team.vercel.app");
  assert.equal(publicBaseUrl({ VERCEL_ENV: "preview", PUBLIC_BASE_URL: "https://preview.example.com", VERCEL_URL: "ignored.vercel.app" }), "https://preview.example.com");
});

test("preview can never use localhost", () => {
  assert.throws(() => publicBaseUrl({ VERCEL_ENV: "preview", PUBLIC_BASE_URL: "http://localhost:23921" }), /Server misconfigured/);
  assert.throws(() => publicBaseUrl({ VERCEL_ENV: "preview" }), /PUBLIC_BASE_URL is not set/);
});

test("invalid URLs are rejected", () => {
  assert.throws(() => publicBaseUrl({ VERCEL_ENV: "production", PUBLIC_BASE_URL: "not a url" }), /not a valid URL/);
});
