import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { OAuth2Client } from "google-auth-library";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const getOAuthClient = (req: any) => {
  // Always use https for public redirect URIs unless it's explicitly localhost (though Google Fit requires https anyway)
  const protocol = "https";
  const host = req.headers["x-forwarded-host"] || req.get("host");

  let baseUrl;
  
  // Use HTTPS for everything on these domains
  if (process.env.APP_URL && (host === 'localhost:3000' || host === '0.0.0.0:3000' || !host)) {
    baseUrl = process.env.APP_URL.trim().replace(/\/$/, "");
  } else {
    baseUrl = `${protocol}://${host}`;
  }

  // Ensure the base URL uses https if it's a cloud run domain
  if (baseUrl.includes('.run.app') && baseUrl.startsWith('http:')) {
    baseUrl = baseUrl.replace('http:', 'https:');
  }

  // Ensure no trailing slash on baseUrl
  baseUrl = baseUrl.replace(/\/$/, "");
  const redirectUri = `${baseUrl}/auth/callback`;
  
  return {
    client: new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    ),
    redirectUri
  };
};

// Scopes for Google Fit
const SCOPES = [
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.body.read",
  "https://www.googleapis.com/auth/fitness.location.read",
  "https://www.googleapis.com/auth/fitness.sleep.read"
];

// Auth URL endpoint
app.get("/api/auth/google/url", (req, res) => {
  const { client, redirectUri } = getOAuthClient(req);
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    // Adding state to keep track of the original host if needed
    state: Buffer.from(redirectUri).toString('base64')
  });
  console.log("Current Setup - Redirect URI:", redirectUri);
  console.log("Client ID Present:", !!process.env.GOOGLE_CLIENT_ID);
  res.json({ 
    url, 
    debug_redirect_uri: redirectUri,
    is_configured: !!process.env.GOOGLE_CLIENT_ID 
  });
});

app.get("/api/fit/status", (req, res) => {
  res.json({
    configured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    has_client_id: !!process.env.GOOGLE_CLIENT_ID,
    has_client_secret: !!process.env.GOOGLE_CLIENT_SECRET,
    detected_host: req.get("host"),
    detected_proto: req.headers["x-forwarded-proto"] || req.protocol,
    forwarded_host: req.headers["x-forwarded-host"],
    app_url_env: process.env.APP_URL ? "Set (Hidden)" : "Not Set",
    runtime_redirect_uri: getOAuthClient(req).redirectUri
  });
});

