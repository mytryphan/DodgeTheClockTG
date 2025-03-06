const { Client, query: q } = require('faunadb');

const client = new Client({
  secret: process.env.FAUNADB_SECRET
});

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const data = JSON.parse(event.body);
    console.log("Received data:", data);
    const { mode, name, score } = data;
    if (!mode || !name || typeof score !== "number") {
      console.error("Invalid parameters", data);
      return { statusCode: 400, body: "Missing or invalid parameters" };
    }
    const result = await client.query(
      q.Create(q.Collection("scores"), { data: { mode, name, score } })
    );
    console.log("FaunaDB result:", result);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, result })
    };
  } catch (err) {
    console.error("Error in submit-score function:", err);
    return { statusCode: 500, body: "Server Error" };
  }
};
