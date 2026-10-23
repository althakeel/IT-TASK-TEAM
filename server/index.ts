import "./env";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { connectDb, mongoReady } from "./db";
import { firebaseAdminReady } from "./firebase";
import { HttpError } from "./http";
import { imageKitReady } from "./imagekit";
import { mailReady } from "./mail";
import { setIo } from "./realtime";
import { authRouter } from "./routes/auth";
import { notificationRouter } from "./routes/notifications";
import { boardRouter } from "./routes/boards";
import { contentRouter } from "./routes/content";
import { imageKitRouter } from "./routes/imagekit";
import { workspaceRouter } from "./routes/workspaces";
import { attachSocket } from "./socket";

const app = express();
const origin = process.env.CLIENT_ORIGIN || "http://localhost:3000";

app.use(cors({ origin, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Boards API</title></head>
  <body style="font-family: Segoe UI, sans-serif; padding: 2rem; color: #172b4d">
    <h1>Boards API</h1>
    <p>This address is the API, not the app.</p>
    <p>Open <a href="${origin}">${origin}</a>.</p>
  </body>
</html>`);
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mongo: mongoReady(),
    firebase: firebaseAdminReady(),
    imagekit: imageKitReady(),
    resend: mailReady(),
  });
});

app.use("/api", authRouter);
app.use("/api", notificationRouter);
app.use("/api", workspaceRouter);
app.use("/api", boardRouter);
app.use("/api", contentRouter);
app.use("/api", imageKitRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "Invalid JSON." });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Something went wrong." });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin, credentials: true },
});
setIo(io);
attachSocket(io);

const port = Number(process.env.PORT || 4000);

connectDb()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown database error";
    console.error(`MongoDB connection failed: ${message}`);
  })
  .finally(() => {
    httpServer.listen(port, () => {
      console.log(`API listening on ${port}`);
    });
  });

httpServer.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
