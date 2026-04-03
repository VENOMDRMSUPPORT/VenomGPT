import { describe, it, expect } from "vitest";
import express from "express";
import supertest from "supertest";
import healthRouter from "../routes/health.js";

// Mount only the health router — no database, no startup sequence required.
const app = express();
app.use(healthRouter);

describe("GET /healthz", () => {
  it("returns HTTP 200", async () => {
    const res = await supertest(app).get("/healthz");
    expect(res.status).toBe(200);
  });

  it("returns { status: 'ok' }", async () => {
    const res = await supertest(app).get("/healthz");
    expect(res.body).toEqual({ status: "ok" });
  });

  it("Content-Type is application/json", async () => {
    const res = await supertest(app).get("/healthz");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("returns 404 for unknown routes on this app", async () => {
    const res = await supertest(app).get("/not-a-route");
    expect(res.status).toBe(404);
  });
});