// OAuth Callback
app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
  const { code } = req.query;
  const { client } = getOAuthClient(req);
  try {
    const { tokens } = await client.getToken(code as string);
    
    // Store tokens in a secure cookie
    res.cookie("google_fit_tokens", JSON.stringify(tokens), {
      secure: true,
      sameSite: "none",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage('OAUTH_AUTH_SUCCESS', '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth Exchange Error:", error);
    res.status(500).send("Authentication failed");
  }
});

// Disconnect Google Fit
app.post("/api/fit/disconnect", (req, res) => {
  res.clearCookie("google_fit_tokens", {
    secure: true,
    sameSite: "none",
    httpOnly: true
  });
  res.json({ success: true });
});

// Get Google Fit Data
app.get("/api/fit/sync", async (req, res) => {
  const tokenCookie = req.cookies.google_fit_tokens;
  if (!tokenCookie) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { client } = getOAuthClient(req);
  const tokens = JSON.parse(tokenCookie);
  client.setCredentials(tokens);

  try {
    const now = new Date();
    // Default to today if no range provided (server-side fallback)
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const defaultEnd = now.getTime();

    const startTimeMillis = req.query.startTime ? parseInt(req.query.startTime as string) : defaultStart;
    const endTimeMillis = req.query.endTime ? parseInt(req.query.endTime as string) : defaultEnd;

    // 1. Fetch Steps (Bucket by Day)
    const stepsResponse = await client.request({
      url: "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
      method: "POST",
      data: {
        aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
        bucketByTime: { durationMillis: 86400000 }, // 24 hours
        startTimeMillis,
        endTimeMillis
      }
    }) as any;

    const dailyStepsMap: { [dateStr: string]: number } = {};
    let totalSteps = 0;

    if (stepsResponse.data.bucket) {
      stepsResponse.data.bucket.forEach((bucket: any) => {
        const date = new Date(parseInt(bucket.startTimeMillis));
        const dateStr = date.toDateString();
        let bucketSteps = 0;
        if (bucket.dataset && bucket.dataset[0] && bucket.dataset[0].point && bucket.dataset[0].point[0]) {
          bucketSteps = bucket.dataset[0].point[0].value[0].intVal || 0;
        }
        dailyStepsMap[dateStr] = bucketSteps;
        totalSteps += bucketSteps;
      });
    }

    // 1b. Fetch Heart Minutes/Points (Bucket by Day)
    const dailyHeartPointsMap: { [dateStr: string]: number } = {};
    try {
      const heartPointsResponse = await client.request({
        url: "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
        method: "POST",
        data: {
          aggregateBy: [{ dataTypeName: "com.google.heart_minutes" }],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis,
          endTimeMillis
        }
      }) as any;

      if (heartPointsResponse.data.bucket) {
        heartPointsResponse.data.bucket.forEach((bucket: any) => {
          const date = new Date(parseInt(bucket.startTimeMillis));
          const dateStr = date.toDateString();
          let hpVal = 0;
          const dataset = bucket.dataset[0];
          if (dataset && dataset.point) {
            dataset.point.forEach((point: any) => {
              if (point.value && point.value[0]) {
                hpVal += point.value[0].fpVal || point.value[0].intVal || 0;
              }
            });
          }
          dailyHeartPointsMap[dateStr] = Math.round(hpVal);
        });
      }
    } catch (e) {
      console.warn("Heart Minutes fetch warning (may require profile sync/permissions):", e);
    }

    // 1c. Fetch Sleep Segment (Bucket by Day)
    const dailySleepMap: { [dateStr: string]: number } = {};
    try {
      const sleepResponse = await client.request({
        url: "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
        method: "POST",
        data: {
          aggregateBy: [{ dataTypeName: "com.google.sleep.segment" }],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis,
          endTimeMillis
        }
      }) as any;

      if (sleepResponse.data.bucket) {
        sleepResponse.data.bucket.forEach((bucket: any) => {
          const date = new Date(parseInt(bucket.startTimeMillis));
          const dateStr = date.toDateString();
          let sleepMs = 0;
          const dataset = bucket.dataset[0];
          if (dataset && dataset.point) {
            dataset.point.forEach((point: any) => {
              const status = point.value[0]?.intVal;
              // 1 = awake, 3 = out of bed. Only count 2, 4, 5, 6
              if (status && status !== 1 && status !== 3) {
                const startNanos = parseInt(point.startTimeNanos);
                const endNanos = parseInt(point.endTimeNanos);
                if (startNanos && endNanos) {
                  sleepMs += (endNanos - startNanos) / 1000000;
                }
              }
            });
          }
          // convert to hours
          dailySleepMap[dateStr] = parseFloat((sleepMs / (1000 * 60 * 60)).toFixed(1));
        });
      }
    } catch (e) {
      console.warn("Sleep fetch warning (user might not have granted sleep scope yet):", e);
    }

    // 2. Fetch Sessions (Workouts) for the range
    const sessionsResponse = await client.request({
      url: `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${new Date(startTimeMillis).toISOString()}&endTime=${new Date(endTimeMillis).toISOString()}`,
      method: "GET"
    }) as any;

    const sessions = sessionsResponse.data.deletedSession ? [] : sessionsResponse.data.session || [];

    // Parse sleep durations from sessions (Activity type 72 is Sleep) as a robust backup
    sessions.forEach((session: any) => {
      const activityType = session.activityType;
      const isSleep = activityType === 72 || String(activityType) === "72" || String(activityType).toLowerCase().includes("sleep");
      if (isSleep) {
        const sStart = parseInt(session.startTimeMillis);
        const sEnd = parseInt(session.endTimeMillis);
        const durationHours = (sEnd - sStart) / (1000 * 60 * 60);
        const dateStr = new Date(sStart).toDateString();
        dailySleepMap[dateStr] = parseFloat(Math.max(dailySleepMap[dateStr] || 0, durationHours).toFixed(1));
      }
    });

    // Only process non-sleep active workouts for detailed calculations
    const activeWorkoutSessions = sessions.filter((s: any) => {
      const activityType = s.activityType;
      const isSleep = activityType === 72 || String(activityType) === "72" || String(activityType).toLowerCase().includes("sleep");
      return !isSleep;
    });

    // 3. For each workout session, fetch heart rate and calories
    const detailedSessions = await Promise.all(activeWorkoutSessions.map(async (session: any) => {
      const sStart = parseInt(session.startTimeMillis);
      const sEnd = parseInt(session.endTimeMillis);

      const statsResponse = await client.request({
        url: "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
        method: "POST",
        data: {
          aggregateBy: [
            { dataTypeName: "com.google.heart_rate.bpm" },
            { dataTypeName: "com.google.calories.expended" },
            { dataTypeName: "com.google.distance.delta" }
          ],
          bucketByTime: { durationMillis: sEnd - sStart },
          startTimeMillis: sStart,
          endTimeMillis: sEnd
        }
      }) as any;

      let avgHeartRate = 0;
      let totalCalories = 0;
      let totalDistance = 0;

      if (statsResponse.data.bucket && statsResponse.data.bucket[0]) {
        const heartRateSet = statsResponse.data.bucket[0].dataset.find((ds: any) => ds.dataSourceId.includes("heart_rate"));
        const caloriesSet = statsResponse.data.bucket[0].dataset.find((ds: any) => ds.dataSourceId.includes("calories"));
        const distanceSet = statsResponse.data.bucket[0].dataset.find((ds: any) => ds.dataSourceId.includes("distance"));

        if (heartRateSet?.point[0]) avgHeartRate = Math.round(heartRateSet.point[0].value[0].fpVal || 0);
        if (caloriesSet?.point[0]) totalCalories = Math.round(caloriesSet.point[0].value[0].fpVal || 0);
        if (distanceSet?.point[0]) {
          // Convert meters to miles
          totalDistance = (distanceSet.point[0].value[0].fpVal || 0) * 0.000621371;
        }
      }

      return {
        id: session.id,
        name: session.name,
        type: session.activityType,
        startTime: sStart,
        endTime: sEnd,
        avgHeartRate,
        calories: totalCalories,
        distance: totalDistance
      };
    }));

    res.json({
      steps: totalSteps,
      dailyStepsMap,
      dailySleepMap,
      dailyHeartPointsMap,
      workouts: detailedSessions
    });
  } catch (error) {
    console.error("Google Fit Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch data from Google Fit" });
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
