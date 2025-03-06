// In-memory leaderboard object
// (Note: This data resets on every cold start; for production, connect to a database.)
let leaderboards = {
    normal: [],
    asian: []
  };
  
  exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    try {
      const data = JSON.parse(event.body);
      const { mode, name, score } = data;
      if (!mode || !name || typeof score !== "number") {
        return { statusCode: 400, body: "Missing or invalid parameters" };
      }
      // Add score to the correct leaderboard
      leaderboards[mode].push({ name, score });
      // Sort descending and trim to top 10
      leaderboards[mode].sort((a, b) => b.score - a.score);
      if (leaderboards[mode].length > 10) {
        leaderboards[mode] = leaderboards[mode].slice(0, 10);
      }
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, leaderboard: leaderboards[mode] })
      };
    } catch (err) {
      return { statusCode: 500, body: "Server Error" };
    }
  };
  