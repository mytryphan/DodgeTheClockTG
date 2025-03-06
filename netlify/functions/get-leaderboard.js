// We use the same in-memory leaderboard object as in submit-score.js
// IMPORTANT: In a real-world scenario, both functions would access the same persistent data (a database).
let leaderboards = {
    normal: [],
    asian: []
  };
  
  exports.handler = async (event, context) => {
    // Get the "mode" parameter from the query string
    const mode = event.queryStringParameters.mode;
    if (!mode || !leaderboards[mode]) {
      return { statusCode: 400, body: "Invalid mode" };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ leaderboard: leaderboards[mode] })
    };
  };
  