const { google } = require("googleapis");

/**
 * Build an authenticated Google Calendar client using a service account.
 * The service account must have domain-wide delegation to read calendars.
 */
function getCalendarClient(email) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON env var");

  const credentials = JSON.parse(raw);

  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ["https://www.googleapis.com/auth/calendar.readonly"],
    email // impersonate this user
  );

  return google.calendar({ version: "v3", auth });
}

/**
 * Fetch today's and tomorrow's calendar events for a given email.
 * @param {string} email - The user's email address
 * @returns {Promise<Array>} Events with title, time, attendees, meet link
 */
async function fetchEvents(email) {
  const calendar = getCalendarClient(email);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Fetch through end of current work week (Friday)
  const dayOfWeek = startOfToday.getDay(); // 0=Sun, 1=Mon...
  const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 0;
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + daysUntilFriday + 1); // +1 to include Friday

  const { data } = await calendar.events.list({
    calendarId: email,
    timeMin: startOfToday.toISOString(),
    timeMax: endOfWeek.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return (data.items || []).map((event) => ({
    id: event.id,
    title: event.summary || "(No title)",
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    attendees: (event.attendees || []).map((a) => a.email),
    meet_link: event.hangoutLink || null,
  }));
}

module.exports = { fetchEvents };
