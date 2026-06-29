// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://0245cf49cfff0423ea7d4f36eabeaac5@o4510254790148096.ingest.us.sentry.io/4511642499678208",

  // Keep production tracing useful without sending every request.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

  sendDefaultPii: false,
});
