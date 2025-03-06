// netlify/functions/submit-score.js
const faunadb = require('faunadb');
const q = faunadb.query;

const client = new faunadb.Client({
  secret: process.env.FAUNADB_SECRET
});

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
    // Create a new document in the "scores" collection
    const result = await client.query(
      q.Create(
        q.Collection("scores"),
        { data: { mode, name, score } }
      )
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, result })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Server Error" };
  }
};
