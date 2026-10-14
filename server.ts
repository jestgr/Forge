import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { OAuth2Client } from "google-auth-library";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

// Google Fit Activity Types mapping
const FIT_ACTIVITY_MAP: { [key: number]: string } = {
  0: "In Vehicle",
  1: "Biking",
  2: "On Foot",
  3: "Still",
  7: "Walking",
  8: "Running",
  9: "Aerobics",
  13: "Circuit Training",
  14: "Crossfit",
  15: "Dance",
  16: "Elliptical",
  20: "Calisthenics",
  21: "Circuit Training",
  24: "Rowing",
  25: "Elliptical",
  26: "Stair Climbing",
  41: "Kettlebell",
  57: "Rowing Machine",
  58: "Running (Treadmill)",
  72: "Sleep",
  86: "HIIT",
  87: "Interval Training",
  97: "Strength Training",
  100: "Rowing",
  102: "Elliptical",
  103: "Stair Climbing",
  104: "Sprinting",
  108: "Yoga",
  109: "Pilates",
  113: "Crossfit",
  114: "Functional Strength",
  115: "Boxing",
  119: "Weightlifting"
};

const getSuggestedCategory = (activityType: number, name: string = "", durationMins: number, avgHeartRate: number): 'Heavy' | 'Zone 2' | 'HIIT' | 'Other' => {
  const lowerName = (name || "").toLowerCase();
  
  // Explicit name matches
  if (lowerName.includes("hiit") || lowerName.includes("interval") || lowerName.includes("sprint") || lowerName.includes("4x4") || lowerName.includes("tabata") || lowerName.includes("vo2")) {
    return 'HIIT';
  }
  if (lowerName.includes("zone 2") || lowerName.includes("z2") || lowerName.includes("steady state") || lowerName.includes("aerobic base")) {
    return 'Zone 2';
  }
  if (lowerName.includes("strength") || lowerName.includes("weight") || lowerName.includes("lift") || lowerName.includes("squat") || lowerName.includes("bench") || lowerName.includes("deadlift") || lowerName.includes("heavy") || lowerName.includes("resistance") || lowerName.includes("gym")) {
    return 'Heavy';
  }

  // Activity Type IDs for Resistance / Heavy lifts
  if ([97, 119, 113, 114, 20, 21, 41, 13, 14].includes(activityType)) {
    return 'Heavy';
  }

  // HIIT / High Intensity
  if ([86, 87, 104, 115].includes(activityType) || (durationMins >= 15 && durationMins <= 35 && avgHeartRate >= 150)) {
    return 'HIIT';
  }

  // Zone 2 / Steady State Cardio
  if ([1, 7, 8, 24, 25, 26, 57, 58, 100, 102, 103, 16].includes(activityType)) {
    if (avgHeartRate >= 160 && durationMins <= 30) {
      return 'HIIT';
    }
    return 'Zone 2';
  }

  // Catch-alls based on intensity & duration
  if (avgHeartRate >= 150 && durationMins < 40) return 'HIIT';
  if (durationMins >= 30) return 'Zone 2';
  
  return 'Other';
};

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

    // 1. Fetch Steps (Bucket by Day) - first try merged estimated_steps
    let stepsResponse: any;
    try {
      stepsResponse = await client.request({
        url: "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
        method: "POST",
        data: {
          aggregateBy: [
            { 
              dataTypeName: "com.google.step_count.delta",
              dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
            }
          ],
          bucketByTime: { durationMillis: 86400000 }, // 24 hours
          startTimeMillis,
          endTimeMillis
        }
      });
    } catch (err) {
      // Fallback to generic step_count aggregation if explicit estimated_steps fails
      stepsResponse = await client.request({
        url: "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
        method: "POST",
        data: {
          aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis,
          endTimeMillis
        }
      });
    }

    const dailyStepsMap: { [dateStr: string]: number } = {};
    let totalSteps = 0;

    if (stepsResponse.data && stepsResponse.data.bucket) {
      stepsResponse.data.bucket.forEach((bucket: any) => {
        const date = new Date(parseInt(bucket.startTimeMillis));
        const dateStr = date.toDateString();
        let bucketSteps = 0;
        if (bucket.dataset) {
          bucket.dataset.forEach((ds: any) => {
            if (ds.point) {
              ds.point.forEach((point: any) => {
                if (point.value && point.value[0]) {
                  bucketSteps += (point.value[0].intVal || point.value[0].fpVal || 0);
                }
              });
            }
          });
        }
        dailyStepsMap[dateStr] = Math.round(bucketSteps);
        totalSteps += Math.round(bucketSteps);
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

    // 1c. Fetch Sleep Segment (Raw Dataset - Sleep segment is not aggregateable via body)
    const dailySleepMap: { [dateStr: string]: number } = {};
    try {
      const startNanosStr = startTimeMillis + "000000";
      const endNanosStr = endTimeMillis + "000000";
      const sleepDataSource = "derived:com.google.sleep.segment:com.google.android.gms:merged";
      const sleepResponse = await client.request({
        url: `https://www.googleapis.com/fitness/v1/users/me/dataSources/${sleepDataSource}/datasets/${startNanosStr}-${endNanosStr}`,
        method: "GET"
      }) as any;

      if (sleepResponse.data && sleepResponse.data.point) {
        sleepResponse.data.point.forEach((point: any) => {
          const sleepStatus = point.value[0]?.intVal;
          // sleepStatus: 1=Awake, 2=Sleep, 3=Out of bed, 4=Light, 5=Deep, 6=REM.
          // Count only real sleep stages (2, 4, 5, 6)
          if (sleepStatus && sleepStatus !== 1 && sleepStatus !== 3) {
            const startMs = Math.round(parseInt(point.startTimeNanos) / 1000000);
            const endMs = Math.round(parseInt(point.endTimeNanos) / 1000000);
            if (startMs && endMs && endMs > startMs) {
              const durationHours = (endMs - startMs) / (1000 * 60 * 60);
              const dateStr = new Date(startMs).toDateString();
              dailySleepMap[dateStr] = parseFloat(((dailySleepMap[dateStr] || 0) + durationHours).toFixed(1));
            }
          }
        });
      }
    } catch (e: any) {
      console.warn("Sleep dataset fetch warning (user might not have granted sleep scope or raw sleep data is missing):", e?.message || e);
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
      const durationMins = Math.max(1, Math.round((sEnd - sStart) / 60000));

      const statsResponse = await client.request({
        url: "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
        method: "POST",
        data: {
          aggregateBy: [
            { dataTypeName: "com.google.heart_rate.bpm" },
            { dataTypeName: "com.google.calories.expended" },
            { dataTypeName: "com.google.distance.delta" }
          ],
          bucketByTime: { durationMillis: Math.max(1, sEnd - sStart) },
          startTimeMillis: sStart,
          endTimeMillis: sEnd
        }
      }) as any;

      let avgHeartRate = 0;
      let totalCalories = 0;
      let totalDistance = 0;

      if (statsResponse.data.bucket && statsResponse.data.bucket[0]) {
        const heartRateSet = statsResponse.data.bucket[0].dataset.find((ds: any) => ds.dataSourceId?.includes("heart_rate"));
        const caloriesSet = statsResponse.data.bucket[0].dataset.find((ds: any) => ds.dataSourceId?.includes("calories"));
        const distanceSet = statsResponse.data.bucket[0].dataset.find((ds: any) => ds.dataSourceId?.includes("distance"));

        if (heartRateSet?.point && heartRateSet.point.length > 0) {
          const sumHr = heartRateSet.point.reduce((acc: number, p: any) => acc + (p.value?.[0]?.fpVal || p.value?.[0]?.intVal || 0), 0);
          avgHeartRate = Math.round(sumHr / heartRateSet.point.length);
        }

        if (caloriesSet?.point) {
          caloriesSet.point.forEach((p: any) => {
            if (p.value && p.value[0]) {
              totalCalories += (p.value[0].fpVal || p.value[0].intVal || 0);
            }
          });
          totalCalories = Math.round(totalCalories);
        }

        if (distanceSet?.point) {
          distanceSet.point.forEach((p: any) => {
            if (p.value && p.value[0]) {
              // Convert meters to miles
              totalDistance += ((p.value[0].fpVal || 0) * 0.000621371);
            }
          });
          totalDistance = parseFloat(totalDistance.toFixed(2));
        }
      }

      const activityTypeName = FIT_ACTIVITY_MAP[session.activityType] || session.name || `Activity ${session.activityType}`;
      const suggestedCategory = getSuggestedCategory(session.activityType, session.name, durationMins, avgHeartRate);

      return {
        id: session.id,
        name: session.name || activityTypeName,
        activityTypeName,
        type: session.activityType,
        startTime: sStart,
        endTime: sEnd,
        durationMins,
        avgHeartRate,
        calories: totalCalories,
        distance: totalDistance,
        suggestedCategory
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
  const isDev = process.argv.includes("--dev") || process.env.NODE_ENV === "development";
  const isProduction = !isDev && (process.env.NODE_ENV === "production" || process.argv.includes("--production") || fs.existsSync(path.join(process.cwd(), "dist", "index.html")));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Transform and serve index.html for all non-API navigation requests in dev
    app.use("*", async (req, res, next) => {
      if (req.originalUrl.startsWith("/api")) {
        return next();
      }
      try {
        const indexPath = path.resolve(process.cwd(), "index.html");
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
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
